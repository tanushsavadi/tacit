# Bounded reasoning-model experiment

Frozen before new model calls. Original Flash-Lite results remain 9/12, original same-detail filter development replay is not new held-out evidence. The descriptive lexical comparator scored 11/12 but its code was written after seeing outputs; it is not an independently blinded comparison.

Hypothesis: Gemini 3.8 Flash with LOW thinking may support relationships which Flash-Lite missed. No prompt changes between arms. Eight new synthetic scenarios, labels excluded from prompts, one call per model/case, no retries, 5 s total deadline, at most 16 requests, spaced >=8.5 s. Compare both models and the already-written lexical baseline. No prompt/model reruns after inspecting outcomes. These are agent-authored cases; independent human labels and user-effort tests remain required.

Primary outcome: binary presence of a relevant changed proposal with exact-source grounding; report wrong-source/ambiguous cases separately. Secondary: latency and usage. Proposed development bar: >=7/8 correct and no worse than comparator, zero unsupported source details/tool fields. This tiny suite cannot validate general reliability. A negative result means Gemini guard remains EXPERIMENT, never a claimed win over simpler code.
