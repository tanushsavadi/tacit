import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { LiveStatus, RecognitionHypothesis, SpeechDelivery, VoiceRouteStatus } from '../../shared/protocol.ts';
import type { OutputRoute, PlayOutcome } from './route.ts';
import { SpeechOutput } from './speech.ts';
import type { Tts } from './tts.ts';
import { MyVoice, SYSTEM_DEFAULT_ID, VoiceHelper, type AppleCatalog, type BindResult, type HelperRender, type VoiceBinding, type VoiceEngine } from './voices.ts';

const bound = (r: BindResult): VoiceBinding => { if (!r.ok) throw new Error(r.reason); return r.binding; };

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const SAM = 'com.apple.voice.compact.en-US.Samantha';
const REED = 'com.apple.eloquence.en-GB.Reed';
const catalog: AppleCatalog = {
  defaultVoice: SAM, personalVoiceAuthorization: 'denied',
  voices: [
    { identifier: SAM, name: 'Samantha', language: 'en-US', quality: 'default', novelty: false, personal: false },
    { identifier: REED, name: 'Reed', language: 'en-GB', quality: 'default', novelty: false, personal: false },
    { identifier: 'com.apple.speech.synthesis.voice.Bells', name: 'Bells', language: 'en-US', quality: 'default', novelty: true, personal: false },
    { identifier: 'com.apple.personal.123', name: 'My Personal Voice', language: 'en-US', quality: 'premium', novelty: false, personal: true },
  ],
};

class FakeEngine extends EventEmitter implements VoiceEngine {
  state: VoiceEngine['state'] = 'ready';
  reason: string | null = null;
  catalog: AppleCatalog | null = structuredClone(catalog);
  renders: { voice: string; text: string; rate?: number; pitch?: number }[] = [];
  hold: Promise<void> | null = null;
  peak = 0.7;
  async refresh() { return this.catalog; }
  async render(o: { voice: string; text: string; rate?: number; pitch?: number }, signal?: AbortSignal): Promise<HelperRender> {
    this.renders.push(o);
    if (this.hold) await this.hold;
    if (signal?.aborted) throw new Error('cancelled');
    return { wav: Buffer.from(`RIFF:${o.voice}`), sampleRate: 22050, durationMs: 1000, firstBufferMs: 10, totalMs: 50, peak: this.peak };
  }
  set(patch: Partial<Pick<FakeEngine, 'state' | 'catalog' | 'reason'>>) { Object.assign(this, patch); this.emit('change'); }
}

const sayCalls: string[] = [];
const system: Tts = { label: 'macos-say (system voice, not personal)', personal: false, async synth(text) {
  sayCalls.push(text); return { audio: Buffer.from('RIFF:say'), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'macos-say' };
} };

function make(opts: { engine?: FakeEngine | null; prefsPath?: string; personal?: MyVoiceOptsPersonal } = {}) {
  const engine = opts.engine === undefined ? new FakeEngine() : opts.engine;
  const prefsPath = opts.prefsPath ?? join(mkdtempSync(join(tmpdir(), 'tacit-voice-test-')), 'voice-prefs.json');
  const mv = new MyVoice({ engine, system, personal: opts.personal ?? null, prefsPath, now: () => 1_000 });
  return { mv, engine, prefsPath };
}
type MyVoiceOptsPersonal = ConstructorParameters<typeof MyVoice>[0]['personal'];

