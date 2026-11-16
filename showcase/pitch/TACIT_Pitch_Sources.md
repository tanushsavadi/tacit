# TACIT pitch — evidence sheet

Every number in the deck and scripts, with its source, population and caveat. Verified 15 Nov 2026 ~11:30–11:45 UTC.
"Verified" means the primary record was read directly (PubMed abstracts via NCBI E-utilities; ACS page fetched).

## A. External (medical and scientific)

| # | Claim used | Exact source wording / figure | Population & denominator | Caveats (say them) | Where used |
|---|---|---|---|---|---|
| 1 | **69.7%** of patients after total laryngectomy preferred a lip-reading app to writing | "the majority (69.7%) preferred SRAVI to written communication" | **16** total-laryngectomy patients, Vanderbilt; **652** valid app transactions during hospital admission | App = **SRAVI**, not TACIT. Fixed phrase set. Small single-centre study. Preference ≠ clinical effectiveness. 69.7% is as reported (not a simple k/16, so likely survey-response based). | Slide 02, A5, A8 |
| 1b | First-try **43%**, total **67%** phrase accuracy | "accurate phrase return on the first attempt was 43% with a total accuracy of 67%" | Same 652 transactions | SRAVI's performance, not TACIT's | Slide 02 |
| 1c | Need statement (quote) | "Total laryngectomy (TL) patients have limited options for speech rehabilitation in the immediate postoperative period, resulting in communication difficulties and patient frustration." | — | About the *immediate postoperative* period specifically | Slide 02 |
| 1d | Other figures from the same abstract (not on slides) | used SRAVI to talk with care team 66.7%, family/social support 80%; used it 43.6% of the time to communicate | Same | — | Q&A only |
| | **Citation** | Fassler CA, Krishnapura SG, Sharbel D, Rosenthal E, Netterville J, Mannion K, Langerman A, Sinard R, Rohde S, Topf MC. *Utility of a Novel Mobile Lip-Reading Application for Patients After Total Laryngectomy.* Otolaryngol Head Neck Surg. 2026 Feb;174(2):582–586. doi:10.1002/ohn.70098. PMID 41485241. PMCID PMC12860178. https://pubmed.ncbi.nlm.nih.gov/41485241/ | | | |
| 2 | Tracheostomy ICU study: DNN rank-1 **75%**, top-3 **86%** | "total recognition accuracy across all three ranks of 86% using the DNN method. The rank 1 recognition accuracy of the DNN method was 75%." DTW: 74% / 48% | **14** patients with tracheostomies (3 F, 11 M), one UK critical-care unit; **616** recordings, **516** phrase-identifiable | Closed set of supported phrases; SRAVI; feasibility study | A5 footer, A8, Q&A |
| | **Citation** | Musalia M, Laha S, Cazalilla-Chica J, et al. *A user evaluation of speech/phrase recognition software in critically ill patients: a DECIDE-AI feasibility study.* Crit Care. 2023;27(1):277. doi:10.1186/s13054-023-04420-x. PMID 37430313. PMC10332046. https://pmc.ncbi.nlm.nih.gov/articles/PMC10332046/ | | | |
| 3 | Existing options and their trade-offs | Electrolarynx: external vibratory source, "electronic quality", needs "good manual dexterity". Esophageal speech: "harsh, low in intensity/volume and pitch", "requires an extended learning period". TEP / voice prosthesis: quality "generally closer to laryngeal speech"; needs stoma occlusion (finger or hands-free valve), maintenance, candidacy (dexterity, vision, access to care) | Clinical practice guidance (no statistics on the page) | These are legitimate, effective options. TACIT is an *additional* path, never a replacement | Slide 02, A5, Q6 |
| | **Citation** | ASHA Practice Portal: *Communication After Total Laryngectomy.* https://www.asha.org/practice-portal/clinical-topics/head-and-neck-cancer/communication-after-total-laryngectomy/ | | | |
| 4 | ~**12,290** new US laryngeal cancer cases estimated for 2026 | "About 12,290 new cases of laryngeal cancer (9,730 in men and 2,560 in women)"; "About 3,960 people … will die from laryngeal cancer"; page last revised May 28, 2026 | US, **annual incidence** (not prevalence) | **Not** TACIT's user count: most patients don't have a total laryngectomy, and many who do regain speech with other methods. Kept off the main slides on purpose. | A8, Q5 only |
| | **Citation** | American Cancer Society, *Key Statistics for Laryngeal and Hypopharyngeal Cancers.* https://www.cancer.org/cancer/types/laryngeal-and-hypopharyngeal-cancer/key-statistics.html | | | |

