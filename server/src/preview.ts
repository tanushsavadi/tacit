// Private voice preview: the user listens to a voice on THIS Mac's own sound output before choosing it.
// Never the virtual microphone, never the speech queue, never an output authorization. Refused when the Mac's sound
// output is a virtual device that apps can read as a microphone (BlackHole, ZoomAudioDevice…) or an aggregate that
// contains one — then a preview would be heard in the call. One preview at a time; Stop ends it at once.
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { VoicePreviewState } from '../../shared/protocol.ts';
import type { RouteDevice } from './route.ts';
import type { TtsResult } from './tts.ts';
import { MAX_PREVIEW_CHARS, SAMPLE_PHRASES, type BindResult, type VoiceBinding } from './voices.ts';

const run = promisify(execFile);

export interface PreviewSafety { ok: boolean; reason: string | null; output: string | null }

/** Pure decision from the device list. `aggregates[uid]` = aggregate device UIDs containing that device. */
export function previewSafetyFrom(i: { devices: RouteDevice[]; defaultOutput: string | null; aggregates: Record<string, string[]>; routeUid: string | null }): PreviewSafety {
  const out = i.devices.find((d) => d.uid === i.defaultOutput) ?? null;
  if (!i.defaultOutput || !out) return { ok: false, reason: 'No sound output device found on this Mac.', output: null };
  const loopback = i.devices.filter((d) => d.uid === i.routeUid || (d.transport === 'virtual' && d.inputChannels > 0));
  const call = 'a preview would be heard by anyone using it as a microphone (e.g. your call). Choose your speakers or headphones as the Mac\'s sound output.';
  if (loopback.some((d) => d.uid === out.uid)) return { ok: false, reason: `Your Mac's sound output is "${out.name}", a virtual microphone device: ${call}`, output: out.name };
  const inside = loopback.find((d) => (i.aggregates[d.uid] ?? []).includes(out.uid));
  if (inside) return { ok: false, reason: `Your Mac's sound output "${out.name}" includes "${inside.name}": ${call}`, output: out.name };
  return { ok: true, reason: null, output: out.name };
}

/** Ask tacit-route (read-only: `list`, `diagnose`) where the Mac's sound goes. Unknown = refuse. */
export async function checkPreviewSafety(bin: string | null, routeUid: string | null): Promise<PreviewSafety> {
  if (!bin) return { ok: false, reason: "Cannot verify that your Mac's sound output is not a virtual microphone (tacit-route is not built).", output: null };
  try {
    const { stdout } = await run(bin, ['list'], { timeout: 5000 });
    const l = JSON.parse(stdout) as { devices: RouteDevice[]; defaultOutput: string | null };
    const aggregates: Record<string, string[]> = {};
    for (const d of l.devices.filter((x) => x.uid === routeUid || (x.transport === 'virtual' && x.inputChannels > 0))) {
      const r = await run(bin, ['diagnose', '--device-uid', d.uid], { timeout: 5000 }).catch(() => null);
      const diag = r ? JSON.parse(r.stdout) as { aggregatesContaining?: string[] } : null;
      if (!diag) return { ok: false, reason: `Could not check whether your sound output includes "${d.name}".`, output: null };
      aggregates[d.uid] = diag.aggregatesContaining ?? [];
    }
    return previewSafetyFrom({ devices: l.devices, defaultOutput: l.defaultOutput, aggregates, routeUid });
  } catch (e) {
    return { ok: false, reason: `Could not check the Mac's sound output: ${e instanceof Error ? e.message : String(e)}`, output: null };
  }
}

export interface Playback { done: Promise<{ ok: boolean; reason?: string }>; stop(): void }
export type Player = (path: string) => Playback;

/** `afplay` plays to the system default output device; killing it stops the sound immediately. */
export const afplay: Player = (path) => {
  const child = spawn('afplay', [path], { stdio: 'ignore' });
  const done = new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    child.on('error', (e) => resolve({ ok: false, reason: e.message }));
    child.on('exit', (code, sig) => resolve(code === 0 ? { ok: true } : { ok: false, reason: sig ? `stopped (${sig})` : `afplay exited ${code}` }));
  });
  return { done, stop: () => { child.kill('SIGTERM'); } };
};

