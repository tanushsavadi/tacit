// Supervises macos/TacitRoute (`tacit-route serve`): the helper that plays TTS audio into ONE selected output device
// (BlackHole), which calling apps use as their microphone. Local observations only — "rendered" never means heard.
import { spawn as nodeSpawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { VoiceRouteStatus } from '../../shared/protocol.ts';

const ROUTE_DIR = fileURLToPath(new URL('../../macos/TacitRoute/', import.meta.url));
export const CALIBRATION_FILE = fileURLToPath(new URL('../data/route-calibration.json', import.meta.url));

export function routeBinary(): string | null {
  for (const cfg of ['release', 'debug']) {
    const p = join(ROUTE_DIR, '.build', cfg, 'tacit-route');
    if (existsSync(p)) return p;
  }
  return null;
}

export interface RouteDevice { uid: string; name: string; inputChannels: number; outputChannels: number; sampleRate: number; transport: string }

export async function listDevices(bin: string): Promise<{ devices: RouteDevice[]; defaultOutput: string | null; defaultInput: string | null }> {
  const { stdout } = await promisify(execFile)(bin, ['list'], { timeout: 5000 });
  return JSON.parse(stdout);
}

/** The virtual mic: env TACIT_ROUTE_DEVICE_UID, else a BlackHole device with both sides (2ch preferred). */
export function pickDevice(devices: RouteDevice[], wanted = process.env.TACIT_ROUTE_DEVICE_UID): RouteDevice | null {
  if (wanted) return devices.find((d) => d.uid === wanted) ?? null;
  const bh = devices.filter((d) => /^BlackHole/i.test(d.name) && d.inputChannels > 0 && d.outputChannels > 0);
  return bh.find((d) => d.inputChannels === 2) ?? bh[0] ?? null;
}

/** Gain = env TACIT_ROUTE_GAIN_DB, else the measured route loss from `npm run route:check` (clamped 0–24 dB). */
export function routeGain(uid: string): { gainDb: number; calibrated: boolean } {
  const env = process.env.TACIT_ROUTE_GAIN_DB;
  if (env !== undefined && env !== '' && Number.isFinite(Number(env))) return { gainDb: Number(env), calibrated: true };
  try {
    const c = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf8')) as { uid: string; routeGainDb: number };
    if (c.uid === uid && Number.isFinite(c.routeGainDb)) return { gainDb: Math.min(24, Math.max(0, -c.routeGainDb)), calibrated: true };
  } catch { /* not calibrated yet */ }
  return { gainDb: 0, calibrated: false };
}

export type PlayOutcome =
  | { state: 'rendered'; startedAt: number; renderedAt: number }
  | { state: 'interrupted' | 'failed'; reason: string; startedAt?: number };

/** What the speech orchestrator needs from an output route (the helper, or a fake in tests). */
export interface OutputRoute extends EventEmitter {
  status(): VoiceRouteStatus;
  /** Resolves exactly once. `onStarted` fires when the audio became the audible head of the queue. */
  play(id: string, audio: Buffer, mime: string, onStarted?: (t: number) => void): Promise<PlayOutcome>;
  /** Cut current and queued audio now. */
  stop(reason: string): void;
}

interface Open { resolve: (o: PlayOutcome) => void; onStarted?: (t: number) => void; startedAt?: number; dir: string }
type Spawn = (bin: string, args: string[]) => ChildProcess;

export class RouteHelper extends EventEmitter implements OutputRoute {
  private child: ChildProcess | null = null;
  private open = new Map<string, Open>();
  private pendingIds = new Set<string>();
  private stopEpoch = 0;
  private writes: Promise<void> = Promise.resolve();
  private st: VoiceRouteStatus;
  private restarts = 0;
  private closed = false;
  /** Gave up restarting; the server replaces this helper on its next periodic check. */
  exhausted = false;
  static STOP_ACK_MS = 750;

  constructor(private bin: string, private device: RouteDevice, private gain: { gainDb: number; calibrated: boolean },
              private spawnFn: Spawn = (b, a) => nodeSpawn(b, a, { stdio: ['pipe', 'pipe', 'pipe'] })) {
    super();
    this.st = { state: 'starting', deviceName: device.name, deviceUid: device.uid, sampleRate: null, gainDb: gain.gainDb,
      calibrated: gain.calibrated, readers: null, warnings: [], reason: null };
    if (!gain.calibrated) this.st.warnings.push('route gain not calibrated: run `cd server && npm run route:check`');
    this.launch();
  }

  status(): VoiceRouteStatus { return { ...this.st, warnings: [...this.st.warnings], readers: this.st.readers && [...this.st.readers] }; }

  private set(patch: Partial<VoiceRouteStatus>): void {
    this.st = { ...this.st, ...patch };
    this.emit('status', this.status());
  }

  private launch(): void {
    const child = this.spawnFn(this.bin, ['serve', '--device-uid', this.device.uid, '--gain-db', String(this.gain.gainDb)]);
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', (l) => this.onLine(l));
    child.stderr?.on('data', () => { /* helper never prints content; ignore */ });
    // A write to a helper that just died raises EPIPE on stdin; unhandled, it would crash the whole server.
    child.stdin?.on('error', () => { if (this.child === child) this.child = null; this.failAll('route helper pipe closed'); });
    child.on('error', (e) => { this.exhausted = true; this.set({ state: 'error', reason: `route helper failed to start: ${e.message}` }); });
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      this.failAll('route helper exited');
      if (this.closed) return;
      this.set({ state: 'error', reason: `route helper exited (${code}); restarting` });
      if (++this.restarts <= 5) setTimeout(() => !this.closed && this.launch(), 500 * this.restarts).unref();
      else { this.exhausted = true; this.set({ reason: 'route helper keeps exiting; TACIT will retry in 15 s' }); }
    });
  }

  private onLine(line: string): void {
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { return; }
    const now = Date.now();
    const id = typeof e.id === 'string' ? e.id : '';
    const diag = (e.diagnostics ?? null) as { warnings?: string[]; inputReaders?: { bundleID: string }[] | null } | null;
    switch (e.event) {
      case 'ready': case 'device_restored': case 'route_reset':
        this.restarts = 0;
        this.set({ state: 'ready', sampleRate: Number(e.sampleRate) || null, reason: null, ...(diag ? this.diagPatch(diag) : {}) });
        break;
      case 'status':
        if (diag) this.set(this.diagPatch(diag));
        break;
      case 'device_lost':
        this.set({ state: 'unavailable', reason: `virtual microphone unavailable: ${String(e.message ?? 'device removed')}` });
        break;
      case 'started': {
        const o = this.open.get(id);
        if (o) { o.startedAt = now; o.onStarted?.(now); }
        break;
      }
      case 'finished': this.settle(id, { state: 'rendered', startedAt: this.open.get(id)?.startedAt ?? now, renderedAt: now }); break;
      case 'interrupted': this.settle(id, { state: 'interrupted', reason: String(e.reason ?? 'interrupted'), startedAt: this.open.get(id)?.startedAt }); break;
      case 'rejected': this.settle(id, { state: 'failed', reason: String(e.reason ?? 'rejected by route') }); break;
      case 'error': if (id) this.settle(id, { state: 'failed', reason: String(e.message ?? 'route error') }); break;
    }
  }

  private diagPatch(d: { warnings?: string[]; inputReaders?: { bundleID: string }[] | null }): Partial<VoiceRouteStatus> {
    const warnings = [...(d.warnings ?? [])];
    if (!this.gain.calibrated) warnings.push('route gain not calibrated: run `cd server && npm run route:check`');
    return { warnings, readers: d.inputReaders ? d.inputReaders.map((r) => r.bundleID) : null };
  }

  /** Ask the helper for fresh diagnostics (which apps read the virtual mic, warnings). */
  refresh(): void { this.send({ op: 'status' }); }

  private send(o: object): boolean {
    if (!this.child?.stdin?.writable) return false;
    this.child.stdin.write(`${JSON.stringify(o)}\n`);
    return true;
  }

  private settle(id: string, o: PlayOutcome): void {
    const p = this.open.get(id);
    if (!p) return;
    this.open.delete(id);
    void rm(p.dir, { recursive: true, force: true });
    p.resolve(o);
  }

  private failAll(reason: string): void {
    for (const id of [...this.open.keys()]) this.settle(id, { state: 'interrupted', reason, startedAt: this.open.get(id)?.startedAt });
  }

  async play(id: string, audio: Buffer, mime: string, onStarted?: (t: number) => void): Promise<PlayOutcome> {
    if (this.st.state !== 'ready' || !this.child) return { state: 'failed', reason: this.st.reason ?? `virtual microphone ${this.st.state}` };
    if (this.open.has(id) || this.pendingIds.has(id)) return { state: 'failed', reason: 'duplicate id' };
    this.pendingIds.add(id);
    const epoch = this.stopEpoch;
    // File writes are async: chain them so requests reach the helper's FIFO in call order.
    const prepared = this.writes.then(async () => {
      const dir = await mkdtemp(join(tmpdir(), 'tacit-route-')); // 0700, removed when the request settles
      const path = join(dir, mime.includes('mpeg') ? 'speech.mp3' : 'speech.wav');
      await writeFile(path, audio, { mode: 0o600 });
      return { dir, path };
    });
    this.writes = prepared.then(() => undefined, () => undefined);
    return new Promise<PlayOutcome>((resolve) => {
      prepared.then(({ dir, path }) => {
        this.pendingIds.delete(id);
        if (epoch !== this.stopEpoch) { // stop() arrived while the audio was being staged: never send it
          void rm(dir, { recursive: true, force: true });
          return resolve({ state: 'interrupted', reason: 'stopped before playback' });
        }
        this.open.set(id, { resolve, onStarted, dir });
        if (!this.send({ op: 'play', id, path })) this.settle(id, { state: 'failed', reason: 'route helper not running' });
      }, (e: unknown) => { this.pendingIds.delete(id); resolve({ state: 'failed', reason: `could not stage audio: ${e instanceof Error ? e.message : String(e)}` }); });
    });
  }

  stop(reason: string): void {
    this.stopEpoch++;
    if (!this.send({ op: 'stop', reason })) return this.failAll(reason);
    // Enforce the stop: if the helper does not answer for what it holds, kill it (audio ends with the process).
    const held = [...this.open.keys()];
    if (!held.length) return;
    const child = this.child;
    setTimeout(() => {
      if (!held.some((id) => this.open.has(id))) return;
      console.warn('[route] helper did not acknowledge stop; killing it');
      child?.kill('SIGKILL');
      this.failAll(`${reason} (route helper unresponsive; stopped by force)`);
    }, RouteHelper.STOP_ACK_MS).unref();
  }

  close(): void {
    this.closed = true;
    this.send({ op: 'quit' });
    this.child?.stdin?.end();
    for (const o of this.open.values()) rmSync(o.dir, { recursive: true, force: true }); // sync: process may exit next
    this.failAll('server shutting down');
  }
}

/** Remove staged speech audio left by a previous run that exited abruptly (older than a minute). */
export function sweepStaleAudio(dir = tmpdir()): number {
  let n = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith('tacit-route-')) continue;
      const p = join(dir, f);
      if (Date.now() - statSync(p).mtimeMs > 60_000) { rmSync(p, { recursive: true, force: true }); n++; }
    }
  } catch { /* best effort */ }
  return n;
}

/** Status to report when no helper could be started (binary missing, no BlackHole, not macOS). */
export function unconfiguredRoute(reason: string, device: RouteDevice | null = null): VoiceRouteStatus {
  return { state: device ? 'unavailable' : 'unconfigured', deviceName: device?.name ?? null, deviceUid: device?.uid ?? null, sampleRate: null,
    gainDb: 0, calibrated: false, readers: null, warnings: [], reason };
}
