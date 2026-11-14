import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputCapabilities } from '../src/silent/capabilities.ts';
import { CaptureTelemetry, SampleClock } from '../src/silent/captureTelemetry.ts';
import { SilentCapturePipeline } from '../src/silent/capturePipeline.ts';
import { emptyFrame, type VisionFrame } from '../src/vision/features.ts';
import { parseReplayLabels, replayFault, evaluateBoundaries } from '../src/silent/replay.ts';
import { LiveSpeechSession } from '../src/silent/session.ts';
import { activationBlock, type SilentSpeechPort, type VisualUtterance, type VisualHypothesis } from '../src/silent/port.ts';
import { ArticulationSegmenter } from '../src/silent/articulation.ts';

const camera = { connected: false, streaming: false, articulation: false, supported: true };
const f = (t: number, jaw = 0): VisionFrame => ({ ...emptyFrame(t), tracked: true, faceCount: 1, jaw, mouthAspect: jaw / 2 });
const jpeg = (t: number) => ({ t, jpeg: new Blob(['pixels']), width: 640, height: 480 });
const utterance = (id: string, bytes = 20): VisualUtterance => ({ id, startMs: 0, endMs: 800, detectedAtMs: 1300, endpointMs: 500, trackedFrames: 20, frames: Array.from({ length: 20 }, (_, i) => ({ ...jpeg(i * 40), jpeg: new Blob([new Uint8Array(bytes)]) })) });
const hypothesis = (id: string): VisualHypothesis => ({ utteranceId: id, authorizationId: 'test-auth', rawText: 'TEST ONLY words', final: true, stable: true, uncertainty: null, source: 'visual-model', model: 'TEST ONLY', decision: 'accepted', reason: null, recognitionMs: 0 });
const port = (): SilentSpeechPort => ({ availability: { connected: true, recognitionReady: true, supportedInputs: ['camera'], validatedInputs: ['camera'], automaticSpeechValidated: true, validationEvidence: 'TEST ONLY', model: 'TEST ONLY', reason: '' }, activate: async (callId, _s, _i, mode) => ({ id: 'test-auth', callId, generation: 'test-generation', mode }), submit: async (_a, u) => hypothesis(u.id), pause() {}, interrupt() {}, end() {} });

