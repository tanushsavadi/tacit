// Deterministic regressions: deferred inference and the real terminal source with fake IO only.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';
import { LiveSession, type RecognizerResult } from './live.ts';
import { buildReviewedRequest } from './reviewed.ts';
import { SpeechOutput } from './speech.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferredLive() {
  const releases: ((r: RecognizerResult) => void)[] = [], messages: ServerMessage[] = [];
  const live = new LiveSession(() => new Promise(resolve => releases.push(resolve)), m => messages.push(m));
  live.control({ type: 'live_control', action: 'activate' });
  const header = (id: string) => live.utterance({ type: 'visual_utterance', utteranceId: id,
    authorizationId: live.current.authorizationId!, startMs: 0, endMs: 40, endpointMs: 520, frameTimesMs: [0, 40] });
  const submit = (id: string) => { header(id); live.frame(Buffer.from('FAKE')); live.frame(Buffer.from('FAKE')); };
  return { live, releases, messages, header, submit };
}

function terminal(h: RecognitionHypothesis) {
  const sent: Record<string, unknown>[] = [], printed: string[] = [];
  let socket!: EventEmitter, now = Date.now();
  const answers: ((text: string) => void)[] = [];
  const readline = Object.assign(new EventEmitter(), {
    prompt() {}, write() {}, close() {}, question(_p: string, cb: (text: string) => void) { answers.push(cb); },
  });
  class FakeSocket extends EventEmitter {
    readyState = 1;
    constructor() { super(); socket = this; }
    send(text: string) { sent.push(JSON.parse(text)); }
    close() {}
  }
  const source = readFileSync(new URL('../scripts/review.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  let id = 0;
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    WebSocket: FakeSocket, randomUUID: () => `request-${++id}`, createInterface: () => readline, buildReviewedRequest,
    secrets: { userToken: 'FAKE' }, console: { error() {} }, Date: class extends Date { static now() { return now; } },
    process: { env: {}, stdin: {}, stdout: { write(s: string) { printed.push(s); } }, exit() {} },
  });
  const receive = (m: object) => socket.emit('message', JSON.stringify(m), false);
  const message = (type: string, key: string, value: object) => receive({ type, [key]: value });
  const live = { state: 'active', authorizationId: h.authorizationId, generation: h.generation };
  const out = { state: 'ready', authorizationId: 'O1', generation: 1, route: {} };
  message('live_status', 'status', live); message('output_status', 'status', out);
  message('recognition_hypothesis', 'hypothesis', h);
  // Before the fix the actual client offers bare numbers; afterwards it offers identity-bound tokens.
  const choice = () => printed.join('').match(/1@(v\d+)/g)?.at(-1) ?? '1';
  return { sent, printed, message, receive, live, out, choice, line: (s: string) => readline.emit('line', s),
    answer: (text: string, i = answers.length - 1) => answers[i]!(text), close: () => socket.emit('close'), advance: (ms: number) => { now += ms; } };
}

