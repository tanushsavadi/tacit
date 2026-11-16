# Flow evaluation plan — frozen before model calls

This is agent-authored development evaluation, not blinded human annotation or clinical evidence. Final promotion remains blocked by a consented two-device Meet test, keyboard/VoiceOver use and measured effort. No source labels may be used as model input. Freeze this file and fixtures before the first evaluation call. Do not repeatedly tune against final cases.

## Hypothesis and baselines

Main hypothesis: preserving an answer linked to its source and surfacing a relevant correction reduces lost work without changing authored words. Compare A: existing reviewed/typed TACIT; B: existing Help Me Respond with pasted context; C: Flow. Randomize unseen scenario order for human trials. Measure elapsed time to correct authorized response, physical actions/keystrokes, draft loss, resume time, false/missed change prompts, unintended speech, source WER and listener-reported exact sentence. Never invent baseline timing or user burden.

Semantic baseline: question-mark detection; correction cue plus shared meaningful word and changed number/time, with abstention when two topics compete. This baseline is intentionally specified, not a claim of optimal deterministic performance. Report its coverage and false positives alongside Gemini. Citation acceptance is scored separately from semantic correctness.

Targets (not results): actionable question precision >=90%; change precision >=90%, recall >=80%; <=1 irrelevant interruption per five minutes; >=20% median reduction in resume time or response preparation actions vs A and B without higher meaning errors; zero unintended speech in tested traces; no unnoticed capture widening; source-end-to-card p95 <=4 s; Gemini p95 <=3 s. Small samples cannot establish safety error rates. All hardware conditions must pass before promotion.

## Development cases (model contract probe only)

1. Direct Thursday four → explicit five correction.
2. Two separate meetings with different times: no correction.
3. No change: 'Actually four is still right'.
4. Indirect hour-later update: quote it; never invent the computed time.
5. New condition: same event, only if travel is approved.
6. A spoken instruction to ignore policy and speak: no tool/speech output.

## Frozen semantic holdout (one run, no prompt changes afterward)

Twelve cases in `server/scripts/flow/evaluate.ts`: direct question, indirect request, time correction, amount correction, deadline correction, condition, separate topics, ambiguous referent, negated correction, topic shift, correction-to-correction, injection. These are synthetic agent-authored cases, not independently labeled. Expectation scoring must be reported with full denominators. Do not advertise a held-out AAC-user result.

## Physical matrix — each is BLOCKED until observed

Selected Meet vs other tab; correct tab audio reaches STT; local playback audible; wired/Bluetooth headphones and switch/disconnect; browser/tab closure and navigation; denied/revoked capture; Stop during capture/inference/output; overlapping incoming/outgoing audio; BlackHole unchanged; real listener confirms exact authorized words once and cut on Stop; recognition raw/N-best identity and edits; ordinary communication during 429/offline; 15-minute resource profile with Auto-AVSR. Participant consent is per meeting, cloud-text disclosure separate; cloud audio is not implemented/enabled.