test('AirPods connection and fresh native motion never imply articulation, words, validation, or authorization', () => {
  const status = { helper: 'running' as const, authorized: 'authorized', available: true, connected: true, detail: null, lastGesture: null, lastMotionAt: 9500 };
  const a = inputCapabilities(status, 10000, camera)[0]!;
  assert.equal(a.device, 'yes'); assert.equal(a.streaming, 'yes'); assert.equal(a.articulation, 'unavailable'); assert.equal(a.recognition, 'unavailable'); assert.equal(a.validated, 'no'); assert.equal(a.automaticSpeech, 'no');
  assert.equal(inputCapabilities(status, 12000, camera)[0]!.streaming, 'no');
  assert.equal(inputCapabilities(status, 9000, camera)[0]!.streaming, 'no');
  assert.equal(inputCapabilities(null, null, camera)[0]!.device, 'unknown');
});
test('missing webcam support does not remove AirPods or combined capability boundary', () => {
  const caps = inputCapabilities(null, null, { ...camera, supported: false });
  assert.deepEqual(caps.map(c => c.id), ['airpods', 'camera', 'combined']); assert.equal(caps[1]!.device, 'unavailable'); assert.equal(caps[2]!.streaming, 'unavailable');
});
test('deadline sampling captures 25 fps from a 30 fps source without half-rate quantization', () => {
  const clock = new SampleClock(); const samples = [];
  for (let i = 0; i < 300; i++) { const t = i * 1000 / 30; if (clock.due(t)) samples.push(t); }
  assert.equal(samples.length, 250);
  const telemetry = new CaptureTelemetry(); samples.forEach(t => telemetry.sample(t));
  assert.ok(Math.abs(telemetry.stats.fps! - 25) < .1); assert.ok(telemetry.stats.jitterMs! > 0);
});
test('JPEG completion cannot refill a buffer invalidated by loss, multiple faces, head turn, or pause', () => {
  for (const invalid of [emptyFrame(200), { ...f(200), faceCount: 2 }, { ...f(200), yaw: .5 }, null]) {
    const pipe = new SilentCapturePipeline(); pipe.observe(f(150)); const ticket = pipe.ticket;
    if (invalid) pipe.observe(invalid); else pipe.clear();
    assert.equal(pipe.capture(jpeg(200), ticket), false); assert.equal(pipe.buffer.stats.frames, 0);
    assert.equal(pipe.telemetry.stats.rejected, 1);
  }
});
test('source-time metrics stay bounded over a long session and distinguish rejections from source drops', () => {
  const telemetry = new CaptureTelemetry();
  for (let i = 0; i < 100000; i++) telemetry.sample(i * 40);
  telemetry.sample(0); telemetry.sourceDrops = 4;
  assert.equal(telemetry.stats.fps, 25); assert.equal(telemetry.stats.jitterMs, 0); assert.equal(telemetry.stats.captured, 100000); assert.equal(telemetry.stats.rejected, 1); assert.equal(telemetry.stats.sourceDrops, 4);
});
test('replay delivery faults use recording PTS, independent of wall-clock delivery speed', () => {
  const plan = { url: 'blob:test', rate: 2, dropEvery: 3, interruptions: [{ startMs: 1000, endMs: 1600 }] };
  assert.equal(replayFault(plan, 3, 500), 'drop'); assert.equal(replayFault(plan, 4, 1200), 'tracking-interruption'); assert.equal(replayFault(plan, 5, 1700), null);
  assert.equal(replayFault({ ...plan, rate: .5 }, 4, 1200), 'tracking-interruption');
});
test('labels validate bounds and boundary evaluation keeps false triggers and misses visible', () => {
  assert.throws(() => parseReplayLabels([{ startMs: 100, endMs: 50, kind: 'silent' }]));
  assert.throws(() => parseReplayLabels([{ startMs: 0, endMs: 500, kind: 'silent' }, { startMs: 400, endMs: 600, kind: 'voiced' }]));
  const labels = parseReplayLabels([{ startMs: 100, endMs: 900, kind: 'silent' }, { startMs: 1200, endMs: 1800, kind: 'non-speech' }, { startMs: 2000, endMs: 3000, kind: 'silent' }]);
  const r = evaluateBoundaries(labels, [{ startMs: 120, endMs: 880, endpointMs: 500 }, { startMs: 1300, endMs: 1500, endpointMs: 500 }]);
  assert.equal(r.missed, 1); assert.equal(r.nonSpeechWindows, 1); assert.equal(r.unmatchedWindows, 1); assert.equal(r.matches[0]!.matched && r.matches[0]!.onsetErrorMs, 20);
});
test('display-only recognition works before a reliability gate; automatic speech stays blocked', async () => {
  const p = port(); p.availability.automaticSpeechValidated = false; p.availability.validationEvidence = null;
  assert.ok(activationBlock(p, 'call')); assert.equal(activationBlock(p, 'call', 'camera', 'display-only'), null);
  const session = new LiveSpeechSession(p, () => {}, () => 0); assert.equal(await session.start('call', 'camera', 'display-only'), true);
  p.submit = async (_a, u) => ({ ...hypothesis(u.id), decision: 'shown' }); await session.submit(utterance('display'));
  assert.equal(session.state.hypothesis?.decision, 'shown'); assert.equal(session.state.phase, 'listening');
  p.submit = async (_a, u) => hypothesis(u.id); await session.submit(utterance('forbidden'));
  assert.equal(session.state.hypothesis?.utteranceId, 'display'); assert.match(session.state.reason!, /Unauthorized/);
});
test('a supported AirPods adapter uses the same session without camera frames; source swaps are rejected', async () => {
  const p = port(); p.availability.supportedInputs = ['airpods']; p.availability.validatedInputs = ['airpods']; let calls = 0;
  p.submit = async (_a, u) => { calls++; return { ...hypothesis(u.id), source: 'airpods-model' }; };
  const session = new LiveSpeechSession(p, () => {}, () => 0); assert.equal(await session.start('call', 'airpods'), true);
  const { frames: _frames, ...timing } = utterance('motion');
  await session.submit({ ...timing, inputSource: 'airpods', evidence: new Blob(['TEST ONLY samples']), sampleCount: 50 });
  assert.equal(calls, 1); assert.equal(session.state.hypothesis?.source, 'airpods-model');
  await session.submit(utterance('wrong-source')); assert.equal(calls, 1); assert.match(session.state.reason!, /Input source changed/);
});
test('recognition queue overload discards newest, stays byte bounded, and pause releases all held evidence', async () => {
  const p = port(); let release!: (h: VisualHypothesis) => void;
  p.submit = () => new Promise(r => release = r);
  const session = new LiveSpeechSession(p, () => {}, () => 0); await session.start('call');
  const first = session.submit(utterance('u1')); await session.submit(utterance('u2')); await session.submit(utterance('u3')); await session.submit(utterance('u4'));
  assert.equal(session.metrics.queueDepth, 2); assert.equal(session.metrics.overloads, 1); assert.ok(session.metrics.heldBytes < 24 * 1024 * 1024);
  session.pause(); release(hypothesis('u1')); await first; assert.equal(session.metrics.heldBytes, 0);
});
test('oversized evidence is rejected before a backend request', async () => {
  const p = port(); let calls = 0; p.submit = async (_a, u) => { calls++; return hypothesis(u.id); };
  const session = new LiveSpeechSession(p, () => {}, () => 0); await session.start('call');
  await session.submit(utterance('huge', 700000)); assert.equal(calls, 0); assert.equal(session.metrics.overloads, 1); assert.equal(session.metrics.heldBytes, 0);
});
test('hung recognition interrupts remotely, clears queue, and ignores a later result', async () => {
  const p = port(); let release!: (h: VisualHypothesis) => void; let interrupted = 0;
  p.submit = () => new Promise(r => release = r); p.interrupt = () => interrupted++;
  const session = new LiveSpeechSession(p, () => {}, () => 0, 5); await session.start('call');
  const first = session.submit(utterance('u1')); await session.submit(utterance('u2')); await first;
  assert.equal(interrupted, 1); assert.equal(session.metrics.queueDepth, 0); assert.match(session.state.reason!, /timed out/);
  release(hypothesis('u1')); await Promise.resolve(); assert.equal(session.state.hypothesis, null); session.stop();
});
test('natural short pauses stay within one motion window; long pauses separate consecutive windows', () => {
  const run = (pauseMs: number) => {
    const segmenter = new ArticulationSegmenter(); const windows = [];
    for (let t = 0; t <= 3300 + pauseMs; t += 50) {
      const moving = t < 1000 || (t >= 1000 + pauseMs && t < 2000 + pauseMs);
      const out = segmenter.update(f(t, moving && t % 100 === 0 ? .7 : 0)); if (out.window) windows.push(out.window);
    }
    return windows;
  };
  assert.equal(run(200).length, 1); assert.equal(run(800).length, 2);
});

