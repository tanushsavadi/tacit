import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Controller, type CallLike, type CandidateGenerator, type GeneratedCandidates, type SpeakResult } from './controller.ts';
import type { RecognitionResult, TurnRecord } from '../../shared/protocol.ts';

class FakeCall extends EventEmitter implements CallLike {
  transport = 'simulated' as const;
  startedAt = Date.now();
  spoken: Array<{ text: string; replyId: string }> = [];
  cancelled = 0;
  hungUp = false;
  private pending: Array<{ resolve: (r: SpeakResult) => void; reject: (e: Error) => void; replyId: string }> = [];
  constructor(public id: string) {
    super();
  }
  speak(text: string, opts: { replyId: string }): Promise<SpeakResult> {
    this.spoken.push({ text, replyId: opts.replyId });
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject, replyId: opts.replyId }));
  }
  finishSpeak(ack = false): void {
    const p = this.pending.shift()!;
    const t = Date.now();
    p.resolve({
      replyId: p.replyId,
      ttsRequestTs: t,
      ttsFirstByteTs: t + 1,
      firstAudioSentTs: t + 2,
      lastAudioSentTs: t + 3,
      audioMs: 900,
      ...(ack ? { playbackAckTs: t + 4, playbackAckKind: 'test-ack' } : {}),
    });
  }
  failSpeak(message: string): void {
    this.pending.shift()!.reject(new Error(message));
  }
  cancelSpeech(): void {
    this.cancelled += 1;
  }
  async hangup(): Promise<void> {
    this.hungUp = true;
  }
}

const three = (a: string, b: string, c: string): GeneratedCandidates => ({
  options: [a, b, c].map((text, index) => ({ index, text, intent: `intent${index}`, phrasingIndex: 0 })),
  mode: 'baseline',
  distinguishability: null,
  model: 'fake-model',
  generationMs: 5,
});