describe('MyVoice registry', () => {
  it('lists installed voices with stable ids, flags novelty, never offers Apple Personal Voice, and always has the system default', () => {
    const { mv } = make();
    const s = mv.status();
    const ids = s.voices.map((v) => v.id);
    expect(ids).toEqual([`apple:${SAM}`, `apple:${REED}`, 'apple:com.apple.speech.synthesis.voice.Bells', 'apple:com.apple.personal.123', SYSTEM_DEFAULT_ID]);
    expect(s.voices[0]).toMatchObject({ name: 'Samantha', locale: 'en-US', language: 'en', provider: 'apple-speech', available: true, local: true, novelty: false });
    expect(s.voices[0]!.controls.rate).toMatchObject({ min: 0.3, max: 0.7, default: 0.5 });
    expect(s.voices[2]!.novelty).toBe(true);
    expect(s.voices[3]).toMatchObject({ kind: 'apple-personal-voice', available: false, controls: {} });
    expect(s.voices[3]!.unavailableReason).toMatch(/does not allow apps to capture/);
    expect(s.applePersonalVoice).toMatchObject({ authorization: 'denied', usableInCalls: false });
    expect(JSON.stringify(s.voices)).not.toMatch(/gender|male|female/i);
  });

  it('defaults: macOS default voice via the engine; system:default without the helper; the consented clone when configured', () => {
    expect(make().mv.status().effective.voiceId).toBe(`apple:${SAM}`);
    const noHelper = make({ engine: null }).mv.status();
    expect(noHelper.effective.voiceId).toBe(SYSTEM_DEFAULT_ID);
    expect(noHelper.engine.state).toBe('unavailable');
    const clone = make({ personal: { tts: system, voiceId: 'el1', available: () => true, reason: () => null } }).mv.status();
    expect(clone.effective.voiceId).toBe('elevenlabs:el1');
    expect(clone.selected.source).toBe('default');
  });
});

