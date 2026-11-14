import type { ClientMessage, Snapshot } from '../../../shared/protocol.ts';
import { canConfirm, canSelect } from '../candidateState.ts';

/** Isolated UI fixture. Never connects to a call, generates audio, or supplies vision data. */
export function previewSnapshot(now = Date.now(), variant: 'default' | 'long' = 'default'): Snapshot {
  const snapshot: Snapshot = {
    seq: 1, now, phase: 'OPTIONS_READY', sessionId: 'ui-preview', transport: 'simulated', callStartedAt: now,
    callerInterim: '', transcript: [{ role: 'caller', text: 'Would you like me to pick up dinner on my way over?', ts: now }],
    candidateSet: {
      id: 'preview-1', turnId: 'preview-turn', forUtteranceId: 'preview-caller', mode: 'baseline',
      options: [
        { index: 0, text: 'Yes, that would be lovely. Thank you.', intent: 'Accept', phrasingIndex: 0 },
        { index: 1, text: 'I’ve already eaten, but I’d love the company.', intent: 'Decline warmly', phrasingIndex: 0 },
        { index: 2, text: 'What did you have in mind?', intent: 'Ask a question', phrasingIndex: 0 },
      ],
      distinguishability: null, model: 'UI fixture (no LLM)', generatedAt: now, generationMs: 0, alternativesRound: 0,
    },
    recognition: null, proposal: null, speech: null, notice: null, turn: null, lastCompletedTurn: null,
    pendingCallerUtterance: false, candidateModeSetting: 'baseline',
    airpods: { helper: 'unavailable', authorized: null, available: false, connected: false, detail: null, lastGesture: null, lastMotionAt: null },
    services: {
      gemini: { configured: false, model: 'UI fixture (no LLM)' },
      recognition: { reachable: false, model: null, device: null, checkedAt: null },
      voice: { listening: false, publicUrl: null, providers: {} },
    },
  };
  if (variant === 'long') {
    snapshot.transcript[0]!.text = 'The appointment has moved to Thursday afternoon. I can pick you up, wait during the appointment, and bring dinner afterward. Would that work, or would you prefer that I arrange another day so we have more time together?';
    const texts = [
      'Thursday afternoon works for me. Thank you for offering to pick me up and wait during the appointment. Could you let me know what time we need to leave?',
      'I would prefer another day so that we have more time together. Let’s check the schedule before you arrange transportation or make plans for dinner.',
      'Could you tell me the appointment time and whether the building has an accessible entrance? I would like to confirm those details before deciding.',
    ];
    snapshot.candidateSet!.options.forEach((o, i) => { o.text = texts[i]!; });
  }
  return snapshot;
}
export function reducePreview(s: Snapshot, m: ClientMessage, now = Date.now()): Snapshot {
  const next = { ...s, seq: s.seq + 1, now };
  if ((m.type === 'tap_select' || m.type === 'head_select') && canSelect(s, true) && m.candidateSetId === s.candidateSet?.id) {
    const option = s.candidateSet.options.find(o => o.index === m.index);
    if (!option) return s;
    return { ...next, phase: 'AWAITING_CONFIRMATION', proposal: { id: `preview-proposal-${next.seq}`, candidateSetId: m.candidateSetId, index: m.index, text: option.text, source: m.type === 'tap_select' ? 'tap' : 'head', proposedAt: now, confirmableAt: now + 600, expiresAt: now + 15000 } };
  }
  if (m.type === 'confirm' && m.proposalId === s.proposal?.id && canConfirm(s, true, now)) return { ...next, phase: 'OPTIONS_READY', proposal: null, notice: { kind: 'info', message: 'Confirmed in UI preview. No audio was generated or sent.', ts: now } };
  if (m.type === 'cancel' && s.proposal) return { ...next, phase: 'CANCELLED', proposal: null };
  if (m.type === 'hangup' || m.type === 'sim_call_end') return { ...previewSnapshot(now), phase: 'DISCONNECTED', sessionId: null, candidateSet: null, transport: null };
  if (m.type === 'sim_call_start' || m.type === 'request_alternatives') return previewSnapshot(now);
  if (m.type === 'sim_caller_says') return { ...previewSnapshot(now), transcript: [{ role: 'caller', text: m.text, ts: now }] };
  if (m.type === 'reject_all') return { ...next, phase: 'LISTENING', candidateSet: null, proposal: null };
  return s;
}
