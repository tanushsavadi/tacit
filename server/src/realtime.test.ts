// Real-time (unreviewed) speech: the user's explicit per-activation choice. No reliability gate is validated.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { LiveStatus, RecognitionHypothesis, ServerMessage, SpeechDelivery, VoiceRouteStatus } from '../../shared/protocol.ts';
import { AUTOMATIC_GATED, LiveSession, REALTIME_DISABLED, REALTIME_REASON, type Recognizer } from './live.ts';
import type { OutputRoute, PlayOutcome } from './route.ts';
import { SpeechOutput, UNVALIDATED_GATE } from './speech.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const ready: VoiceRouteStatus = { state: 'ready', deviceName: 'BlackHole 16ch', deviceUid: 'bh', sampleRate: 48000, gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null };
class FakeRoute extends EventEmitter implements OutputRoute {
  plays: { id: string; resolve: (o: PlayOutcome) => void }[] = [];
  status() { return ready; }
  play(id: string) { return new Promise<PlayOutcome>((resolve) => this.plays.push({ id, resolve })); }
  stop(reason: string) { for (const p of this.plays.splice(0)) p.resolve({ state: 'interrupted', reason }); }
  finishAll() { for (const p of this.plays.splice(0)) p.resolve({ state: 'rendered', startedAt: 1, renderedAt: 2 }); }
}
function speechSetup() {
  const route = new FakeRoute();
  const said: string[] = [];
  const tts = { label: 'fake', synth: async (t: string) => { said.push(t); return { audio: Buffer.from('RIFF'), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'fake' }; } };
  const out = new SpeechOutput(tts, () => route, () => ready, UNVALIDATED_GATE);
  const deliveries: SpeechDelivery[] = [];
  out.on('delivery', (d) => deliveries.push(d));
  return { out, route, said, deliveries };
}
const realtime: LiveStatus = { authorizationId: 'L1', generation: 2, state: 'active', mode: 'automatic', autoTransmitAllowed: false, unreviewed: true, reason: '' };
const hyp = (over: Partial<RecognitionHypothesis> = {}): RecognitionHypothesis => ({
  utteranceId: 'u1', authorizationId: 'L1', rawText: 'HOW ARE YOU DOING', final: true, stable: false, uncertainty: null, model: 'm',
  source: 'visual-model', decision: 'shown', reason: null, recognitionMs: 300, stages: null, gate: null, transmitted: false, ...over });

describe('LiveSession — real-time activation', () => {
  const live = (allowed = true) => { const out: ServerMessage[] = []; const rec: Recognizer = async () => ({ text: 'X' }); return new LiveSession(rec, (m) => out.push(m), Date.now, allowed); };

  it('automatic without the explicit acknowledgement stays refused', () => {
    const l = live();
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic' });
    expect(l.current).toMatchObject({ state: 'off', reason: AUTOMATIC_GATED });
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: false });
    expect(l.current.state).toBe('off');
  });

  it('acknowledged → active automatic + unreviewed; the gate stays unvalidated', () => {
    const l = live();
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic', inputSource: 'camera', acknowledgeUnreviewed: true });
    expect(l.current).toMatchObject({ state: 'active', mode: 'automatic', unreviewed: true, autoTransmitAllowed: false, reason: REALTIME_REASON });
  });

  it('TACIT_REALTIME=off (realtimeAllowed=false) refuses it', () => {
    const l = live(false);
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true });
    expect(l.current).toMatchObject({ state: 'off', reason: REALTIME_DISABLED });
  });

  it('a display-only activation or End turns real-time off', () => {
    const l = live();
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true });
    l.control({ type: 'live_control', action: 'activate', mode: 'display-only' });
    expect(l.current).toMatchObject({ mode: 'display-only', unreviewed: false });
    l.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true });
    l.control({ type: 'live_control', action: 'end' });
    expect(l.current).toMatchObject({ state: 'off', mode: 'display-only', unreviewed: false });
  });
});

describe('SpeechOutput — real-time (unreviewed) recognised speech', () => {
  it('speaks the raw words once (cased for the voice only); dedups; refuses abstained/stale/unspeakable', async () => {
    const { out, route, said, deliveries } = speechSetup();
    out.control('enable');
    expect(out.speakRecognized(hyp(), realtime)).toBeNull();
    expect(out.speakRecognized(hyp(), realtime)).toMatch(/already spoken/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u2', authorizationId: 'OLD' }), realtime)).toMatch(/Stale/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u3', decision: 'abstained', rawText: '' }), realtime)).toMatch(/Not an accepted/);
    expect(out.speakRecognized(hyp({ utteranceId: 'u4', rawText: '…' }), realtime)).toMatch(/Not speakable/);
    await tick(); route.finishAll(); await tick();
    expect(said).toEqual(['How are you doing']);
    const done = deliveries.filter((d) => d.requestId === 'rec:L1:u1' && d.state === 'rendered');
    expect(done).toEqual([expect.objectContaining({ source: 'recognized', text: 'HOW ARE YOU DOING' })]);
  });

  it('never without the per-activation choice, voice output, or an active automatic Live', () => {
    const { out } = speechSetup();
    expect(out.speakRecognized(hyp(), realtime)).toMatch(/not enabled/);
    out.control('enable');
    expect(out.speakRecognized(hyp(), { ...realtime, unreviewed: false })).toBeTypeOf('string');
    expect(out.speakRecognized(hyp(), { ...realtime, mode: 'display-only' })).toBeTypeOf('string');
    expect(out.speakRecognized(hyp(), { ...realtime, state: 'paused' })).toMatch(/not in automatic/);
    out.control('pause');
    expect(out.speakRecognized(hyp({ utteranceId: 'u9' }), realtime)).toMatch(/not enabled/);
  });

  it('Stop interrupts real-time speech that is playing', async () => {
    const { out, route, deliveries } = speechSetup();
    out.control('enable');
    out.speakRecognized(hyp(), realtime);
    await tick();
    expect(route.plays).toHaveLength(1);
    out.control('stop'); await tick();
    expect(deliveries.find((d) => d.requestId === 'rec:L1:u1' && d.state === 'interrupted')).toBeTruthy();
  });

  it('a newer utterance does not cut real-time speech (only reviewed speech is invalidated)', async () => {
    const { out, route, deliveries } = speechSetup();
    out.control('enable');
    out.speakRecognized(hyp(), realtime);
    await tick();
    out.invalidateReviewed();
    route.finishAll(); await tick();
    expect(deliveries.find((d) => d.requestId === 'rec:L1:u1' && d.state === 'rendered')).toBeTruthy();
  });
});