describe('MyVoice selection + persistence', () => {
  it('persists a valid choice (0600) and restores it on restart', () => {
    const { mv, prefsPath } = make();
    const r0 = mv.status().revision;
    expect(mv.select({ requestId: 'q1', voiceId: `apple:${REED}`, rate: 0.45 })).toEqual({ ok: true, reason: null });
    const s = mv.status();
    expect(s).toMatchObject({ selected: { voiceId: `apple:${REED}`, rate: 0.45, source: 'user' }, effective: { voiceId: `apple:${REED}`, rate: 0.45 }, persisted: true, fallback: null,
      lastChange: { requestId: 'q1', ok: true } });
    expect(s.revision).toBe(r0 + 1);
    expect(statSync(prefsPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(prefsPath, 'utf8'))).toMatchObject({ version: 1, voiceId: `apple:${REED}`, rate: 0.45 });
    const again = make({ prefsPath }).mv.status();
    expect(again.selected).toMatchObject({ voiceId: `apple:${REED}`, rate: 0.45, source: 'saved' });
    expect(again.effective.label).toMatch(/^Reed \(en-GB, macOS voice, on this Mac; rate 0.45\)$/);
  });

  it('refuses unknown/unavailable voices and unsupported or out-of-range controls without changing anything', () => {
    const { mv, prefsPath } = make();
    const before = mv.status();
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ voiceId: 'apple:com.apple.nope' }, /not installed/],
      [{ voiceId: 'apple:com.apple.personal.123' }, /unavailable: Apple Personal Voice/],
      [{ voiceId: `apple:${SAM}`, rate: 0.95 }, /rate must be between 0.3 and 0.7/],
      [{ voiceId: `apple:${SAM}`, pitch: 3 }, /pitch must be between/],
      [{ voiceId: `apple:${SAM}`, rate: '0.5' }, /rate must be/],
      [{ voiceId: SYSTEM_DEFAULT_ID, rate: 0.4 }, /does not support adjusting rate/],
      [{ voiceId: 42 }, /Unknown voice/],
    ];
    for (const [msg, re] of cases) {
      const r = mv.select(msg as { voiceId: unknown });
      expect(r.ok, JSON.stringify(msg)).toBe(false);
      expect(r.reason).toMatch(re);
      expect(mv.status().lastChange).toMatchObject({ ok: false });
    }
    expect(mv.status().effective).toEqual(before.effective);
    expect(mv.status().revision).toBe(before.revision);
    expect(existsSync(prefsPath)).toBe(false);
  });

  it('reset (voiceId null) returns to the default and deletes the stored choice', () => {
    const { mv, prefsPath } = make();
    mv.select({ voiceId: `apple:${REED}` });
    expect(existsSync(prefsPath)).toBe(true);
    expect(mv.select({ voiceId: null }).ok).toBe(true);
    expect(existsSync(prefsPath)).toBe(false);
    expect(mv.status().selected).toMatchObject({ voiceId: `apple:${SAM}`, source: 'default' });
  });

  it('a saved voice that is unavailable falls back visibly to the macOS default, and returns when it is back', () => {
    const { mv, engine, prefsPath } = make();
    mv.select({ voiceId: `apple:${REED}` });
    const e2 = new FakeEngine();
    e2.catalog = { ...catalog, voices: catalog.voices.filter((v) => v.identifier !== REED) }; // uninstalled
    const { mv: mv2 } = make({ prefsPath, engine: e2 });
    const s = mv2.status();
    expect(s.selected.voiceId).toBe(`apple:${REED}`);
    expect(s.effective.voiceId).toBe(SYSTEM_DEFAULT_ID);
    expect(s.fallback).toMatch(/Your chosen voice is unavailable|not installed/);
    expect(s.effective.label).toMatch(/fallback: your chosen voice is unavailable/);
    const r = s.revision;
    e2.set({ catalog: structuredClone(catalog) }); // reinstalled
    expect(mv2.status()).toMatchObject({ effective: { voiceId: `apple:${REED}` }, fallback: null });
    expect(mv2.status().revision).toBe(r + 1);
    void engine;
  });

  it('the engine starting up is a visible fallback, and an availability refresh that changes nothing does not bump the revision', async () => {
    const engine = new FakeEngine(); engine.state = 'starting'; engine.catalog = null;
    const { mv } = make({ engine });
    expect(mv.status().effective.voiceId).toBe(SYSTEM_DEFAULT_ID);
    engine.set({ state: 'ready', catalog: structuredClone(catalog) });
    const r = mv.status().revision;
    expect(mv.status().effective.voiceId).toBe(`apple:${SAM}`);
    await mv.refresh();
    expect(mv.status().revision).toBe(r);
  });

  it('a corrupt preference file is ignored with a reported error (default voice)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tacit-voice-test-'));
    const prefsPath = join(dir, 'voice-prefs.json');
    writeFileSync(prefsPath, '{not json');
    const s = make({ prefsPath }).mv.status();
    expect(s.selected.source).toBe('default');
    expect(s.persistError).toMatch(/unreadable/);
  });

  it('never substitutes another voice for an unavailable personal clone', async () => {
    let up = true;
    const cloneCalls: string[] = [];
    const clone: Tts = { label: 'elevenlabs', personal: true, async synth(t) { cloneCalls.push(t); if (!up) throw new Error('Personal voice unavailable. The system voice is not approved for this session'); return { audio: Buffer.from('mp3'), mime: 'audio/mpeg', requestTs: 0, firstByteTs: 0, voice: 'elevenlabs:el1' }; } };
    const { mv } = make({ personal: { tts: clone, voiceId: 'el1', available: () => up, reason: () => (up ? null : 'voice check failed') } });
    mv.select({ voiceId: 'elevenlabs:el1' });
    up = false; mv.changed();
    const s = mv.status();
    expect(s.effective.voiceId).toBe('elevenlabs:el1');
    expect(s.fallback).toBeNull();
    await expect(mv.synth('hello', 'file')).rejects.toThrow(/not approved/);
    expect(sayCalls).not.toContain('hello');
  });
});

describe('MyVoice synthesis', () => {
  it('passes the text unchanged with the bound voice and settings; a stale revision is refused', async () => {
    const { mv, engine: e } = make();
    const engine = e!;
    mv.select({ voiceId: `apple:${REED}`, rate: 0.4, pitch: 1.1 });
    const b = mv.bind(mv.status().revision);
    expect(b.ok).toBe(true);
    const text = "  I'd like [[slnc 3000]] tea.  ";
    const r = await mv.synth(text, 'file', undefined, bound(b));
    expect(engine.renders.at(-1)).toEqual({ voice: REED, text, rate: 0.4, pitch: 1.1 });
    expect(r).toMatchObject({ mime: 'audio/wav', voice: expect.stringMatching(/^Reed/) });
    expect(mv.bind(mv.status().revision - 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/voice changed/) });
    expect(mv.bind('3')).toMatchObject({ ok: false });
  });

  it('a bound Apple voice that fails or renders silence fails the request — no fallback voice', async () => {
    const { mv, engine: e } = make();
    const engine = e!;
    const b = bound(mv.bind(undefined));
    engine.peak = 0;
    await expect(mv.synth('hello', 'file', undefined, b)).rejects.toThrow(/silence/);
    engine.render = async () => { throw new Error('voice not installed: x'); };
    await expect(mv.synth('hello', 'file', undefined, b)).rejects.toThrow(/not installed/);
    expect(sayCalls).not.toContain('hello');
  });
});