interface PreviewVoices {
  bindPreview(s: { voiceId: unknown; rate?: unknown; pitch?: unknown }): BindResult;
  synth(text: string, format: 'file', signal: AbortSignal, binding: VoiceBinding): Promise<TtsResult>;
}

interface Active { st: VoicePreviewState; abort: AbortController; playback: Playback | null; dir: string | null }

export class VoicePreview extends EventEmitter {
  private active: Active | null = null;

  constructor(private readonly voices: PreviewVoices, private readonly safety: () => Promise<PreviewSafety>,
              private readonly player: Player = afplay, private readonly now = () => Date.now()) { super(); }

  private emitState(a: Active): void { this.emit('preview', { ...a.st, timings: { ...a.st.timings } }); }

  private end(a: Active, state: 'done' | 'stopped' | 'refused' | 'failed', reason: string | null): void {
    if (['done', 'stopped', 'refused', 'failed'].includes(a.st.state)) return; // exactly one terminal state
    a.st.state = state; a.st.reason = reason; a.st.timings.endedAt = this.now();
    if (this.active === a) this.active = null;
    a.abort.abort();
    a.playback?.stop();
    if (a.dir) void rm(a.dir, { recursive: true, force: true });
    this.emitState(a);
  }

  stop(reason = 'Preview stopped.'): void { if (this.active) this.end(this.active, 'stopped', reason); }

  async start(msg: { previewId?: unknown; voiceId?: unknown; rate?: unknown; pitch?: unknown; text?: unknown; sample?: unknown }): Promise<void> {
    const previewId = typeof msg.previewId === 'string' && msg.previewId && msg.previewId.length <= 100 ? msg.previewId : `invalid-${this.now()}`;
    const sample = Number.isInteger(msg.sample) ? SAMPLE_PHRASES[msg.sample as number] : undefined;
    const text = typeof msg.text === 'string' ? msg.text : sample ?? (msg.sample === undefined ? SAMPLE_PHRASES[0]! : '');
    const a: Active = { abort: new AbortController(), playback: null, dir: null,
      st: { previewId, voiceId: typeof msg.voiceId === 'string' ? msg.voiceId.slice(0, 300) : '', text: text.slice(0, MAX_PREVIEW_CHARS),
        state: 'synthesizing', reason: null, output: null, timings: { requestedAt: this.now() } } };
    this.stop('Replaced by a newer preview.');
    const refuse = (reason: string) => this.end(a, 'refused', reason);
    if (previewId.startsWith('invalid-')) return refuse('Missing previewId.');
    if (!text.trim()) return refuse(typeof msg.text === 'string' ? 'Nothing to preview.' : 'Unknown sample phrase.');
    if (text.length > MAX_PREVIEW_CHARS) return refuse(`Preview text longer than ${MAX_PREVIEW_CHARS} characters.`);
    const b = this.voices.bindPreview({ voiceId: msg.voiceId, rate: msg.rate, pitch: msg.pitch });
    if (!b.ok) return refuse(b.reason);
    this.active = a;
    this.emitState(a);
    let audio: TtsResult;
    try { audio = await this.voices.synth(text, 'file', a.abort.signal, b.binding); } catch (e) {
      if (this.active === a) this.end(a, 'failed', `Could not render the preview: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (this.active !== a) return;
    a.st.timings.synthEndAt = this.now();
    const safe = await this.safety(); // checked right before playback
    if (this.active !== a) return;
    a.st.output = safe.output;
    if (!safe.ok) return refuse(safe.reason ?? 'The Mac\'s sound output could not be verified.');
    try {
      a.dir = await mkdtemp(join(tmpdir(), 'tacit-preview-'));
      const path = join(a.dir, audio.mime.includes('mpeg') ? 'preview.mp3' : 'preview.wav');
      await writeFile(path, audio.audio, { mode: 0o600 });
      if (this.active !== a) return;
      a.playback = this.player(path);
    } catch (e) {
      return this.end(a, 'failed', `Could not play the preview: ${e instanceof Error ? e.message : String(e)}`);
    }
    a.st.state = 'playing'; a.st.timings.playStartAt = this.now();
    this.emitState(a);
    const r = await a.playback.done;
    if (this.active === a) this.end(a, r.ok ? 'done' : 'failed', r.ok ? null : `Playback failed: ${r.reason ?? 'unknown'}`);
  }
}
