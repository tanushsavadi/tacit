# Referent Bridge P0: results and decision

**NO-GO for native integration on the present evidence.** The isolated contract works on the tested synthetic scenarios, but Gemini did not outperform simple deterministic reference chips on the six real-call scenarios, and the scripted workflow adds actions. No reduction in human communication effort has been established.

P0 is complete: executable TypeScript CLI, mock model path, actual-response replay, deterministic tests, source-cited references, correction invalidation, explicit selection, verbatim user points, cancellation/freshness, and text-only approval artifacts. This proof did not change TACIT source, deployment, app signing, permissions, BlackHole or Meet. No audio/video/personal conversation was used.

## What was tested

The [pre-registration](EXPERIMENT_PLAN.md) fixed the six priority tasks, budget, baselines and evaluation limitations before real requests. Thirty synthetic cases cover six families with five examples each. All were authored/labeled by the implementing agent; there was no independent human labeling, AAC-user trial, blind experiment or clinical evaluation.

**101/101 tests passed**, with fetch explicitly disabled during the final test run. TypeScript strict typecheck passed. Offline evaluation and mock/recorded demos completed. Tests include source quotation/ID integrity, stale corrections, duplicate/unknown references, unexpected tool/speech fields, empty opinions, hash mismatch, changed drafts, cancel, ignored aborts, timeout, supersession, source mutation, ambiguity, injection, baseline parity and six recorded-response replays. Full output: [tests.txt](evidence/tests.txt), [typecheck.txt](evidence/typecheck.txt).

The controller never calls speech APIs or production endpoints. Its approval result is `kind: approved-research-text-only`. The interactive CLI was also exercised in a terminal: cancel after an ambiguous selection, then a separate leave-by-five scenario approved exactly as displayed. These were agent-operated mechanics checks, not human accessibility/performance evidence. The ambiguous cancellation deliberately illustrated that user-authored scheduling contradictions are not detected by verbatim preservation.

## Actual Gemini calls

Exactly **two network requests**, both successful, using installed `@google/genai` 3.3.0 and `gemini-3.5-flash-lite`. One request per arm, six synthetic scenarios batched inside each. No retry, fallback, warmup, model-list call, private upload or production service contact. Calls ran more than five hours before the scheduled 12:30 EST judging start; the runner protects the schedule with a conservative margin. It cannot know about unscheduled judging.

| Arm | Real start UTC, 2026-11-15 | Batch wall time | Input / output tokens | Network requests |
|---|---|---:|---:|---:|
| Bridge extraction | 11:57:56.852 | 2231 ms | 647 / 502 | 1 |
| Existing HMR prompt + validator, batch envelope | 11:57:59.084 | 2041 ms | 1069 / 276 | 1 |

These are batch wall times, not single-turn latency measurements or distributions. Do not divide by six and advertise an interactive response time. Both fit the 5 s deadline on this run. Actual response text, prompts, settings, model version and usage are preserved in [real-bridge.json](evidence/real-bridge.json) and [real-hmr.json](evidence/real-hmr.json). The [persistent budget](evidence/call-budget.json) is exhausted; reruns refuse rather than request more inference or overwrite the original evidence.

## Head-to-head observations

| Priority case | Actual Bridge extraction | Deterministic chips | Actual Help Me Respond |
|---|---|---|---|
| Friday 2 vs 4; “later one” | `[t1] Friday at 4`; no availability inferred | Same reference | “I need to check my calendar first.” and two similar drafts. No invented availability. |
| “Actually … Thursday” | `[t2] Thursday`; old Friday unavailable | Same fresh reference | “I need to check my calendar.” and two variants. Does not commit to stale Friday. |
| Two topics: review 2/4, ride 3/5 | Both `[t1] Friday at 4` and `[t2] Friday at 5`, state ambiguous | Same two choices | “Yes, the ride works for me.” / “The ride works for me, yes.” User point explicitly supplied the ride and yes. |
| “yes, but … leave by five” | Reference Friday 4; local composition retains complete point | Same reference and local preservation | Both actual drafts retained leave-by-five condition. |
| User disagrees | Reference Friday 4; local composition keeps exact “no … does not work” | Same | Both actual drafts kept disagreement. |
| Conversation injection asks to change intent / trigger speech | Reference remains Friday 4; injected turn not followed | Same | Both drafts kept “do not agree”; no instruction-following observed. |

Bridge: **6/6 extraction tasks matched the fixed rubric**, including seven total valid reference spans. Chips: **6/6 on the identical six tasks**. All Bridge options were initially unselected. The mock/real-replay controller required an explicit scripted/user selection, the user's point, full-text review and approval. All six real-response replay artifacts retained the user point verbatim. No evidence here warrants a generalized “100% reliable” claim.

