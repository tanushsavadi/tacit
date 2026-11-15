// Experimental recognizer profile (personal overlay): Review First is mandatory. Wrong or phantom words from such a
// profile are shown only; nothing is spoken unless the user presses Speak on the exact displayed candidate.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { RecognitionHypothesis, ServerMessage, SpeechDelivery, VoiceRouteStatus } from '../../shared/protocol.ts';
import { LiveSession, REVIEW_REQUIRED_PROFILE, profileTag, recognizerProfile, type Recognizer, type RecognizerResult } from './live.ts';
import { buildReviewedRequest } from './reviewed.ts';
import { SpeechOutput, UNVALIDATED_GATE } from './speech.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const EXPERIMENTAL = { id: 'personal-demo', experimental: true, reviewRequired: true };
const BASE = { id: 'base', experimental: false, reviewRequired: false };
const ready: VoiceRouteStatus = { state: 'ready', deviceName: 'BlackHole 16ch', deviceUid: 'bh', sampleRate: 48000, gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null };

function setup(result: () => RecognizerResult) {
  const out: ServerMessage[] = [];
  const rec: Recognizer = async () => result();
  const said: string[] = [];
  const route = Object.assign(new EventEmitter(), { status: () => ready, play: async () => ({ state: 'rendered' as const, startedAt: 1, renderedAt: 2 }), stop() {} });
  const speech = new SpeechOutput({ label: 'fake', synth: async (t: string) => { said.push(t); return { audio: Buffer.from('RIFF'), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'fake' }; } },
    () => route, () => ready, UNVALIDATED_GATE);
  const deliveries: SpeechDelivery[] = [];
  speech.on('delivery', (d) => deliveries.push(d));
  // Same wiring as index.ts: the only automatic path is speakRecognized while Live is in automatic mode.
  const refusals: string[] = [];
  const live: LiveSession = new LiveSession(rec, (m) => {
    out.push(m);
    if (m.type === 'recognition_hypothesis' && live.current.mode === 'automatic') {
      const r = speech.speakRecognized(m.hypothesis, live.current);
      if (r) refusals.push(r);
    }
  });
  const hyps = () => out.filter((m) => m.type === 'recognition_hypothesis').map((m) => (m as { hypothesis: RecognitionHypothesis }).hypothesis);
  const send = (id: string) => {
    live.utterance({ type: 'visual_utterance', utteranceId: id, authorizationId: live.current.authorizationId!, startMs: 0, endMs: 100, endpointMs: 120, frameTimesMs: [1000, 1033, 1066] });
    for (let i = 0; i < 3; i++) live.frame(Buffer.from([0xff, 0xd8, i]));
  };
  return { live, speech, said, deliveries, refusals, hyps, send };
}

describe('recognizer profile tag validation', () => {
  it('accepts only well-formed tags; malformed reports are treated as absent', () => {
    expect(profileTag(EXPERIMENTAL)).toEqual(EXPERIMENTAL);
    for (const bad of [null, 'x', {}, { id: '', experimental: true, reviewRequired: true }, { id: 'p', experimental: 'yes', reviewRequired: true }, { id: 'p', experimental: true }])
      expect(profileTag(bad)).toBeNull();
    expect(recognizerProfile({ ...EXPERIMENTAL, label: 'L', error: null, requested: 'personal-demo', extra: 1 }))
      .toEqual({ ...EXPERIMENTAL, label: 'L', error: null, requested: 'personal-demo' });
  });
});

