import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { LiveStatus, RecognitionHypothesis, SpeechDelivery, VoiceRouteStatus } from '../../shared/protocol.ts';
import type { OutputRoute, PlayOutcome } from './route.ts';
import { MAX_PENDING, SpeechOutput, UNVALIDATED_GATE, type ReliabilityGate } from './speech.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const ready: VoiceRouteStatus = { state: 'ready', deviceName: 'BlackHole 2ch', deviceUid: 'bh', sampleRate: 48000, gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null };

class FakeRoute extends EventEmitter implements OutputRoute {
  st: VoiceRouteStatus = { ...ready };
  plays: { id: string; resolve: (o: PlayOutcome) => void; started?: (t: number) => void }[] = [];
  stops: string[] = [];
  status() { return this.st; }
  play(id: string, _a: Buffer, _m: string, started?: (t: number) => void) {
    return new Promise<PlayOutcome>((resolve) => this.plays.push({ id, resolve, started }));
  }
  stop(reason: string) { this.stops.push(reason); for (const p of this.plays.splice(0)) p.resolve({ state: 'interrupted', reason }); }
  finishAll() { for (const p of this.plays.splice(0)) { p.started?.(1); p.resolve({ state: 'rendered', startedAt: 1, renderedAt: 2 }); } }
}

function setup(opts: { gate?: ReliabilityGate; synth?: (t: string) => Promise<void> } = {}) {
  const route = new FakeRoute();
  const synthCalls: string[] = [];
  const tts = { label: 'macos-say (system voice, not personal)', synth: async (t: string) => {
    synthCalls.push(t); await opts.synth?.(t);
    return { audio: Buffer.from('RIFF'), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'macos-say (system voice, not personal)' };
  } };
  let routeOn: FakeRoute | null = route;
  const out = new SpeechOutput(tts, () => routeOn, () => ({ ...ready, state: 'unconfigured', reason: 'no helper' }), opts.gate);
  const deliveries: SpeechDelivery[] = [];
  out.on('delivery', (d) => deliveries.push(d));
  const terminal = (id: string) => deliveries.filter((d) => d.requestId === id && ['rendered', 'refused', 'interrupted', 'failed'].includes(d.state));
  return { out, route, synthCalls, deliveries, terminal, removeRoute: () => { routeOn = null; } };
}
const typed = (out: SpeechOutput, id: string, text = 'hello there', auth = out.status().authorizationId) =>
  out.speakTyped({ requestId: id, outputAuthorizationId: auth, text });