HMR produced **14 drafts**, all accepted by its real pure production validator, with zero removed. Inspection found no stance flips, missing leave-by-five condition, invented availability or compliance with the injected instruction in those outputs. HMR does not expose explicit cited antecedent choices; that is a UI/contract distinction, not a demonstrated failure to communicate. “Let me check my calendar” can be an adequate reply without restating Friday at 4.

The HMR arm uses an exact snapshot of production `SYSTEM`, `buildPrompt`, parser and validator, with local type declarations only. [Source manifest](evidence/baseline-manifest.json) records its hash. We added a batch envelope to honor the two-call limit; this is not the deployed `Respond` service behavior, fallback chain, cancellation pipeline or per-request evaluation. Cross-case effects are possible. The same short authored points and transcripts were used, without feeding gold references into either model prompt. Bridge did not receive the user's point at extraction time.

### Thirty-case deterministic comparison

Chips matched **22/30** authored reference tasks and abstained on eight semantic/non-time tasks: ramp→step-free entrance and faster→teal plan, repeated with different user points. There were no incorrect chips in this finite fixture set, but this is not broad safety evidence. The baseline is intentionally simple: weekday/time regex, bare weekday on a correction, earlier/later within source-turn groups, and a conservative correction barrier.

Oracle mock Bridge outputs matched 30/30 **by construction**. This proves the interface/controller can carry those labels safely, not that Gemini resolved the additional eight tasks. No real Gemini inference was run on them. The eight are repeated semantic patterns, so even a future 8/8 result would be weak evidence of generalization. A meaningful next comparison needs independently labeled, varied non-time references and a stronger lexical baseline.

## User actions and character entry

These are fully specified **mechanical estimates**, not observed keystrokes, seconds, cognitive load or accessibility outcomes. “Actions” count inventory events, including review; they are conceptual steps rather than measured physical clicks. Source text is pasted in all arms. The common six-task context contributes 624 inserted characters; points contribute 166. Reading/quote inspection, cursor travel, keyboard shortcuts, assistive input and correction cost are unmeasured. HMR receives the optimistic zero-edit path; we did not invent a correction burden to make Bridge win.

| Priority six tasks | HMR | Chips + constrained composition | Bridge + constrained composition |
|---|---:|---:|---:|
| Actions per task | 6 | 7 | 8 |
| Total actions | 36 | 42 | 48 |
| User point characters excluding shared context | 166 | 166 | 166 |
| Additional inference requests per task, conceptual workflow | Wording request | None | Reference request |

HMR: paste context → choose intent → enter point → request wording → review → approve. Chips adds reference selection. Bridge adds both reference request and reference selection. Composition in the latter two is local. CLI prompt design is not the production notch, so these counts are path inventories rather than a faithful GUI timing model. Intent is an explicit data field in core APIs; the current interactive CLI fixes it to `phrase_this`, so its input prompts alone should not be mistaken for this cross-workflow inventory.

When both chips and Bridge provide the reference, they require identical point text; Bridge has **one extra action and cloud latency**. HMR has two fewer modeled actions and preserved the tested stance/condition. No character saving appears in the six-task modeled paths. Politeness additions such as HMR's “I am sorry” are not verbatim user words; we do not claim exact equivalence of every nuance.

Across all 30 authored tasks, an **oracle** Bridge could avoid 92 manual-reference characters where chips abstain (771 versus 863 non-context characters). That is a hypothetical upper-bound fixture calculation, not a measured Gemini saving. It does not justify integration. If an explicit day/time is a product requirement, HMR users could add it to their point; that would change input lengths and needs a separate fair comparison. HMR's valid concise replies are not scored wrong merely for omitting an explicit timestamp.

Full action inventories, characters and assumptions: [evaluation.json](evidence/evaluation.json). All final Speak-like approval actions in this proof create text objects only.

## Example actual-response trace

The model received the synthetic two-time transcript; it returned this exact contract fragment:

```json
{"state":"resolved","references":[{"turnId":"t1","quote":"Friday at 4"}],"layout":"reference-first"}
```

Local validation located UTF-16 source indices `[27,38)` in `[t1] We can meet Friday at 2 or Friday at 4.` No user choice existed yet. After explicit selection and user point `yes, but I need to leave by five.`, local composition was:

```text
Regarding Friday at 4: yes, but I need to leave by five.
```

It remained inert until explicit APPROVE. The terminal mechanics check created a text artifact at `2026-11-15T12:01:50.780Z`; its hash is `ada7aaa536aa5083801555f757555d2407d2f0cbe02ecd645f9eb25737f3ed9c`. No speech, audio or call delivery followed.

For the ambiguity case, Gemini returned two citations, state `ambiguous`, and no selected choice. For the correction case, source `t2` replaced the old options. Full [real traces](evidence/real-traces.json) label model replay separately from scripted user actions; [mock traces](evidence/mock-traces.json) label oracle outputs explicitly. Scripted author choices use fixture labels to exercise the controller, so they do not test real users' ability to choose correctly.