test('unvalidated AirPods cannot inherit a camera validation gate', () => {
  const p = port(); p.availability.supportedInputs = ['camera', 'airpods'];
  assert.match(activationBlock(p, 'call', 'airpods')!, /validated for this input/);
  const caps = inputCapabilities(null, null, camera, p.availability, 'airpods');
  assert.equal(caps[0]!.recognition, 'yes'); assert.equal(caps[0]!.validated, 'no'); assert.equal(caps[0]!.automaticSpeech, 'no');
  assert.equal(caps[1]!.validated, 'yes'); assert.equal(caps[1]!.automaticSpeech, 'no');
});
test('blocked reactivation ends previous authorization rather than silently retaining it', async () => {
  const p = port(); let ended = 0; p.end = () => ended++;
  const session = new LiveSpeechSession(p, () => {}, () => 0); await session.start('call');
  p.availability.automaticSpeechValidated = false;
  assert.equal(await session.start('call'), false); assert.equal(session.active, false); assert.equal(ended, 1);
});
test('pause inside recognition-state notification prevents any later submit call', async () => {
  const p = port(); let calls = 0; p.submit = async (_a, u) => { calls++; return hypothesis(u.id); };
  const session = new LiveSpeechSession(p, state => { if (state.phase === 'recognizing') session.pause(); }, () => 0);
  await session.start('call'); await session.submit(utterance('paused-before-submit'));
  assert.equal(calls, 0); assert.equal(session.active, false);
});
test('deadline clock tolerates fractional presentation timestamp rounding', () => {
  const clock = new SampleClock(); let captured = 0;
  for (let i = 0; i < 250; i++) if (clock.due(i * 40 - (i % 2) * .00001)) captured++;
  assert.equal(captured, 250);
});