describe('SpeechOutput — typed AAC fallback', () => {
  it('refuses while off, then speaks once enabled: queued → synthesizing → routing → rendered, never "heard"', async () => {
    const { out, route, deliveries, terminal } = setup();
    typed(out, 'r0');
    expect(terminal('r0')[0]).toMatchObject({ state: 'refused', source: 'typed' });
    out.control('enable');
    typed(out, 'r1');
    await tick();
    route.finishAll();
    await tick();
    expect(deliveries.filter((d) => d.requestId === 'r1').map((d) => d.state)).toEqual(['queued', 'synthesizing', 'routing', 'routing', 'rendered']);
    expect(terminal('r1')).toHaveLength(1);
    expect(terminal('r1')[0]).toMatchObject({ remoteAudibility: 'unknown', voice: expect.stringContaining('system voice') });
    expect(terminal('r1')[0]!.timings.renderedAt).toBe(2);
    expect(terminal('r1')[0]).toMatchObject({ outputAuthorizationId: out.status().authorizationId, generation: out.status().generation });
  });

  it('rejects stale authorization, duplicates, empty and over-long text', async () => {
    const { out, terminal } = setup();
    out.control('enable');
    const old = out.status().authorizationId;
    out.control('enable');
    typed(out, 'a', 'hi', old);
    typed(out, 'b', '   ');
    typed(out, 'c', 'x'.repeat(501));
    typed(out, 'd'); typed(out, 'd');
    expect(terminal('a')[0]!.reason).toMatch(/Stale/);
    expect(terminal('b')[0]!.reason).toMatch(/Nothing/);
    expect(terminal('c')[0]!.reason).toMatch(/Longer/);
    expect(terminal('d').map((d) => d.state)).toEqual(['refused']); // the duplicate is refused; the first is still in flight
  });

  it('pause cuts the playing message AND drops queued ones; nothing from before plays after resume', async () => {
    let release!: () => void;
    const { out, route, terminal, synthCalls } = setup({ synth: (t) => (t === 'second' ? new Promise((r) => { release = r; }) : Promise.resolve()) });
    out.control('enable');
    typed(out, 'p1', 'first'); typed(out, 'p2', 'second'); typed(out, 'p3', 'third');
    await tick();
    expect(route.plays.map((p) => p.id)).toEqual(['p1']);
    out.control('pause');
    release(); await tick(); await tick();
    expect(terminal('p1')[0]).toMatchObject({ state: 'interrupted' });
    expect(terminal('p2')).toEqual([expect.objectContaining({ state: 'interrupted', reason: 'Paused.' })]); // ended at once, not after TTS returns
    expect(terminal('p3')[0]).toMatchObject({ state: 'interrupted' });
    expect(route.plays).toHaveLength(0);
    expect(synthCalls).toEqual(['first', 'second']);
    out.control('resume');
    typed(out, 'p4', 'fourth');
    await tick();
    expect(route.plays.map((p) => p.id)).toEqual(['p4']);
  });

  it('refuses when the virtual mic is not ready or the queue is full; TTS failure sends nothing', async () => {
    const { out, route, terminal } = setup({ synth: async (t) => { if (t === 'boom') throw new Error('say failed'); } });
    out.control('enable');
    route.st = { ...ready, state: 'unavailable', reason: 'device removed' };
    typed(out, 'x1');
    expect(terminal('x1')[0]!.reason).toMatch(/not ready: device removed/);
    route.st = { ...ready };
    typed(out, 'boom', 'boom');
    await tick();
    expect(terminal('boom')[0]).toMatchObject({ state: 'failed' });
    expect(route.plays).toHaveLength(0);
    for (let i = 0; i < MAX_PENDING + 1; i++) typed(out, `q${i}`);
    expect(terminal(`q${MAX_PENDING}`)[0]!.reason).toMatch(/Too many/);
  });

  it('stop during synthesis ends the request immediately (queued 0) and aborts the TTS call', async () => {
    let aborted = false;
    const { out, route, terminal } = setup({ synth: () => new Promise<void>(() => {}) });
    (out as unknown as { tts: { synth: (t: string, f: string, s?: AbortSignal) => Promise<never> } }).tts.synth = (_t, _f, sig) =>
      new Promise((_r, rej) => sig?.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }));
    out.control('enable');
    typed(out, 's1');
    await tick();
    out.control('stop');
    expect(terminal('s1')).toEqual([expect.objectContaining({ state: 'interrupted' })]);
    expect(out.status().queued).toBe(0);
    expect(aborted).toBe(true);
    await tick();
    expect(terminal('s1')).toHaveLength(1);
    expect(route.plays).toHaveLength(0);
  });

  it('a message written before a pause/interrupt (outputGeneration) is refused after it', async () => {
    const { out, route, terminal } = setup();
    out.control('enable');
    const gen = out.status().generation;
    out.control('pause'); out.control('resume');
    out.speakTyped({ requestId: 'old', outputAuthorizationId: out.status().authorizationId, text: 'hi', outputGeneration: gen });
    expect(terminal('old')[0]).toMatchObject({ state: 'refused', reason: expect.stringContaining('paused or interrupted') });
    out.speakTyped({ requestId: 'new', outputAuthorizationId: out.status().authorizationId, text: 'hi', outputGeneration: out.status().generation });
    await tick();
    expect(route.plays.map((p) => p.id)).toEqual(['new']);
  });

  it('interrupt() (Live paused / call change) cancels in-flight speech but keeps the session enabled', async () => {
    const { out, route, terminal } = setup();
    out.control('enable');
    typed(out, 'i1');
    await tick();
    out.interrupt('Live paused.');
    await tick();
    expect(route.stops).toEqual(['Live paused.']);
    expect(terminal('i1')[0]).toMatchObject({ state: 'interrupted', reason: 'Live paused.' });
    expect(out.status().state).toBe('ready');
  });
});