## Error and ambiguity analysis

1. **No observed model errors on these six extraction cases.** Too small and repetitive to estimate error rates. One ambiguity/injection example is not adversarial robustness validation.
2. **Citation validity is not semantic correctness.** Tests show “Friday at 2” can be a valid quote but the wrong referent, and one option from a two-topic ambiguity can be structurally `resolved`. The validator accepts those exact quotes; the offline semantic rubric counts them wrong. Explicit selection reduces automation risk but cannot guarantee a user notices a missing alternative.
3. **Corrections are lexical and conservative.** An explicit “Actually/Correction/Instead” invalidates every previous turn. This rejects stale Friday here, but unrelated facts can be lost, implicit corrections missed, and ordinary discourse markers can over-trigger. Neither chips nor Bridge has a complete truth-maintenance model.
4. **Composition safety comes from local restriction, not Gemini intelligence.** The output plan cannot replace user text. This preserves conditions/disagreement exactly, but it does not demonstrate natural generative composition or the ability to expand shorter shorthand into equivalent speech. “Regarding …” can sound awkward, and wrong reference choice can still change the pragmatic meaning. The controller does not detect logically inconsistent choices such as agreeing to a five-o'clock event while needing to leave by five.
5. **Existing HMR validation has deterministic semantic gaps.** Two adversarial mock drafts—an omitted condition and a disagreement turned into agreement—are admitted by its regex validator, despite its prompt forbidding them. Those are reproduced validator limitations, not actual Gemini failures in this run. HMR's real tested outputs preserved meaning. No fix was made to TACIT.
6. **Injection is data, not authorization.** Strict schema rejects extra speech/tool/position fields; reference text never executes, user position is a separate local field, and there is no speech capability. A lexical instruction-quote filter is only an extra heuristic, not a complete prompt-injection defense.
7. **Cancellation is application-local.** Context epochs, request identity and draft hashes protect the text state even if the model ignores abort. The provider may still process/bill a cancelled request. The finite test does not prove all race schedules or OS failure modes.
8. **No calibration claim.** No confidence scores or clinical/reliability gate are introduced. Models can fail confidently, quotations can be incomplete, and the user retains the final review burden.

## Recommendation

**Do not proceed to native integration from P0.** The tested extraction is feasible, but chips deliver the same priority outcomes with fewer actions, and current HMR already preserved the tested intent. The “Gemini reduces effort” hypothesis remains unproven; adding a button/server state would currently add complexity.

If separately approved, the next research step would be a bounded offline comparison on diverse non-time references (scope, changed antecedents, negated/conditional proposals), independent human labels, and realistic action/reading measurements versus stronger local chips and current HMR. Do not promise native integration before evidence shows a useful improvement beyond both baselines without meaning regressions. P0 stops here; no additional calls or prototype expansion is authorized by this recommendation.

## Proposed 30-second Gemini sponsor demonstration

Use `npm run interactive -- --replay-real` with the `ambiguous` case. No new live API call. Keep **RECORDED GEMINI RESPONSE REPLAY — NOT LIVE** visible. This is an honest research demonstration, not a claimed live Meet feature or an effort-reduction result.

| Time | Action / words |
|---|---|
| 0–6 s | Show review/ride transcript: “For someone typing a reply, ‘the later one’ can refer to two different things.” |
| 6–13 s | Show the saved real Gemini result: “Gemini returned both exact source references rather than choosing for the user. This is a replay of an actual API response.” |
| 13–22 s | Select the intended reference; enter your own disagreement, e.g. `no, I need to check first.` Show complete assembled text: “Only the user supplies the position.” |
| 22–30 s | Type APPROVE and show text-only artifact: “Approval is separate. This prototype cannot speak. Gemini tied our simple baseline here, so we're keeping this out of the stable app until it demonstrates added value.” |

That last sentence is the scientifically honest conclusion. For a product-focused sponsor pitch now, the already working Help Me Respond integration has stronger deployment evidence. Do not portray P0 as superior or as a live Meet capture breakthrough.

## Deliverables

[Runnable commands and design boundary](README.md) · [experiment plan](EXPERIMENT_PLAN.md) · [actual responses](evidence/real-bridge.json) · [HMR response](evidence/real-hmr.json) · [evaluation](evidence/evaluation.json) · [real-response replay](evidence/demo-real-replay.txt) · [tests](evidence/tests.txt).

Final read-only integrity check at 12:06:54 UTC found the original server, sidecar and Companion process IDs/start times unchanged and the production `respond.ts` hash still equal to the snapshot. Repository status included additional untracked adaptation retake prompt files created during concurrent work; this proof did not create, inspect their content, edit or remove them. Existing HANDOFF changes were preserved. All P0 artifacts are external. [Integrity record](evidence/integrity-check.json).
