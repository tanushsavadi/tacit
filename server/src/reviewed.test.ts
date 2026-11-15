import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LiveStatus, RecognitionHypothesis, SpeechOutputStatus } from '../../shared/protocol.ts';
import { buildReviewedRequest } from './reviewed.ts';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const h: RecognitionHypothesis = {
  utteranceId: 'u1', authorizationId: 'L1', rawText: 'HELLO THERE', final: true, stable: false, uncertainty: null, model: 'm', source: 'visual-model',
  decision: 'shown', reason: null, recognitionMs: 1, stages: null, gate: null, transmitted: false, generation: 3, reviewExpiresAt: Date.now() + 120_000,
  reviewCandidates: [{ kind: 'raw', index: 0, text: 'HELLO THERE', textHash: sha('HELLO THERE') }, { kind: 'alternative', index: 1, text: 'HELLO BEAR', textHash: sha('HELLO BEAR') }],
};
const live = { authorizationId: 'L1', generation: 3, state: 'active' } as LiveStatus;
const out = { authorizationId: 'O1', generation: 7, state: 'ready' } as SpeechOutputStatus;

describe('buildReviewedRequest', () => {
  it('echoes the chosen candidate exactly with both authorizations and generations', () => {
    expect(buildReviewedRequest(h, { index: 1 }, out, live, 'r1')).toEqual({ type: 'speak_reviewed', requestId: 'r1', outputAuthorizationId: 'O1',
      outputGeneration: 7, liveAuthorizationId: 'L1', liveGeneration: 3, utteranceId: 'u1', candidate: 'alternative', index: 1, text: 'HELLO BEAR', textHash: sha('HELLO BEAR') });
  });
  it("a correction is sent as 'edited' with the hash of the user's own text", () => {
    expect(buildReviewedRequest(h, { index: 0, edited: 'Hello there!' }, out, live, 'r2')).toMatchObject({ candidate: 'edited', index: 0, text: 'Hello there!', textHash: sha('Hello there!') });
  });
  it('returns an explanation instead of a request when it cannot be valid', () => {
    expect(buildReviewedRequest(h, { index: 5 }, out, live, 'r')).toMatch(/No candidate 6/);
    expect(buildReviewedRequest({ ...h, decision: 'abstained', reviewCandidates: undefined }, { index: 0 }, out, live, 'r')).toMatch(/nothing to speak/);
    expect(buildReviewedRequest(h, { index: 0 }, { ...out, state: 'off', authorizationId: null }, live, 'r')).toMatch(/Voice output is off/);
    expect(buildReviewedRequest(h, { index: 0 }, out, { ...live, state: 'paused' }, 'r')).toMatch(/Live is paused/);
  });
  it('rejects stale Live identities, generations and expired/malformed deadlines locally', () => {
    expect(buildReviewedRequest(h, { index: 0 }, out, { ...live, authorizationId: 'other' }, 'r')).toMatch(/earlier Live/);
    expect(buildReviewedRequest(h, { index: 0 }, out, { ...live, generation: 4 }, 'r')).toMatch(/generation/);
    for (const expiry of [0, 10, Number.NaN, Infinity, undefined]) {
      expect(buildReviewedRequest({ ...h, reviewExpiresAt: expiry }, { index: 0 }, out, live, 'r', 10)).toMatch(/expired/);
    }
  });
});
