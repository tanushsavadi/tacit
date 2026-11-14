# Visual speech recognition: alternatives and personalisation (2026-11-14, ~21:00 UTC)

Question: is there a practical way, before the HackUMass demo, to beat the current recogniser (Auto-AVSR visual-only
`LRS3_V_WER19.1`, fast beam 10, CTC 0.1, no LM) on the user's silent articulation? Answer: **no model swap is
credibly better; the levers are review (done), lighting, and speaker adaptation (needs new labelled data).**

## Published / open alternatives (desk review — nothing downloaded or run)
| System | Reported LRS3 visual-only WER | Fit for TACIT |
|---|---|---|
| Auto-AVSR `LRS3_V_WER19.1` (current) | 19.1% | Local, working, research licence |
| Chaplin / SilentFlow / Lipflow | same Auto-AVSR weights | Add LM fusion (rejected on our data, D.8) or LLM correction (forbidden: rewrites the user's words) |
| VALLR (ICCV 2025, Surrey) | 18.7% (self-reported) | Video→phonemes→**LLM generates the words**: conflicts with "never let an LLM produce/correct the user's words"; public weights not confirmed; gain 0.4 pt on voiced TED video |
| MultiAVSR (preprint 2025) | 21.0% | Worse |
| LLM-decoder VSR (Jain & Harte 2025, Llama-2-13B) | 24.7% | Worse, heavy, LLM-generated text |
| "Hushkey" | — | No such project found |
| LipLearner (CHI '23) | few-shot command enrolment on device | Idea tested below (personal templates) |
All of these benchmarks are VOICED speech; none says anything about silent articulation.

## Measured on our data
- Oracle top-K (DEMO_READINESS D.10): the reference is in the 5-best for 8/20 own silent clips (6 at top-1); half are
  absent from the 10-best → only a better or adapted visual model helps those.
- Flip test-time augmentation: worse everywhere (D.12). LM fusion: worse everywhere (D.8).
- **Personal templates (`recognition/eval/enroll_knn.py`, design fixed before running):** 10 phrases recorded in ≥ 2
  of sessions A/B/C, 45 clips; templates only from OTHER sessions; DTW over encoder frames, 1-NN, no threshold.
  Closed-set (10 phrases): personal 45/45 (silent 17/17), generic model scoring 44/45 (silent 17/17) — ceiling, the
  10-way task is too easy to separate the methods. Rejection signal: genuine nearest-template distance median 0.261
  (max 0.505); CREMA-D unseen speakers median 0.554 (15/96 below 0.505); the user's own 3 unlisted sentences
  0.347–0.411 (all inside the genuine range). → Enrolment transfers across days/lighting for the user's phrases, but
  DTW distance alone does not reject the user's own unlisted sentences. Tiny n, one speaker: feasibility only.

## Speaker adaptation — feasibility
Most promising route for open vocabulary: fine-tune a small adapter (e.g. LoRA on the conformer encoder) on the
user's own labelled SILENT sentences. Blocking requirement: ≥ ~100 new labelled own clips for training plus a disjoint
held-out set; today there are 48 development clips (20 silent), all already studied. Compute is feasible on the M3 Pro
(adapter-only training), data is not. Not attempted.

Sources: [VALLR arXiv 2503.21408](https://arxiv.org/abs/2503.21408v1), [VALLR project page](https://ed-fish.github.io/publication/2025-vallr),
[VALLR code](https://github.com/MarshallT-99/VALLR), [MultiAVSR preprint](https://www.preprints.org/manuscript/202505.0540/v1),
[LLM-decoder VSR arXiv 2509.14880](https://arxiv.org/abs/2509.14880v1), [LipLearner](https://github.com/rkmtlab/LipLearner).