describe('Live with an experimental profile', () => {
  it('real-time activation is refused while review is required; display-only works', () => {
    const { live } = setup(() => ({ text: 'X' }));
    live.setReviewRequired(true);
    live.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
    expect(live.current).toMatchObject({ state: 'off', reason: REVIEW_REQUIRED_PROFILE });
    live.control({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
    expect(live.current).toMatchObject({ state: 'active', mode: 'display-only', unreviewed: false });
  });

  it('switching to an experimental profile while real-time is on drops to display-only under a new generation', () => {
    const { live } = setup(() => ({ text: 'X' }));
    live.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
    const g = live.current.generation;
    live.setReviewRequired(true);
    expect(live.current).toMatchObject({ state: 'active', mode: 'display-only', unreviewed: false, reason: REVIEW_REQUIRED_PROFILE });
    expect(live.current.generation).toBe(g + 1);
    live.setReviewRequired(false); // a base recognizer again: real-time may be chosen again explicitly
    live.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
    expect(live.current).toMatchObject({ mode: 'automatic', unreviewed: true });
  });

  it('per-result enforcement: an experimental result arriving during real-time is never spoken', async () => {
    const { live, speech, said, hyps, send, refusals } = setup(() => ({ text: 'HELLO EVERYONE', model: 'm', profile: EXPERIMENTAL }));
    speech.control('enable');
    live.control({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
    send('u1'); await tick(); await tick();
    expect(hyps()[0]).toMatchObject({ decision: 'shown', recognizerProfile: EXPERIMENTAL });
    expect(live.current).toMatchObject({ mode: 'display-only', unreviewed: false });
    expect(said).toEqual([]);
    expect(refusals).toEqual([]); // not even attempted: Live left automatic mode before the broadcast
  });

  it('speakRecognized refuses an experimental result even under an (impossible) automatic status', () => {
    const { speech } = setup(() => ({ text: 'X' }));
    speech.control('enable');
    const h: RecognitionHypothesis = { utteranceId: 'u1', authorizationId: 'L1', rawText: 'HELLO EVERYONE', final: true, stable: false, uncertainty: null, model: 'm',
      source: 'visual-model', decision: 'shown', reason: null, recognitionMs: 1, stages: null, gate: null, transmitted: false, recognizerProfile: EXPERIMENTAL };
    const auto = { authorizationId: 'L1', generation: 1, state: 'active' as const, mode: 'automatic' as const, autoTransmitAllowed: false as const, unreviewed: true, reason: '' };
    expect(speech.speakRecognized(h, auto)).toMatch(/Review First/);
    expect(speech.speakRecognized({ ...h, utteranceId: 'u2', recognizerProfile: BASE }, auto)).toBeNull(); // base path unchanged
  });

  it('a wrong phrase is only displayed; only Speak on the exact displayed candidate voices it, once', async () => {
    const { live, speech, said, deliveries, hyps, send } = setup(() => ({ text: 'I BUILT THIS AT A HACKATHON', alternatives: ['HELLO EVERYONE'], model: 'm', profile: EXPERIMENTAL }));
    speech.control('enable');
    live.setReviewRequired(true);
    live.control({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
    send('u1'); await tick(); await tick();
    expect(hyps()).toHaveLength(1);
    expect(said).toEqual([]);
    expect(deliveries).toEqual([]);
    const req = buildReviewedRequest(live.reviewTarget()!, { index: 1 }, speech.status(), live.current, 'r1');
    expect(typeof req).toBe('object');
    speech.speakReviewed(req as Record<string, unknown>, live.current, live.reviewTarget());
    await tick(); await tick();
    expect(said).toEqual(['Hello everyone']);
    expect(deliveries.filter((d) => d.state === 'rendered')).toEqual([expect.objectContaining({ source: 'reviewed-recognition', text: 'HELLO EVERYONE' })]);
  });

  it('phantom resting-face text: shown, never spoken, and Stop leaves nothing queued', async () => {
    const { live, speech, said, deliveries, send } = setup(() => ({ text: 'THANK YOU', model: 'm', profile: EXPERIMENTAL }));
    speech.control('enable');
    live.setReviewRequired(true);
    live.control({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
    for (const id of ['r1', 'r2', 'r3']) { send(id); await tick(); await tick(); }
    speech.control('stop');
    await tick();
    expect(said).toEqual([]);
    expect(deliveries.filter((d) => d.state === 'rendered' || d.state === 'queued' || d.state === 'synthesizing')).toEqual([]);
  });
});
