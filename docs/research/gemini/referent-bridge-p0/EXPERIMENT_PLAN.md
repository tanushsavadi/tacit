# P0 pre-registration

Written before implementation results or inference. Scope: external text-only executable; synthetic data only. No speech, services, camera, Meet, permissions, app or repository writes. Installed dependencies reused without npm install.

Primary criterion: a correctly selected referent and the complete user-authored position survive into an explicitly approved text artifact. Fluent wording that changes stance/condition fails.

Architecture: Gemini suggests exact source quotations and layout only. All options require an explicit user selection. User point is kept verbatim; constrained local rendering prevents omission/invention in composition. Semantic correctness/completeness of citations is not guaranteed by string matching. A correction conservatively invalidates all prior options, including unrelated ones: safety at a recall cost. Not an open-ended natural-language rewrite proof.

Six priority scenarios are the initial real-call set, in fixed order: later time, explicit correction, ambiguous two topics, leave-by-five condition, disagreement, injected instruction. Thirty authored scenarios (six groups × five variants) exercise the deterministic harness. Mock gold outputs are interface tests, not model accuracy evidence. Test-case labels and mock outputs are separated from real model prompts.

Baselines: (1) snapshot of actual Help Me Respond pure prompt/parser/validator (source hash recorded), (2) deterministic weekday/time chips, bare weekday fallback on an explicit correction, correction barrier, and earlier/later comparison within source-turn groups. The day fallback was added before any real calls to avoid a weak baseline that cannot handle the obvious Thursday example. Same input context and exact user point; no hidden gold given to any model. No online LLM judge.

Two initial real calls maximum TOTAL, no retries/fallback/models-list/warmups. Call 1 batches the six Bridge extraction inputs; call 2 batches the six Help Me Respond inputs using its actual SYSTEM/buildPrompt and schema in a batch envelope. This batching changes HMR execution and forbids latency-per-turn/production-quality claims. Persist exact synthetic prompts/responses, usage and real wall times. Extraction and composition do not get a third call. One failed/timeout call still consumes the budget. Guard ledger survives reruns. No private recordings, logs or general credentials inspection; provider reads GEMINI_API_KEY in memory only, never persists/prints it. Avoid scheduled judging windows; if uncertain, leave calls unrun and report that limitation.

Report separately: contract correctness, selected-reference accuracy/coverage, ambiguity preservation, correction freshness, injected-instruction effects, conditions/stance, abstention, and accepted-but-wrong model claims. Never use mock success as model performance.

Effort: count explicitly scripted actions and inserted characters, with common transcript-paste and final-review actions included. These are mechanical estimates, not observed AAC-user speed/effort. Compare Bridge against chips even if Gemini loses. A model suggestion does not save a selection action; quote inspection is required and its reading cost is not measured. New source corrections require re-resolution and re-selection.

Decision: NO-GO for native integration absent evidence beyond deterministic chips/current HMR. At most CONDITIONAL GO for further offline testing if contract passes, real examples add useful resolution, no observed meaning errors, and uncertainty is explicit. Two batched calls cannot validate generalized reliability or human effort reduction. A real native GO needs a separate approval and more evidence; P0 ends with an honest report.
