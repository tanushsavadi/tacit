import { describe, expect, it } from 'vitest';
import type { RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';
import { AUTOMATIC_GATED, LIVE_CAPABILITY, LiveSession, MAX_INFLIGHT, type Recognizer } from './live.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
function setup(recognize?: Recognizer) {
  const out: ServerMessage[] = [];
  const calls: { timesMs: number[]; frames: Buffer[] }[] = [];
  const rec: Recognizer = recognize ?? (async (input) => { calls.push(input); return { text: "IT'S ELEVEN O'CLOCK", model: 'm', gate: { nbest_margin_per_token: 0.3 }, ms: { total: 5 } }; });
  const live = new LiveSession(rec, (m) => out.push(m));
  const hyps = () => out.filter((m) => m.type === 'recognition_hypothesis').map((m) => (m as { hypothesis: RecognitionHypothesis }).hypothesis);
  const status = () => live.current;
  return { live, out, calls, hyps, status };
}
const send = (live: LiveSession, auth: string, id: string, n = 3) => {
  live.utterance({ type: 'visual_utterance', utteranceId: id, authorizationId: auth, startMs: 0, endMs: 100, endpointMs: 120, frameTimesMs: Array.from({ length: n }, (_, i) => 1000 + i * 33) });
  for (let i = 0; i < n; i++) live.frame(Buffer.from([0xff, 0xd8, i]));
};

describe('LiveSession (tacit-live-v1)', () => {
  it('refuses automatic mode; display-only activation recognises and shows, never transmits', async () => {
    const { live, calls, hyps, status } = setup();
    live.control({ type: 'live_control', action: 'activate', mode: 'automatic' });
    expect(status().state).toBe('off');
    expect(status().reason).toBe(AUTOMATIC_GATED);
    live.control({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
    expect(status()).toMatchObject({ state: 'active', mode: 'display-only', autoTransmitAllowed: false });
    send(live, status().authorizationId!, 'u1');
    await tick();
    expect(calls[0]!.frames).toHaveLength(3);
    expect(hyps()[0]).toMatchObject({ utteranceId: 'u1', rawText: "IT'S ELEVEN O'CLOCK", decision: 'shown', transmitted: false, uncertainty: { calibrated: false } });
  });

  it('rejects stale authorizations and paused sessions, swallowing their frames', async () => {
    const { live, calls, hyps, status } = setup();
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    send(live, 'someone-else', 'u1');
    live.control({ type: 'live_control', action: 'pause' });
    send(live, auth, 'u2');
    await tick();
    expect(calls).toHaveLength(0);
    expect(hyps().map((h) => [h.utteranceId, h.decision])).toEqual([['u1', 'abstained'], ['u2', 'abstained']]);
    expect(live.droppedBinary).toBe(0);
  });

  it('drops a result that finishes after pause/interrupt (generation changed)', async () => {
    let release!: () => void;
    const { live, hyps, status } = setup(() => new Promise((r) => { release = () => r({ text: 'HELLO' }); }));
    live.control({ type: 'live_control', action: 'activate' });
    send(live, status().authorizationId!, 'u1');
    live.control({ type: 'live_control', action: 'interrupt' });
    release();
    await tick();
    expect(hyps()[0]).toMatchObject({ decision: 'abstained', rawText: '' });
    expect(hyps()[0]!.reason).toMatch(/Dropped/);
  });

  it('enforces frame count, ordering and size limits; abstains on no face', async () => {
    const { live, hyps, status } = setup(async () => ({ text: null, error: 'no face tracked' }));
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    live.utterance({ type: 'visual_utterance', utteranceId: 'bad-order', authorizationId: auth, startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [5, 4] });
    live.frame(Buffer.alloc(1)); live.frame(Buffer.alloc(1));
    live.utterance({ type: 'visual_utterance', utteranceId: 'big', authorizationId: auth, startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [1, 2] });
    live.frame(Buffer.alloc(LIVE_CAPABILITY.maxBytes)); live.frame(Buffer.alloc(10));
    send(live, auth, 'noface');
    await tick();
    expect(hyps().map((h) => [h.utteranceId, h.decision, h.reason?.slice(0, 12)])).toEqual([
      ['bad-order', 'abstained', 'Frame times '], ['big', 'abstained', 'Utterance la'], ['noface', 'abstained', 'no face trac']]);
  });

  it('answers a duplicate utteranceId once as abstained and never recognises it twice', async () => {
    const { live, calls, hyps, status } = setup();
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    send(live, auth, 'u1');
    send(live, auth, 'u1');
    send(live, auth, 'u2');
    await tick();
    expect(calls).toHaveLength(2);
    expect(hyps().map((h) => [h.utteranceId, h.decision, h.reason?.slice(0, 9) ?? null])).toEqual([
      ['u1', 'abstained', 'Duplicate'], ['u1', 'shown', null], ['u2', 'shown', null]]);
    expect(live.droppedBinary).toBe(0);
  });

  it('a new header before the previous frames completed abstains the incomplete utterance (exactly one answer each)', async () => {
    const { live, calls, hyps, status } = setup();
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    live.utterance({ type: 'visual_utterance', utteranceId: 'cut', authorizationId: auth, startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [1, 2, 3] });
    live.frame(Buffer.alloc(1));
    send(live, auth, 'next');
    await tick();
    expect(calls).toHaveLength(1);
    expect(hyps().map((h) => [h.utteranceId, h.decision, h.reason?.slice(0, 10) ?? null])).toEqual([
      ['cut', 'abstained', 'Incomplete'], ['next', 'shown', null]]);
  });

  it('bounds queued recognitions: beyond MAX_INFLIGHT the utterance abstains as busy instead of queueing', async () => {
    const releases: (() => void)[] = [];
    const { live, hyps, status } = setup(() => new Promise((r) => { releases.push(() => r({ text: 'HI' })); }));
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    for (let i = 0; i < MAX_INFLIGHT + 1; i++) send(live, auth, `u${i}`);
    await tick();
    expect(releases).toHaveLength(MAX_INFLIGHT);
    expect(hyps()).toHaveLength(1);
    expect(hyps()[0]).toMatchObject({ utteranceId: `u${MAX_INFLIGHT}`, decision: 'abstained' });
    expect(hyps()[0]!.reason).toMatch(/busy/i);
    for (const r of releases) r();
    await tick();
    expect(hyps().filter((h) => h.decision === 'shown')).toHaveLength(MAX_INFLIGHT);
  });

  it('is shared across connections: frames are matched to their own sender; a disconnect drops only that utterance', async () => {
    const { live, calls, hyps, status } = setup();
    live.control({ type: 'live_control', action: 'activate' });
    const auth = status().authorizationId!;
    const A = {}, B = {};
    live.utterance({ type: 'visual_utterance', utteranceId: 'a', authorizationId: auth, startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [1, 2] }, A);
    live.utterance({ type: 'visual_utterance', utteranceId: 'b', authorizationId: auth, startMs: 0, endMs: 1, endpointMs: 1, frameTimesMs: [1, 2] }, B);
    live.frame(Buffer.from([1]), A); live.frame(Buffer.from([2]), B); live.frame(Buffer.from([3]), A);
    live.disconnect(B);
    await tick();
    expect(calls.map((c) => c.frames.map((f) => f[0]))).toEqual([[1, 3]]);
    expect(hyps().map((h) => [h.utteranceId, h.decision])).toEqual([['b', 'abstained'], ['a', 'shown']]);
  });

  it('ending Live clears authorization; frames without a header are ignored', () => {
    const { live, status } = setup();
    live.control({ type: 'live_control', action: 'activate' });
    live.close();
    expect(status()).toMatchObject({ state: 'off', authorizationId: null });
    live.frame(Buffer.alloc(3));
    expect(live.droppedBinary).toBe(1);
  });
});