const recog = (candidateSetId: string, bestIndex: number, over: Partial<RecognitionResult> = {}): RecognitionResult => ({
  candidateSetId,
  model: 'fake-vsr',
  method: 'test',
  scores: [],
  bestIndex,
  margin: 0.5,
  freeDecode: null,
  abstain: false,
  abstainReason: null,
  framesUsed: 60,
  fps: 25,
  timings: { decodeMs: 1, preprocessMs: 1, inferenceMs: 1, totalMs: 3 },
  ...over,
});

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('Controller', () => {
  let call: FakeCall;
  let closed: TurnRecord[];
  let generate: Mock<CandidateGenerator>;
  let c: Controller;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    call = new FakeCall('call-1');
    closed = [];
    generate = vi.fn<CandidateGenerator>(async () => three('Yes, I would love to', 'No, thank you', 'Maybe later'));
    c = new Controller({ generate, onTurnClosed: (t) => closed.push(t), confirmGuardMs: 600, proposalTtlMs: 20_000 });
  });
  afterEach(() => vi.useRealTimers());

  const toOptions = async (text = 'Do you want coffee?') => {
    c.attachCall(call);
    call.emit('utterance', { utteranceId: 'u1', text, tsSpeechEnd: Date.now() - 200, tsTranscriptFinal: Date.now() });
    await flush();
    return c.snapshot().candidateSet!;
  };

  const toProposal = async (index = 1) => {
    const set = await toOptions();
    expect(c.selectionStarted(set.id).accepted).toBe(true);
    expect(c.recognitionResult(recog(set.id, index)).accepted).toBe(true);
    return { set, proposal: c.snapshot().proposal! };
  };

  it('returns to LISTENING when caller speech transcribes to nothing', () => {
    c.attachCall(call);
    call.emit('transcript', { text: '…', isFinal: false });
    expect(c.snapshot().phase).toBe('TRANSCRIBING');
    call.emit('transcript', { text: '', isFinal: false });
    expect(c.snapshot().phase).toBe('LISTENING');
    expect(generate).not.toHaveBeenCalled();
  });

  it('mouth-gesture selection is only a proposal: guarded, stale-checked, and needs confirmation', async () => {
    const set = await toOptions();
    expect(c.gestureSelect('old-set', 0, 'm1').accepted).toBe(false);
    expect(c.gestureSelect(set.id, 2, 'neutral-calibrated-mouth-gestures-v1').accepted).toBe(true);
    const p = c.snapshot().proposal!;
    expect(p).toMatchObject({ source: 'mouth', index: 2, method: 'neutral-calibrated-mouth-gestures-v1' });
    expect(call.spoken).toHaveLength(0);
    expect(c.confirm({ source: 'key', proposalId: p.id }).reason).toBe('too_early');
    vi.advanceTimersByTime(600);
    expect(c.confirm({ source: 'key', proposalId: p.id }).accepted).toBe(true);
    expect(call.spoken.map((s) => s.text)).toEqual(['Maybe later']);
    expect(c.gestureSelect(set.id, 0, 'm1').accepted).toBe(false); // not while speaking
    call.finishSpeak();
    await flush();
    expect(closed.at(-1)).toMatchObject({ selectionSource: 'mouth', selectionMethod: 'neutral-calibrated-mouth-gestures-v1' });
  });

  it('ignores a duplicate delivery of the same caller utterance', async () => {
    const set = await toOptions();
    call.emit('utterance', { utteranceId: 'u1', text: 'Do you want coffee?', tsTranscriptFinal: Date.now() });
    await flush();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(c.snapshot().candidateSet!.id).toBe(set.id);
    expect(c.snapshot().transcript.filter((e) => e.role === 'caller')).toHaveLength(1);
  });

  it('the same utterance id on a NEW call is not treated as a duplicate', async () => {
    await toOptions();
    expect(c.rejectAll().accepted).toBe(true);
    c.callEnded('test');
    const call2 = new FakeCall('call-2');
    c.attachCall(call2);
    call2.emit('utterance', { utteranceId: 'u1', text: 'New call, same id', tsTranscriptFinal: Date.now() });
    await flush();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('walks the happy path and speaks exactly the confirmed option', async () => {
    expect(c.snapshot().phase).toBe('DISCONNECTED');
    c.attachCall(call);
    expect(c.snapshot().phase).toBe('LISTENING');
    call.emit('transcript', { text: 'Do you', isFinal: false });
    expect(c.snapshot().phase).toBe('TRANSCRIBING');
    call.emit('utterance', { utteranceId: 'u1', text: 'Do you want coffee?', tsSpeechEnd: 999_800, tsTranscriptFinal: 1_000_000 });
    expect(c.snapshot().phase).toBe('GENERATING');
    await flush();
    const set = c.snapshot().candidateSet!;
    expect(c.snapshot().phase).toBe('OPTIONS_READY');
    expect(set.options.map((o) => o.text)).toEqual(['Yes, I would love to', 'No, thank you', 'Maybe later']);

    c.selectionStarted(set.id);
    expect(c.snapshot().phase).toBe('SELECTING');
    c.recognitionResult(recog(set.id, 1));
    const proposal = c.snapshot().proposal!;
    expect(c.snapshot().phase).toBe('AWAITING_CONFIRMATION');
    expect(proposal.text).toBe('No, thank you');
    expect(call.spoken).toHaveLength(0);

    vi.advanceTimersByTime(700);
    expect(c.confirm({ source: 'key', proposalId: proposal.id }).accepted).toBe(true);
    expect(c.snapshot().phase).toBe('SYNTHESIZING');
    expect(call.spoken).toEqual([{ text: 'No, thank you', replyId: expect.any(String) }]);

    call.emit('speaking', { replyId: call.spoken[0]!.replyId, state: 'first_audio' });
    expect(c.snapshot().phase).toBe('SPEAKING');
    call.finishSpeak(true);
    await flush();
    const snap = c.snapshot();
    expect(snap.phase).toBe('LISTENING');
    expect(snap.transcript.at(-1)).toMatchObject({ role: 'user', text: 'No, thank you', via: { selection: 'mouth', confirm: 'key' } });
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ outcome: 'spoken', chosenIndex: 1, spokenText: 'No, thank you', playbackAckKind: 'test-ack' });
    expect(closed[0]!.t.playbackAck).toBeDefined();
  });

  it('never speaks on recognition alone', async () => {
    await toProposal(0);
    vi.advanceTimersByTime(5_000);
    expect(call.spoken).toHaveLength(0);
    expect(c.snapshot().phase).toBe('AWAITING_CONFIRMATION');
  });

  it('withdraws an unconfirmed proposal after the timeout without speaking', async () => {
    await toProposal(0);
    vi.advanceTimersByTime(20_001);
    expect(c.snapshot().phase).toBe('CANCELLED');
    expect(c.snapshot().proposal).toBeNull();
    expect(call.spoken).toHaveLength(0);
  });

  it('ignores a nod that began before the proposal could be read (time guard)', async () => {
    const { proposal } = await toProposal(2);
    expect(c.gesture({ gesture: 'nod', t: proposal.proposedAt + 100 })).toEqual({ accepted: false, reason: 'too_early' });
    expect(call.spoken).toHaveLength(0);
    vi.advanceTimersByTime(800);
    expect(c.gesture({ gesture: 'nod', t: Date.now() }).accepted).toBe(true);
    expect(call.spoken.map((s) => s.text)).toEqual(['Maybe later']);
    expect(c.snapshot().airpods.lastGesture).toMatchObject({ gesture: 'nod', accepted: true });
  });

  it('ignores nods when nothing is awaiting confirmation', async () => {
    await toOptions();
    expect(c.gesture({ gesture: 'nod', t: Date.now() }).accepted).toBe(false);
    expect(call.spoken).toHaveLength(0);
  });

  it('requires a matching proposal id from on-screen controls', async () => {
    const { proposal } = await toProposal(0);
    vi.advanceTimersByTime(700);
    expect(c.confirm({ source: 'key' }).reason).toBe('proposal_id_required');
    expect(c.confirm({ source: 'tap', proposalId: 'something-else' }).reason).toBe('stale_proposal');
    expect(call.spoken).toHaveLength(0);
    expect(c.confirm({ source: 'tap', proposalId: proposal.id }).accepted).toBe(true);
  });

  it('cannot double-speak: a second confirm is rejected', async () => {
    const { proposal } = await toProposal(0);
    vi.advanceTimersByTime(700);
    expect(c.confirm({ source: 'key', proposalId: proposal.id }).accepted).toBe(true);
    expect(c.confirm({ source: 'key', proposalId: proposal.id }).accepted).toBe(false);
    expect(c.gesture({ gesture: 'nod', t: Date.now() }).accepted).toBe(false);
    expect(call.spoken).toHaveLength(1);
  });

  it('shake cancels the proposal and keeps the options available', async () => {
    const { set } = await toProposal(0);
    expect(c.gesture({ gesture: 'shake', t: Date.now() }).accepted).toBe(true);
    expect(c.snapshot().phase).toBe('CANCELLED');
    expect(c.snapshot().candidateSet!.id).toBe(set.id);
    expect(call.spoken).toHaveLength(0);
    // and the user can try again
    expect(c.selectionStarted(set.id).accepted).toBe(true);
    c.recognitionResult(recog(set.id, 2));
    expect(c.snapshot().proposal!.text).toBe('Maybe later');
  });

  it('abstains without proposing when recognition is not confident', async () => {
    const set = await toOptions();
    c.selectionStarted(set.id);
    c.recognitionResult(recog(set.id, 0, { abstain: true, abstainReason: 'low_margin' }));
    const snap = c.snapshot();
    expect(snap.phase).toBe('ABSTAINED');
    expect(snap.proposal).toBeNull();
    expect(snap.notice?.kind).toBe('abstained');
    expect(snap.turn!.abstentions).toBe(1);
    expect(c.confirm({ source: 'nod', t: Date.now() + 5_000 }).accepted).toBe(false);
    expect(call.spoken).toHaveLength(0);
  });

  it('drops recognition results for a superseded candidate set', async () => {
    const first = await toOptions();
    c.selectionStarted(first.id);
    // Options are replaced while the clip is still being scored.
    c.cancel({ source: 'key' });
    generate.mockResolvedValueOnce(three('Tea please', 'Just water', 'Nothing for me'));
    c.requestAlternatives();
    await flush();
    const second = c.snapshot().candidateSet!;
    expect(second.id).not.toBe(first.id);
    expect(c.recognitionResult(recog(first.id, 0)).reason).toBe('stale_candidate_set');
    expect(c.snapshot().proposal).toBeNull();
    expect(c.selectionStarted(first.id).accepted).toBe(false);
  });

  it('drops a recognition result that arrives when no selection is in progress', async () => {
    const set = await toOptions();
    expect(c.recognitionResult(recog(set.id, 0)).accepted).toBe(false);
    expect(c.snapshot().phase).toBe('OPTIONS_READY');
  });

  it('discards a slow generation result once a newer caller utterance arrived', async () => {
    let release!: (g: GeneratedCandidates) => void;
    generate.mockImplementationOnce(() => new Promise<GeneratedCandidates>((r) => (release = r)));
    c.attachCall(call);
    call.emit('utterance', { utteranceId: 'u1', text: 'Are you free today?' });
    generate.mockResolvedValueOnce(three('Around noon', 'After five', 'Not sure yet'));
    call.emit('utterance', { utteranceId: 'u2', text: 'What time works?' });
    await flush();
    release(three('Yes I am', 'No sorry', 'Let me check'));
    await flush();
    expect(c.snapshot().candidateSet!.options[0]!.text).toBe('Around noon');
    expect(closed.map((t) => t.outcome)).toEqual(['superseded']);
  });

  it('does not replace options mid-selection; the new utterance is handled afterwards', async () => {
    const { set, proposal } = await toProposal(0);
    generate.mockResolvedValueOnce(three('Oat milk', 'No milk', 'Either is fine'));
    call.emit('utterance', { utteranceId: 'u2', text: 'Milk or no milk?' });
    await flush();
    expect(c.snapshot().candidateSet!.id).toBe(set.id);
    expect(c.snapshot().pendingCallerUtterance).toBe(true);
    vi.advanceTimersByTime(700);
    c.confirm({ source: 'key', proposalId: proposal.id });
    call.finishSpeak();
    await flush();
    await flush();
    expect(c.snapshot().phase).toBe('OPTIONS_READY');
    expect(c.snapshot().candidateSet!.options.map((o) => o.text)).toEqual(['Oat milk', 'No milk', 'Either is fine']);
    expect(c.snapshot().pendingCallerUtterance).toBe(false);
  });

  it('tap selection is a proposal too and still needs confirmation', async () => {
    const set = await toOptions();
    expect(c.directSelect(set.id, 2, 'tap').accepted).toBe(true);
    expect(c.snapshot().phase).toBe('AWAITING_CONFIRMATION');
    expect(c.snapshot().proposal).toMatchObject({ source: 'tap', text: 'Maybe later' });
    expect(call.spoken).toHaveLength(0);
    expect(c.directSelect(set.id, 9, 'tap').reason).toBe('bad_index');
  });

  it('request alternatives yields a new set and tells the generator what to avoid', async () => {
    const set = await toOptions();
    generate.mockResolvedValueOnce(three('Tea please', 'Just water', 'Nothing for me'));
    expect(c.requestAlternatives().accepted).toBe(true);
    await flush();
    const next = c.snapshot().candidateSet!;
    expect(next.id).not.toBe(set.id);
    expect(next.alternativesRound).toBe(1);
    expect(generate.mock.calls[1]![0].avoid).toEqual(['Yes, I would love to', 'No, thank you', 'Maybe later']);
  });

  it('reject-all sends nothing and returns to listening', async () => {
    await toProposal(0);
    expect(c.rejectAll().accepted).toBe(true);
    expect(c.snapshot().phase).toBe('LISTENING');
    expect(call.spoken).toHaveLength(0);
    expect(closed.at(-1)!.outcome).toBe('rejected_all');
  });

  it('cancel during speech stops audio and ignores the late speak result', async () => {
    const { proposal } = await toProposal(0);
    vi.advanceTimersByTime(700);
    c.confirm({ source: 'key', proposalId: proposal.id });
    expect(c.cancel({ source: 'key' }).reason).toBe('speech_cancelled');
    expect(call.cancelled).toBe(1);
    call.finishSpeak();
    await flush();
    const snap = c.snapshot();
    expect(snap.phase).toBe('CANCELLED');
    expect(snap.transcript.filter((e) => e.role === 'user')).toHaveLength(0);
    expect(snap.speech?.state).toBe('cancelled');
  });

  it('surfaces a voice failure as an error and lets the user retry', async () => {
    const { set, proposal } = await toProposal(0);
    vi.advanceTimersByTime(700);
    c.confirm({ source: 'key', proposalId: proposal.id });
    call.failSpeak('provider 500');
    await flush();
    expect(c.snapshot().phase).toBe('ERROR');
    expect(c.snapshot().notice?.message).toContain('provider 500');
    expect(c.selectionStarted(set.id).accepted).toBe(true);
  });

  it('surfaces a generation failure and can retry', async () => {
    generate.mockRejectedValueOnce(new Error('quota'));
    c.attachCall(call);
    call.emit('utterance', { utteranceId: 'u1', text: 'Hello?' });
    await flush();
    expect(c.snapshot().phase).toBe('ERROR');
    expect(c.requestAlternatives().accepted).toBe(true);
    await flush();
    expect(c.snapshot().phase).toBe('OPTIONS_READY');
  });

  it('call end mid-speech discards the result and never leaks into the next call', async () => {
    const { proposal } = await toProposal(0);
    vi.advanceTimersByTime(700);
    c.confirm({ source: 'key', proposalId: proposal.id });
    call.emit('end', { reason: 'caller hung up' });
    expect(c.snapshot().phase).toBe('DISCONNECTED');
    expect(closed.at(-1)!.outcome).toBe('call_ended');

    const call2 = new FakeCall('call-2');
    expect(c.attachCall(call2)).toBe(true);
    call.finishSpeak();
    call.emit('utterance', { utteranceId: 'ghost', text: 'ghost from old call' });
    await flush();
    const snap = c.snapshot();
    expect(snap.sessionId).toBe('call-2');
    expect(snap.phase).toBe('LISTENING');
    expect(snap.transcript).toHaveLength(0);
    expect(call2.spoken).toHaveLength(0);
  });

  it('rejects a second simultaneous call', async () => {
    c.attachCall(call);
    const other = new FakeCall('call-2');
    expect(c.attachCall(other)).toBe(false);
    expect(other.hungUp).toBe(true);
    expect(c.snapshot().sessionId).toBe('call-1');
  });

  it('records real event timestamps in order', async () => {
    const set = await toOptions();
    vi.advanceTimersByTime(120);
    c.candidatesDisplayed(set.id, Date.now());
    vi.advanceTimersByTime(900);
    c.selectionStarted(set.id, Date.now());
    vi.advanceTimersByTime(2_000);
    c.recognitionResult(recog(set.id, 0));
    const proposal = c.snapshot().proposal!;
    vi.advanceTimersByTime(1_000);
    c.confirm({ source: 'key', proposalId: proposal.id });
    vi.advanceTimersByTime(300);
    call.finishSpeak();
    await flush();
    const t = closed[0]!.t;
    const order = [t.callerSpeechEnd, t.transcriptFinal, t.generationRequested, t.candidatesReady, t.candidatesDisplayed, t.selectionStart, t.recognitionResult, t.proposal, t.confirmation, t.ttsRequest, t.ttsFirstByte, t.firstAudioSent, t.lastAudioSent];
    expect(order.every((v) => typeof v === 'number')).toBe(true);
    expect([...order].sort((a, b) => a! - b!)).toEqual(order);
    expect(t.playbackAck).toBeUndefined(); // no ack was provided, so none may be claimed
  });
});