// ───────────────────────────── SpeechOutput ⟷ MyVoice ─────────────────────────────

const routeReady: VoiceRouteStatus = { state: 'ready', deviceName: 'BlackHole 2ch', deviceUid: 'bh', sampleRate: 48000, gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null };
class FakeRoute extends EventEmitter implements OutputRoute {
  plays: { id: string; audio: Buffer; resolve: (o: PlayOutcome) => void }[] = [];
  stops: string[] = [];
  status() { return routeReady; }
  play(id: string, audio: Buffer) { return new Promise<PlayOutcome>((resolve) => this.plays.push({ id, audio, resolve })); }
  stop(reason: string) { this.stops.push(reason); for (const p of this.plays.splice(0)) p.resolve({ state: 'interrupted', reason }); }
  finishAll() { for (const p of this.plays.splice(0)) p.resolve({ state: 'rendered', startedAt: 1, renderedAt: 2 }); }
}

function speechRig() {
  const { mv, engine } = make();
  const route = new FakeRoute();
  const out = new SpeechOutput(mv, () => route, () => routeReady, undefined, undefined, mv);
  const deliveries: SpeechDelivery[] = [];
  out.on('delivery', (d) => deliveries.push(d));
  out.control('enable');
  const terminal = (id: string) => deliveries.find((d) => d.requestId === id && ['rendered', 'refused', 'interrupted', 'failed'].includes(d.state));
  return { mv, engine: engine!, route, out, deliveries, terminal };
}

