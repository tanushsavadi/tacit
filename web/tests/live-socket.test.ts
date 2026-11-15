import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveStatus, RecognitionHypothesis, Snapshot } from '../../shared/protocol.ts';
import { LiveSocketPort, type LiveSocket } from '../src/silent/liveSocket.ts';
import { LiveSpeechSession } from '../src/silent/session.ts';
import { activationBlock, type VisualUtterance } from '../src/silent/port.ts';

const status = (generation = 0, state: LiveStatus['state'] = 'off', id: string | null = null): LiveStatus => ({ generation, state, authorizationId: id, mode: 'display-only', autoTransmitAllowed: false, reason: 'TEST ONLY status' });
const snapshot = (reachable = true): Snapshot => ({ services: { recognition: { reachable, model: reachable ? 'TEST ONLY model' : null, live: reachable ? { protocol: 'tacit-live-v1', supportedInputs: ['camera'], automaticSpeechValidated: false, validationEvidence: null, maxFrames: 300, maxBytes: 12 * 1024 * 1024, maxDurationMs: 10000 } : undefined } } } as Snapshot);
const window = (id: string): VisualUtterance => ({ id, startMs: 100, endMs: 500, endpointMs: 480, detectedAtMs: 980, trackedFrames: 10, frames: Array.from({ length: 10 }, (_, i) => ({ t: 100 + i * 40, width: 640, height: 480, jpeg: new Blob([`TEST ONLY JPEG ${i}`], { type: 'image/jpeg' }) })) });
function fixture(timeout = 30000) {
  const sent: (string | Blob)[] = [];
  const socket: LiveSocket & { bufferedAmount: number } = { readyState: 1, bufferedAmount: 0, send: data => { sent.push(data); }, close() {} };
  const port = new LiveSocketPort(() => {}, timeout); port.attach(socket); port.receive({ type: 'live_status', status: status() }); port.updateSnapshot(snapshot());
  const ack = (s: LiveStatus) => port.receive({ type: 'live_status', status: s });
  const header = () => JSON.parse(sent.findLast(s => typeof s === 'string' && JSON.parse(s).type === 'visual_utterance') as string);
  const result = (id: string, authorizationId = 'auth'): RecognitionHypothesis => ({ utteranceId: id, authorizationId, rawText: 'TEST ONLY raw words', final: true, stable: false, uncertainty: { kind: 'nbest-margin-per-token', value: .1, calibrated: false }, model: 'TEST ONLY', source: 'visual-model', decision: 'shown', reason: null, recognitionMs: 20, stages: null, gate: null, transmitted: false });
  const answer = (id = header().utteranceId, authorizationId = 'auth') => port.receive({ type: 'recognition_hypothesis', hypothesis: result(id, authorizationId) });
  const activate = async () => { const task = port.activate('display-only', new AbortController().signal, 'camera', 'display-only'); ack(status(1, 'active', 'auth')); return task; };
  return { port, socket, sent, ack, header, answer, activate };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('display-only activates without a caller; automatic gate remains closed and no preactivation JPEGs leave', async () => {
  const f = fixture(); assert.equal(activationBlock(f.port, null, 'camera', 'display-only'), null); assert.match(activationBlock(f.port, null)!, /gated/);
  await assert.rejects(f.port.submit({ id: 'none', generation: '0', callId: '', mode: 'display-only' }, window('early'), new AbortController().signal), /authorization/);
  assert.equal(f.sent.length, 0);
  const session = new LiveSpeechSession(f.port, () => {}, () => 0);
  const started = session.start(null, 'camera', 'display-only'); f.ack(status(1, 'active', 'auth')); assert.equal(await started, true);
  const submitted = session.submit(window('u')); await tick();
  const header = f.header(); assert.equal(header.endpointMs, 980); assert.deepEqual(header.frameTimesMs, window('u').frames.map(f => f.t));
  f.answer(); await submitted;
  assert.equal(session.state.hypothesis?.rawText, 'TEST ONLY raw words'); assert.equal(session.state.hypothesis?.stable, false); assert.equal(session.state.hypothesis?.decision, 'shown'); assert.equal(session.automaticSpeechAuthorized, false);
  assert.equal(f.sent.filter(s => s instanceof Blob).length, 10); assert.equal(f.sent.some(s => typeof s === 'string' && /"type":"(confirm|tap_select)"/.test(s)), false);
  session.stop(); f.ack(status(2)); f.port.disconnect();
});
test('header and exactly its JPEGs are contiguous; busy submissions cannot overwrite correlation', async () => {
  const f = fixture(); const auth = await f.activate(); const first = f.port.submit(auth, window('one'), new AbortController().signal); await tick();
  await assert.rejects(f.port.submit(auth, window('two'), new AbortController().signal), /busy/);
  assert.ok(typeof f.sent[1] === 'string'); assert.ok(f.sent.slice(2).every(x => x instanceof Blob));
  f.answer(); assert.equal((await first).utteranceId, 'one');
  const second = f.port.submit(auth, window('two'), new AbortController().signal); await tick(); f.answer(); assert.equal((await second).utteranceId, 'two'); f.port.disconnect();
});
test('review invalidation is additive: pending recognition still settles and nothing is automatically spoken', async () => {
  const f = fixture(), auth = await f.activate();
  const pending = f.port.submit(auth, window('one'), new AbortController().signal); await tick();
  const sent = f.sent.length;
  f.port.receive({ type: 'review_invalidated', authorizationId: 'auth', generation: 1, utteranceId: f.header().utteranceId });
  f.answer();
  assert.equal((await pending).utteranceId, 'one');
  assert.equal(f.sent.length, sent);
  assert.equal(f.sent.some(s => typeof s === 'string' && JSON.parse(s).type.startsWith('speak_')), false);
  f.port.disconnect();
});
test('two callers waiting on backpressure cannot both install a pending result', async () => {
  const f = fixture(); const auth = await f.activate(); f.socket.bufferedAmount = 2 * 1024 * 1024;
  const one = f.port.submit(auth, window('one'), new AbortController().signal);
  const two = f.port.submit(auth, window('two'), new AbortController().signal);
  const rejected = assert.rejects(two, /busy/); await tick(); assert.equal(f.sent.length, 1);
  f.socket.bufferedAmount = 0; await new Promise(resolve => setTimeout(resolve, 35));
  f.answer(); await one; await rejected; assert.equal(f.sent.filter(x => x instanceof Blob).length, 10); f.port.disconnect();
});
test('pause/stop before drain cancels without a header or binary frame; pause then stop sends end', async () => {
  const f = fixture(); const auth = await f.activate(); f.socket.bufferedAmount = 2 * 1024 * 1024;
  const pending = f.port.submit(auth, window('one'), new AbortController().signal); await tick();
  f.port.pause(auth); f.ack(status(2, 'paused', 'auth')); f.port.end(auth); f.ack(status(3)); f.socket.bufferedAmount = 0;
  await assert.rejects(pending, /interrupted/); assert.equal(f.sent.some(x => x instanceof Blob), false);
  assert.deepEqual(f.sent.map(x => JSON.parse(x as string).action), ['activate', 'pause', 'end']); f.port.disconnect();
});
test('interrupt acknowledges new generation, rejects stale same-auth results and supports a second utterance', async () => {
  const f = fixture(); const auth = await f.activate(); const first = f.port.submit(auth, window('reused'), new AbortController().signal); await tick(); const oldId = f.header().utteranceId;
  const rejected = assert.rejects(first, /interrupted/); f.port.interrupt(auth); f.ack(status(2, 'active', 'auth')); await rejected;
  const second = f.port.submit(auth, window('reused'), new AbortController().signal); await tick(); const newId = f.header().utteranceId; assert.notEqual(newId, oldId);
  f.answer(oldId); f.answer(newId, 'wrong-auth'); let resolved = false; void second.then(() => resolved = true); await tick(); assert.equal(resolved, false);
  f.answer(newId); assert.equal((await second).utteranceId, 'reused'); assert.equal(auth.generation, '2'); f.port.disconnect();
});
test('disconnect invalidates pending results and a new connection requires explicit activation', async () => {
  const f = fixture(); const auth = await f.activate(); const pending = f.port.submit(auth, window('one'), new AbortController().signal); await tick(); const oldId = f.header().utteranceId;
  const rejected = assert.rejects(pending, /Connection/); f.port.disconnect(); await rejected;
  f.port.attach(f.socket); f.ack(status()); f.port.updateSnapshot(snapshot()); f.answer(oldId);
  await assert.rejects(f.port.submit(auth, window('two'), new AbortController().signal), /authorization/); f.port.disconnect();
});
test('capability loss during activation cannot install a late authorization', async () => {
  const f = fixture(); const activation = f.port.activate('display-only', new AbortController().signal, 'camera', 'display-only');
  f.port.updateSnapshot(snapshot(false)); f.ack(status(1, 'active', 'auth'));
  await assert.rejects(activation, /cancelled/); f.ack(status(2)); assert.equal(f.port.availability.recognitionReady, false); f.port.disconnect();
});
test('malformed order/size/type are rejected locally, and hung recognition times out with remote interruption', async () => {
  const f = fixture(8); const auth = await f.activate(); const bad = window('bad'); bad.frames[1]!.t = bad.frames[0]!.t;
  await assert.rejects(f.port.submit(auth, bad, new AbortController().signal), /Invalid/); assert.equal(f.sent.length, 1);
  const pending = f.port.submit(auth, window('hung'), new AbortController().signal); await assert.rejects(pending, /timed out/);
  assert.equal(JSON.parse(f.sent.at(-1) as string).action, 'interrupt'); f.ack(status(2, 'active', 'auth')); f.port.disconnect();
});
test('unsolicited, stale, and competing live status do not install the wrong authorization', async () => {
  const f = fixture();
  const activation = f.port.activate('display-only', new AbortController().signal, 'camera', 'display-only');
  f.ack(status(1, 'paused', 'other'));
  let settled = false; void activation.then(() => { settled = true; }, () => { settled = true; }); await tick();
  assert.equal(settled, false, 'a paused status must not acknowledge activate');
  f.ack(status(0, 'active', 'stale')); await tick(); assert.equal(settled, false, 'an older generation is ignored');
  f.ack(status(2, 'active', 'auth'));
  const auth = await activation;
  assert.equal(auth.id, 'auth'); assert.equal(auth.generation, '2');
  f.ack(status(3, 'active', 'other-client'));
  await assert.rejects(f.port.submit(auth, window('late'), new AbortController().signal), /authorization/);
  f.ack(status(2, 'active', 'auth')); assert.equal(f.port.status?.authorizationId, 'other-client');
  f.port.disconnect();
});
test('aborting activation sends end and never installs late server auth', async () => {
  const f = fixture(); const controller = new AbortController(); const task = f.port.activate('display-only', controller.signal, 'camera', 'display-only');
  controller.abort(); f.ack(status(1, 'active', 'auth')); await assert.rejects(task, /cancelled/); f.ack(status(2)); assert.equal(JSON.parse(f.sent.at(-1) as string).action, 'end'); f.port.disconnect();
});
