// Client-side helper for reviewed speech: turns the user's explicit choice (a shown candidate, or their correction of
// one) into the exact `speak_reviewed` message. Pure; the server re-validates everything (SpeechOutput.speakReviewed).
import { createHash } from 'node:crypto';
import type { ClientMessage, LiveStatus, RecognitionHypothesis, SpeechOutputStatus } from '../../shared/protocol.ts';

export type ReviewedRequest = Extract<ClientMessage, { type: 'speak_reviewed' }>;

/** Returns the message, or a human-readable reason why no valid request can be built. */
export function buildReviewedRequest(h: RecognitionHypothesis, choice: { index: number; edited?: string }, out: SpeechOutputStatus,
  live: LiveStatus, requestId: string): ReviewedRequest | string {
  const cands = h.decision === 'shown' ? h.reviewCandidates ?? [] : [];
  if (!cands.length) return 'This utterance has nothing to speak (abstained).';
  const c = cands[choice.index];
  if (!c) return `No candidate ${choice.index + 1}.`;
  if (out.state !== 'ready' || !out.authorizationId) return `Voice output is ${out.state}: enable it first.`;
  if (live.state !== 'active' || !live.authorizationId) return `Live is ${live.state}.`;
  const edited = choice.edited !== undefined;
  const text = edited ? choice.edited! : c.text;
  return { type: 'speak_reviewed', requestId, outputAuthorizationId: out.authorizationId, outputGeneration: out.generation,
    liveAuthorizationId: live.authorizationId, liveGeneration: h.generation ?? -1, utteranceId: h.utteranceId,
    candidate: edited ? 'edited' : c.kind, index: c.index, text, textHash: edited ? createHash('sha256').update(text, 'utf8').digest('hex') : c.textHash };
}