describe('SpeechOutput with My Voice', () => {
  it('output_status reports the effective voice; a typed message is bound at acceptance and a later voice change does not alter it', async () => {
    const { mv, engine, route, out, deliveries, terminal } = speechRig();
    expect(out.status()).toMatchObject({ voiceId: `apple:${SAM}`, voiceRevision: mv.status().revision, voice: expect.stringMatching(/^Samantha/) });
    let release!: () => void;
    engine.hold = new Promise((r) => { release = r; });
    out.speakTyped({ requestId: 't1', outputAuthorizationId: out.status().authorizationId, text: 'Hello there', voiceRevision: mv.status().revision });
    await tick();
    expect(deliveries[0]).toMatchObject({ state: 'queued', voiceId: `apple:${SAM}`, voice: expect.stringMatching(/^Samantha/) });
    mv.select({ voiceId: `apple:${REED}` }); // user changes voice while t1 is synthesizing
    release(); await tick(); await tick();
    expect(engine.renders[0]).toMatchObject({ voice: SAM, text: 'Hello there' });
    expect(route.plays[0]!.audio.toString()).toBe(`RIFF:${SAM}`);
    route.finishAll(); await tick();
    expect(terminal('t1')).toMatchObject({ state: 'rendered', voiceId: `apple:${SAM}` });
    expect(out.status().voiceId).toBe(`apple:${REED}`);
  });

  it('a request still QUEUED when the voice changes keeps the voice it was approved with', async () => {
    const { mv, engine, route, out, terminal } = speechRig();
    let release!: () => void;
    engine.hold = new Promise((r) => { release = r; });
    const auth = out.status().authorizationId;
    out.speakTyped({ requestId: 'q1', outputAuthorizationId: auth, text: 'first' });
    out.speakTyped({ requestId: 'q2', outputAuthorizationId: auth, text: 'second' }); // waiting behind q1
    await tick();
    expect(engine.renders.map((r) => r.text)).toEqual(['first']);
    mv.select({ voiceId: `apple:${REED}`, pitch: 1.2 });
    out.speakTyped({ requestId: 'q3', outputAuthorizationId: auth, text: 'third' }); // approved under the new voice
    engine.hold = null; release();
    for (let i = 0; i < 6; i++) await tick();
    expect(engine.renders).toEqual([
      { voice: SAM, text: 'first', rate: undefined, pitch: undefined },
      { voice: SAM, text: 'second', rate: undefined, pitch: undefined },
      { voice: REED, text: 'third', rate: undefined, pitch: 1.2 },
    ]);
    route.finishAll(); await tick();
    expect(terminal('q2')).toMatchObject({ state: 'rendered', voiceId: `apple:${SAM}` });
    expect(terminal('q3')).toMatchObject({ state: 'rendered', voiceId: `apple:${REED}` });
  });

  it('a typed message written under an older voice is refused, never spoken with the new voice', async () => {
    const { mv, engine, out, terminal } = speechRig();
    const seen = mv.status().revision;
    mv.select({ voiceId: `apple:${REED}` });
    out.speakTyped({ requestId: 't2', outputAuthorizationId: out.status().authorizationId, text: 'Hi', voiceRevision: seen });
    await tick();
    expect(terminal('t2')).toMatchObject({ state: 'refused', reason: expect.stringMatching(/voice changed/) });
    expect(engine.renders).toHaveLength(0);
  });

  it('reviewed speech: a voice mismatch is refused WITHOUT consuming the utterance; the retry with the new revision speaks once', async () => {
    const { mv, engine, route, out, terminal } = speechRig();
    const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
    const live: LiveStatus = { authorizationId: 'L1', generation: 1, state: 'active', mode: 'display-only', autoTransmitAllowed: false, reason: '' };
    const target: RecognitionHypothesis = { utteranceId: 'u1', authorizationId: 'L1', rawText: 'I NEED HELP', final: true, stable: false, uncertainty: null, model: 'm',
      source: 'visual-model', decision: 'shown', reason: null, recognitionMs: 1, stages: null, gate: null, transmitted: false, generation: 1, alternatives: [],
      reviewExpiresAt: Date.now() + 60_000, reviewCandidates: [{ kind: 'raw', index: 0, text: 'I NEED HELP', textHash: sha('I NEED HELP') }] };
    const req = (id: string, voiceRevision: number) => ({ requestId: id, outputAuthorizationId: out.status().authorizationId, outputGeneration: out.status().generation,
      liveAuthorizationId: 'L1', liveGeneration: 1, utteranceId: 'u1', candidate: 'raw', index: 0, text: 'I NEED HELP', textHash: sha('I NEED HELP'), voiceRevision });
    const old = mv.status().revision;
    mv.select({ voiceId: `apple:${REED}` });
    out.speakReviewed(req('a', old), live, target);
    expect(terminal('a')).toMatchObject({ state: 'refused', reason: expect.stringMatching(/voice changed/) });
    out.speakReviewed(req('b', mv.status().revision), live, target);
    await tick(); await tick();
    expect(engine.renders).toEqual([{ voice: REED, text: 'I need help', rate: undefined, pitch: undefined }]); // exact words, sentence case only
    route.finishAll(); await tick();
    expect(terminal('b')).toMatchObject({ state: 'rendered', source: 'reviewed-recognition', voiceId: `apple:${REED}`, text: 'I NEED HELP' });
    out.speakReviewed(req('c', mv.status().revision), live, target);
    expect(terminal('c')).toMatchObject({ state: 'refused', reason: expect.stringMatching(/already spoken/) });
  });

  it('emergency stop during synthesis interrupts immediately and cancels the render; paused output refuses', async () => {
    const { engine, route, out, terminal } = speechRig();
    engine.hold = new Promise(() => {}); // never finishes on its own
    out.speakTyped({ requestId: 's1', outputAuthorizationId: out.status().authorizationId, text: 'long message' });
    await tick();
    out.control('stop');
    expect(terminal('s1')).toMatchObject({ state: 'interrupted' });
    expect(route.plays).toHaveLength(0);
    out.control('enable'); out.control('pause');
    out.speakTyped({ requestId: 's2', outputAuthorizationId: out.status().authorizationId, text: 'x' });
    expect(terminal('s2')).toMatchObject({ state: 'refused', reason: 'Voice output is paused.' });
  });

  it('a failing voice fails the delivery ("Nothing was sent") and nothing reaches the route', async () => {
    const { engine, route, out, terminal } = speechRig();
    engine.render = async () => { throw new Error('voice engine unavailable'); };
    out.speakTyped({ requestId: 'f1', outputAuthorizationId: out.status().authorizationId, text: 'hello' });
    await tick(); await tick();
    expect(terminal('f1')).toMatchObject({ state: 'failed', reason: expect.stringMatching(/Nothing was sent/) });
    expect(route.plays).toHaveLength(0);
  });
});