describe('review identity races', () => {
  it('race 2: a valid newer header invalidates the old review before any new frame or result', async () => {
    const { live, submit, releases, header } = deferredLive();
    submit('A'); releases[0]!({ text: 'WORDS FOR A' }); await tick();
    expect(live.reviewTarget()?.utteranceId).toBe('A');
    const synthesized: string[] = [];
    const ready = { state: 'ready' as const, deviceUid: 'FAKE', deviceName: 'FAKE', sampleRate: 44100, gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null };
    const route = Object.assign(new EventEmitter(), { status: () => ready, play: async () => ({ state: 'rendered' as const, startedAt: 0, renderedAt: 0 }), stop() {} });
    const speech = new SpeechOutput({ label: 'FAKE', synth: async text => {
      synthesized.push(text);
      return { audio: Buffer.from('FAKE'), mime: 'audio/wav', voice: 'FAKE', requestTs: 0, firstByteTs: 0 };
    } }, () => route, () => ready);
    speech.control('enable');
    const approval = buildReviewedRequest(live.reviewTarget()!, { index: 0 }, speech.status(), live.current, 'old-approval');
    expect(typeof approval).toBe('object');
    header('B');
    expect(live.reviewTarget()).toBeNull();
    if (typeof approval !== 'string') speech.speakReviewed(approval, live.current, live.reviewTarget());
    await tick();
    expect(synthesized).toEqual([]);
    speech.control('stop');
    live.close();
  });

  it('race 3: a late older completion cannot replace or publish over the newer review', async () => {
    const { live, submit, releases, messages } = deferredLive();
    submit('A'); submit('B');
    releases[1]!({ text: 'WORDS FOR B' }); await tick();
    releases[0]!({ text: 'WORDS FOR A' }); await tick();
    expect(live.reviewTarget()?.utteranceId).toBe('B');
    expect(messages.filter(m => m.type === 'recognition_hypothesis' && m.hypothesis.decision === 'shown')
      .map(m => m.type === 'recognition_hypothesis' && m.hypothesis.utteranceId)).toEqual(['B']);
    live.close();
  });

  it('race 1: terminal correction never rebinds from A to B while the edit prompt is open', async () => {
    const { live, submit, releases } = deferredLive();
    submit('A'); releases[0]!({ text: 'WORDS FOR A' }); await tick();
    const h = live.reviewTarget()!, t = terminal(h);
    t.line(`e ${t.choice()}`);
    t.message('recognition_hypothesis', 'hypothesis', { ...h, utteranceId: 'B' });
    t.answer('Correction for A');
    expect(t.sent.filter(m => m.type === 'speak_reviewed')).toEqual([]);
    live.close();
  });

  it('late older results settle only their own connection, with no usable candidate', async () => {
    const replies: { message: ServerMessage; conn: unknown }[] = [], releases: ((r: RecognizerResult) => void)[] = [];
    const live = new LiveSession(() => new Promise(resolve => releases.push(resolve)), (message, conn) => replies.push({ message, conn }));
    live.control({ type: 'live_control', action: 'activate' });
    const A = {}, B = {};
    for (const [id, conn] of [['A', A], ['B', B]] as const) {
      live.utterance({ type: 'visual_utterance', utteranceId: id, authorizationId: live.current.authorizationId!, startMs: 0, endMs: 40, endpointMs: 50, frameTimesMs: [0] }, conn);
      live.frame(Buffer.from('FAKE'), conn);
    }
    releases[1]!({ text: 'B' }); await tick(); releases[0]!({ text: 'A' }); await tick();
    const old = replies.find(r => r.message.type === 'recognition_hypothesis' && r.message.hypothesis.utteranceId === 'A')!;
    expect(old.conn).toBe(A);
    expect(old.message).toMatchObject({ hypothesis: { decision: 'abstained', rawText: '' } });
    if (old.message.type === 'recognition_hypothesis') expect(old.message.hypothesis.reviewCandidates).toBeUndefined();
    expect(live.reviewTarget()?.utteranceId).toBe('B');
    live.close();
  });

  it.each(['abstained', 'incomplete'] as const)('a newer %s utterance never resurrects the old target', async failure => {
    const { live, submit, releases, header } = deferredLive();
    submit('A'); releases[0]!({ text: 'A' }); await tick();
    if (failure === 'abstained') { submit('B'); releases[1]!({ text: null, error: 'no words' }); }
    else { header('B'); live.disconnect(null); }
    await tick();
    expect(live.reviewTarget()).toBeNull();
    live.close();
  });

  it('invalid or duplicate headers cannot revoke a valid current target', async () => {
    const { live, submit, releases } = deferredLive();
    submit('A'); releases[0]!({ text: 'A' }); await tick();
    const h = live.reviewTarget();
    submit('A');
    live.utterance({ type: 'visual_utterance', utteranceId: 'bad', authorizationId: 'old', startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [0] });
    expect(live.reviewTarget()).toBe(h);
    live.close();
  });

  it('a delayed terminal pick token and bare index cannot select B', async () => {
    const { live, submit, releases } = deferredLive();
    submit('A'); releases[0]!({ text: 'A' }); await tick();
    const h = live.reviewTarget()!, t = terminal(h), old = t.choice();
    t.message('recognition_hypothesis', 'hypothesis', { ...h, utteranceId: 'B' });
    t.line(old); t.line('1');
    expect(t.sent).toEqual([]);
    t.line(t.choice());
    expect(t.sent).toMatchObject([{ type: 'speak_reviewed', utteranceId: 'B', text: 'A' }]);
    live.close();
  });

  it.each(['new-header', 'expiry', 'pause', 'stop', 'live-pause', 'reconnect'] as const)('%s cancels a delayed terminal correction', async action => {
    const { live, submit, releases } = deferredLive();
    submit('A'); releases[0]!({ text: 'A' }); await tick();
    const h = live.reviewTarget()!, t = terminal(h);
    t.line(`e ${t.choice()}`);
    if (action === 'new-header') t.receive({ type: 'review_invalidated', authorizationId: h.authorizationId, generation: h.generation, utteranceId: 'B' });
    if (action === 'expiry') t.advance(120_001);
    if (action === 'pause' || action === 'stop') {
      t.message('output_status', 'status', { ...t.out, state: action === 'pause' ? 'paused' : 'off', generation: 2 });
      t.message('output_status', 'status', { ...t.out, generation: 3 });
    }
    if (action === 'live-pause') {
      t.message('live_status', 'status', { ...t.live, state: 'paused', generation: 2 });
      t.message('live_status', 'status', { ...t.live, generation: 3 });
    }
    if (action === 'reconnect') t.close();
    t.answer('My delayed correction');
    expect(t.sent.filter(m => m.type === 'speak_reviewed')).toEqual([]);
    live.close();
  });

  it('concurrent terminal editors and callbacks cannot overwrite the approved string', async () => {
    const { live, submit, releases } = deferredLive();
    submit('A'); releases[0]!({ text: 'A' }); await tick();
    const t = terminal(live.reviewTarget()!), choice = t.choice();
    t.line(`e ${choice}`); t.line(`e ${choice}`);
    t.answer('  Exact NASA text!  ', 0); t.answer('Other edit', 1);
    expect(t.sent).toMatchObject([{ type: 'speak_reviewed', utteranceId: 'A', candidate: 'edited', text: '  Exact NASA text!  ' }]);
    live.close();
  });
});