describe('SpeechOutput — recognised speech gate', () => {
  const live: LiveStatus = { authorizationId: 'L1', generation: 3, state: 'active', mode: 'automatic' as LiveStatus['mode'], autoTransmitAllowed: false, reason: '' };
  const hyp = (over: Partial<RecognitionHypothesis> = {}): RecognitionHypothesis => ({
    utteranceId: 'u1', authorizationId: 'L1', rawText: "IT'S ELEVEN O'CLOCK", final: true, stable: false, uncertainty: null, model: 'm',
    source: 'visual-model', decision: 'shown', reason: null, recognitionMs: 700, stages: null, gate: null, transmitted: false, ...over });

  it('production gate (UNVALIDATED_GATE) never speaks recognised words, whatever the state', async () => {
    const { out, route, deliveries } = setup();
    out.control('enable');
    expect(out.speakRecognized(hyp(), live)).toMatch(/display-only/);
    await tick();
    expect(route.plays).toHaveLength(0);
    expect(deliveries).toHaveLength(0);
    expect(out.status().recognizedSpeechAllowed).toBe(false);
    expect(UNVALIDATED_GATE.validated).toBe(false);
  });

  // TEST FIXTURE ONLY: a fake "validated" gate exercises the delivery code path. It is not evidence that silent
  // speech recognition is reliable, and no such gate exists in production code.
  const FIXTURE_GATE: ReliabilityGate = { validated: true, evidence: 'TEST FIXTURE', accept: (h) => ({ ok: (h.uncertainty?.value ?? 0) >= 0.2, reason: 'margin below fixture threshold' }) };

  it('[fixture gate] accepted result → TTS → route exactly once; stale, abstained, duplicate and low-margin are refused', async () => {
    const { out, route, terminal } = setup({ gate: FIXTURE_GATE });
    out.control('enable');
    const ok = hyp({ uncertainty: { value: 0.3, kind: 'nbest-margin-per-token', calibrated: false } });
    expect(out.speakRecognized(ok, live)).toBeNull();
    expect(out.speakRecognized(ok, live)).toMatch(/already spoken/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u2', authorizationId: 'OLD', uncertainty: ok.uncertainty }), live)).toMatch(/Stale/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u3', decision: 'abstained', rawText: '' }), live)).toMatch(/Not an accepted/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u4', uncertainty: { value: 0.1, kind: 'nbest-margin-per-token', calibrated: false } }), live)).toMatch(/fixture threshold/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u5' }), { ...live, mode: 'display-only' })).toMatch(/not in automatic/);
    await tick();
    route.finishAll(); await tick();
    expect(terminal('rec:L1:u1')).toEqual([expect.objectContaining({ state: 'rendered', source: 'recognized', text: "IT'S ELEVEN O'CLOCK" })]);
  });

  it('[fixture gate] stop during playback interrupts recognised speech', async () => {
    const { out, route, terminal } = setup({ gate: FIXTURE_GATE });
    out.control('enable');
    out.speakRecognized(hyp({ uncertainty: { value: 0.5, kind: 'nbest-margin-per-token', calibrated: false } }), live);
    await tick();
    expect(route.plays).toHaveLength(1);
    out.control('stop');
    await tick();
    expect(terminal('rec:L1:u1')[0]).toMatchObject({ state: 'interrupted' });
    expect(out.status()).toMatchObject({ state: 'off', authorizationId: null });
  });
});