// ───────────────────────────── VoiceHelper (tacit-voice supervisor) ─────────────────────────────

function fakeChild() {
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new PassThrough(), stdin = new PassThrough();
  const sent: Record<string, unknown>[] = [];
  stdin.on('data', (d) => { for (const l of String(d).split('\n').filter(Boolean)) sent.push(JSON.parse(l)); });
  Object.assign(child, { stdout, stdin, stderr: new PassThrough() });
  return { child, sent, emit: (o: object) => stdout.write(`${JSON.stringify(o)}\n`) };
}

describe('VoiceHelper', () => {
  it('reports ready with the catalog, warms up once, renders to a private file and cleans it up; abort sends cancel', async () => {
    const c = fakeChild();
    const h = new VoiceHelper('/bin/tacit-voice', () => c.child);
    expect(h.state).toBe('starting');
    c.emit({ event: 'ready', ...catalog });
    await tick(5);
    expect(h.state).toBe('ready');
    expect(h.catalog?.voices).toHaveLength(4);
    expect(c.sent[0]).toMatchObject({ op: 'synth', voice: SAM, text: 'Ready.' }); // warm-up
    const p = h.render({ voice: REED, text: 'Hello', rate: 0.45 });
    await tick(5);
    const req = c.sent.at(-1)!;
    expect(req).toMatchObject({ op: 'synth', voice: REED, text: 'Hello', rate: 0.45 });
    expect(String(req.path)).toMatch(/tacit-voice-.*\/speech\.wav$/);
    writeFileSync(String(req.path), 'RIFFDATA');
    c.emit({ event: 'done', id: req.id, sampleRate: 22050, durationMs: 900, firstBufferMs: 20, totalMs: 60, peak: 0.6 });
    const r = await p;
    expect(r.wav.toString()).toBe('RIFFDATA');
    await tick(5);
    expect(existsSync(String(req.path))).toBe(false);

    const ac = new AbortController();
    const p2 = h.render({ voice: SAM, text: 'long' }, ac.signal);
    await tick(5);
    const id2 = c.sent.at(-1)!.id;
    ac.abort();
    await expect(p2).rejects.toThrow('cancelled');
    expect(c.sent.at(-1)).toEqual({ op: 'cancel', id: id2 });

    const p3 = h.render({ voice: 'nope', text: 'x' });
    await tick(5);
    c.emit({ event: 'error', id: c.sent.at(-1)!.id, message: 'voice not installed: nope' });
    await expect(p3).rejects.toThrow('voice not installed');
    h.close();
  });

  it('fails in-flight renders when the helper exits, and refuses renders while not ready', async () => {
    const c = fakeChild();
    const h = new VoiceHelper('/bin/tacit-voice', () => c.child);
    await expect(h.render({ voice: SAM, text: 'x' })).rejects.toThrow(/voice engine starting/);
    c.emit({ event: 'ready', ...catalog });
    await tick(5);
    const p = h.render({ voice: SAM, text: 'x' });
    await tick(5);
    c.child.emit('exit', 1);
    await expect(p).rejects.toThrow('voice helper exited');
    expect(h.state).toBe('starting');
    h.close();
  });
});