**Why one statistic on slide 02:** the 69.7% preference figure links the human need (people want lip-reading
communication) to our approach, and its caveats (small, someone else's app, imperfect accuracy) are easy to say out
loud. Incidence numbers invite "so that's your market?", which we can't defend.

## B. TACIT's own measurements (repo: github.com/tanushsavadi/tacit)

| Claim | Value | Source | Scope / caveat |
|---|---|---|---|
| Base-model WER on founder's held-back silent sentences | **73.7%** (84/114 word errors, 20 sentences) | docs/HANDOFF.md "Adaptation arm 1" / "Generalisation experiment" | Shipped (unmodified) model; one speaker |
| Personal fine-tune `silent1` (validation) | **42.1%** (48/114) | same | Epoch chosen on the same validation set, so mildly optimistic. **Not deployed** |
| Other speakers (CREMA-D, 96 clips) | **6.2% → 10.1%** (33 → 54 /536) | same | Pre-registered guard ≤ +1 pt: failed at +3.9 pt |
| W50 blend kept share of gain | **56%** (rule needed ≥ 2/3) | same | — |
| Earlier live held-out test | **44% WER** (11/25), **2/5** exact, end→shown p50 **1385 ms** | HANDOFF "Verified status" (14 Nov) | Earlier build; frozen baseline |
| Recorded-clip results (A1) | 4 exact + "HOW ARE YOU GOING" | Devpost gallery 09 / offline evaluator | Hand-picked; not an accuracy rate |
| Practised-phrase session (bright-test) | 7/10 prompted clips exact | recognition/data/webcam/…bright-test/results-mps.jsonl | Founder's recorded clips; used for threshold checks |
| Model compute per utterance | **283 ms** p50 (val) | HANDOFF bench table | Apple GPU (MPS); compute only |
| Speak → first audio at the virtual mic | **152 ms** (My Voice) | RELEASE_RUNBOOK matrix E | Local, warm |
| Stop → speech interrupted | **22 ms** (reviewed speech) | RELEASE_RUNBOOK current release | Local |
| Recognizer killed → back online | **8 s** | live:stress --kill-recognizer | Local |
| Reviewed-speech safety checks | **13/13** | reviewed:check | Tamper / stale / double-Speak refused |
| Automated tests | **419** = Swift 103 + server 196 + web 80 + recognition 40 | RELEASE_RUNBOOK gate on ae5fb91 (merged tree) | Also TacitRoute 4, tacit-voice 5 (not counted) |
| Native → server → Gemini → native | **11/11** | `--presence-check` | Includes edited draft spoken once at BlackHole, no listener |
| Gemini eval | **20/20**, p50 **872 ms**, p95 **2.6 s** (n = 20), **0/58** removals, focus verbatim 4/4 | GEMINI_TRACK.md §3; README | Synthetic agent-written cases, real API, 15 Nov 11:05 UTC. Not re-run for this deck (quota) |
| Gemini live probe | Share my view median **1.10 s** (n = 5); 0 speech events | same | Scripted WS client on the deployed server |
| Meet remote audibility | Verified once: iPhone in Meet heard TACIT via BlackHole 16ch | HANDOFF "Verified status" (14 Nov ~20:50 UTC) | Earlier build, typed speech. Re-verify reviewed speech in rehearsal |
| Recognizer licence | Auto-AVSR LRS3 weights: research / non-commercial only; code Apache-2.0/MIT | recognition/tacit_vsr/config.py; THIRD_PARTY_NOTICES.md | Not commercial-ready |
| Build timeline | 171 commits; first 2026-11-14 03:21 EST (hacking began Fri 13 Nov 8:30 PM EST) | `git log` | — |

## C. Judging facts (hackumass.com, fetched today)
- Sunday 15 Nov: final submission 9:00 AM, **judging 12:30 PM**, deliberation 3:00 PM, closing 4:30 PM (EST).
- At least one team member must be present during judging. Format and time per team: **not stated** on the site.
- The quote "Show us how you built your project, including what you tried, what failed, and what you learned. A
  polished end result isn't the goal…" appears on hackumass.com **under the Analog Devices prize track**, not as the
  general criteria. Still a good guide; we answer it with A2 regardless.
- Devpost (per our 13 Nov research): criteria are Innovation, Functionality, Practicality, Presentation. Choose **one**
  [HACKUMASS]-tagged category (MedTech, AI and Best Pitch are separately tagged); sponsor prizes (Gemini) are opt-in.
  **Check which single category was selected on Devpost and lead with it.** hackumass.com doesn't state the
  one-category rule.
