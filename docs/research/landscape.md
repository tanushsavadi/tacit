# TACIT landscape research (2026-11-13)

Legend: VERIFIED = I read the primary source (URL given). UNVERIFIED = only seen in a search-result summary or secondary page; confirm before citing. "Not found" = absence in a limited ~30 min search, not proof of absence.

---

## 1. Prior art and defensible claims

### 1.1 Product and research table

| Item | What it does | Input | Context-generated replies? | Selection by lip/mouth? | Live call? | User's own voice? | Status |
|---|---|---|---|---|---|---|---|
| SRAVI (Liopa + Lancashire Teaching Hospitals) | Patient mouths one phrase from a fixed list at a phone camera. App returns 3 ranked candidate phrases; patient confirms the right one. | Lip video | No. Fixed supported-phrase list (count not read; "about 40" is UNVERIFIED) | Yes (closed-set lipreading) | No | Not stated | VERIFIED: 14 tracheostomy patients, 616 recordings (516 phrase-identifiable); DNN rank-1 75%, top-3 86%; DTW rank-1 48%, top-3 74%. Limitations stated: small N, uneven recordings per patient, connectivity problems. https://pmc.ncbi.nlm.nih.gov/articles/PMC10332046 (text read via https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10332046/fullTextXML). UNVERIFIED: a separate NHS HRA summary reportedly gave 21.8% (fixed list) and 34.6% (free speech) accuracy, https://www.hra.nhs.uk/planning-and-improving-research/application-summaries/research-summaries/speech-recognition-application-for-the-voice-impaired-sravi-v10/ . App Store page returned 404 to me; reportedly clinician-request only, UNVERIFIED. |
| Bobbai | Could not confirm it exists. Three searches returned nothing. Possibly a misspelling or very small company. | n/a | n/a | n/a | n/a | n/a | Could not confirm. |
| Google SpeakFaster | LLMs (fine-tuned 64B LaMDA) expand abbreviation-typed text into full phrases, using prior dialogue turns as context. | Eye-gaze or touch keyboard | Partly. Expansion uses conversation context, but partner text was supplied as text. Paper says live partner speech would need ASR, which they did not build. | No | No | No | VERIFIED. 2 eye-gaze ALS users: +29-60% text-entry rate vs baseline. Lab user 6.54 vs 4.05 WPM scripted; field user 10.4 vs 8.1 WPM. 19-person non-AAC pilot: +13.0% scripted, -10.2% unscripted. https://pmc.ncbi.nlm.nih.gov/articles/PMC11530652/ |
| Lingraphica "Conversations" | Transcribes the communication partner's speech and offers AI-supported response suggestions (Agree / Disagree / Ask / Reply, or Key Words); user reviews, edits, speaks. | Touch/AAC device; partner speech via mic | Yes | No | FAQ does not mention phone calls; assumes partner speaks near the device mic | FAQ does not say | VERIFIED (FAQ text). Closest commercial analogue to TACIT's "listen then propose replies". https://lingraphica.com/hub-support/conversations/conversations-feature-faq/ . Vendor test of 13 people (15 s vs 1 min 14 s) is UNVERIFIED (search summary only). |
| Alek (Closing the Gap writeup) | Text AAC app that suggests 2-3 complete replies using AI language models. | Touch | Yes | No | Not stated | Not stated | UNVERIFIED (search summary), https://www.closingthegap.com/alek-talk-faster-with-less-effort/ |
| Speak Ease (Xu et al., arXiv 2503.17479) | Research system: ASR + context-aware LLM output + personalised TTS. | Voice/text + context cues | Yes | No | Not stated | Personalised TTS | UNVERIFIED beyond abstract. https://arxiv.org/abs/2503.17479 |
| SocializeChat (arXiv 2510.19017) | GPT-based AAC grounded in personal memories + partner persona; transcribed voice input. | Voice transcription | Yes | No | No | No | UNVERIFIED (search summary). https://arxiv.org/html/2510.19017 |
| Tobii Dynavox TD Talk | AI phrase prediction shown March 2025 (press); Microsoft Neural Voice available in TD Talk/TD Phone. | Eye gaze / touch / switch | Phrase prediction, details unclear | No | TD Phone exists | Neural voice, not stated as user clone | UNVERIFIED (search summary), https://www.gurufocus.com/news/2741666/tobii-dynavox-shows-how-ai-empowers-people-with-disabilities-at-microsoft-ability-summit |
| Smartbox Grid "Smart Prompt" / Expand | User-built AI tools; "Expand" turns a few keywords into a full message. ElevenLabs voices (incl. cloning) integrated in Grid. | Touch/eye gaze/switch | Keyword-to-message, not call-driven | No | Not stated | Yes, via ElevenLabs clone (reported) | UNVERIFIED (search summaries), https://www.zyteq.com.au/blog/how-to-use-smart-prompt , https://elevenlabs.io/blog/elevenlabs-impact-innovates-in-assistive-technology |
| Apple Live Speech + Personal Voice | Type text, device speaks it during phone and FaceTime calls; Personal Voice builds a voice from 15 min of recorded prompts, usable with Live Speech. | Typing | No (saved phrases only) | No | Yes (phone and FaceTime) | Yes | VERIFIED. https://www.apple.com/newsroom/2023/05/apple-previews-live-speech-personal-voice-and-more-new-accessibility-features/ . This is the baseline TACIT must beat on input method. |
| Whispp | Real-time audio-to-audio conversion of whispered/impaired speech into a natural voice during calls; voice modelled on the user's recordings. | Whispered speech (audio) | No | No | Yes | Yes (reported) | UNVERIFIED (search summary), https://brainporteindhoven.com/the-gate/en/news/whispp-wants-to-give-people-with-speech-impediments-a-strong-new-voice |
| Cognixion ONE / Axon-R | AR headset with EEG BCI; user selects among options shown in AR; "conversational co-pilot" AI. | EEG, head, voice, switch | Co-pilot suggestions (company claim) | No (BCI) | Not stated | Not stated | UNVERIFIED (search summary); research device from US$25k, not FDA cleared; ONE has Breakthrough designation. https://cognixion.com/products |
| Voiceitt | Not researched (search returned nothing). | | | | | | Could not confirm |
| AlterEgo (MIT, IUI '18) | Electrodes on jaw/face read neuromuscular signals from silent articulation; ~100-word vocabulary reported. | Surface EMG | No | Not lips; EMG | No | No | UNVERIFIED (search summary and press), https://news.mit.edu/index.php/2018/computer-system-transcribes-words-users-speak-silently-0404 . Accuracy figure "~92%" is from press, not the paper. |
| Subvocal glasses (YC) | RF-sensing glasses decode silently mouthed words to text; claims 200+ WPM. | RF facial sensing | No | Mouthing, via RF not camera | Not stated | No | UNVERIFIED (vendor claim via press), https://aiweekly.co/alerts/subvocal-debuts-yc-glasses-that-decode-silent-mouthing-to-text |
| Cornell EchoSpeech | Eyeglass acoustic sensing recognises up to 31 unvocalised commands from lip/mouth movement. | Acoustic on glasses | No | Yes (commands) | No | No | UNVERIFIED (search summary), https://news.cornell.edu/node/326257 |
| LipLearner (CHI '23) | Camera-based silent-speech command recognition on phones; few-shot custom commands; 30 commands (20 user-dependent), one-shot accuracy 81.7%; code released MIT. | Phone camera | No (fixed commands) | Yes | No | No | UNVERIFIED (search summary of arXiv abstract), https://arxiv.org/abs/2302.05907 , code https://github.com/rkmtlab/LipLearner . Useful as a starting point for closed-set visual keyword matching. |
| VALLR (ICCV 2025) / VALLR-Pin | Lipreading: video -> phonemes -> LLM to words; Pin variant has LLM choose among N-best candidates. | Video | N/A (transcription) | Lipreading | No | No | UNVERIFIED (search summary), https://arxiv.org/abs/2503.21408 , https://arxiv.org/html/2512.20032v2 |
| Viseme vocabulary work | Phoneme-to-viseme maps (Fernandez-Lopez and Sukno: ~20 visemes optimal for Spanish; maps of 2-45 visemes in other work). Shows which sounds look alike. | | | | | | UNVERIFIED (search summary), https://arxiv.org/pdf/1704.08035 |
| ElevenLabs Impact Program | Free voice cloning/TTS for people with ALS/MND and other voice loss, via partner orgs. | | | | | Yes | UNVERIFIED (search summary), https://elevenlabs.io/blog/elevenlabs-impact-innovates-in-assistive-technology |
| Name collision: "Tacit" iOS AAC app | Solo-built app by "sakib", live on App Store 29 Sept 2026. Tap/type, show full-screen or speak, LLM "Enhance" and 3-wording picker via on-device Apple Foundation Models / Groq. No lipreading, no voice cloning (Personal Voice listed as "what's next"). | Tap/type | LLM rewordings, not partner-speech replies | No | No | Not yet | VERIFIED (article text). Different product, same name. Mention in Devpost or choose a distinguishing tagline. https://hackernoon.com/inside-tacit-an-aac-app-built-around-a-two-tap-rule |

### 1.2 Which TACIT capabilities are already done by someone

| TACIT capability | Status | Evidence |
|---|---|---|
| Transcribe caller, LLM suggests replies for AAC user | (a) Clearly done | Lingraphica Conversations (VERIFIED); Alek, Speak Ease, SocializeChat (UNVERIFIED) |
| LLM uses conversation context to speed AAC text | (a) Done | SpeakFaster (VERIFIED) |
| Speak typed text on a live phone/FaceTime call in own cloned voice | (a) Done | Apple Live Speech + Personal Voice (VERIFIED) |
| Closed-set phrase selection by mouthing at a phone camera, top-3 shown for confirmation | (a) Done | SRAVI (VERIFIED, peer-reviewed feasibility study) |
| Camera-based closed-set silent commands | (a) Done in research | LipLearner (UNVERIFIED beyond abstract) |
| Cloned voice integrated into AAC | (a) Done | ElevenLabs in Smartbox Grid (UNVERIFIED) |
| LLM re-ranking of lipreading N-best candidates | (b) Partial | VALLR-Pin: transcription, not reply selection (UNVERIFIED) |
| Replies generated by LLM from live caller speech AND selected by mouthing | (c) Not found | No single system found combining both |
| Nod (head gesture, e.g., AirPods IMU) as confirm step in an AAC/lipreading flow | (c) Not found in my search (head-tracking AAC exists, e.g., Jabberwocky, UNVERIFIED) | |
| Choosing/re-ranking candidates so they are visually distinguishable when mouthed | (c) Not found | Closest: viseme-vocabulary and confusion-modelling papers analyse lipreading errors; none found that shape an LLM's reply set. Search tool reported "no source gives a specific rule for doing this". Treat as "we did not find prior art", not "novel". |
| Whole pipeline on a live call (phone/web) with consented voice clone | (c) Not found as a single product | Apple does the call+voice half; SRAVI does the mouthing half |

### 1.3 Claims TACIT can defend

1. "TACIT combines three things we did not find together in existing AAC tools: replies generated from the live caller's speech, silent selection by mouthing at a webcam, and delivery in the user's own consented cloned voice on a live call."
2. "Selection is a three-way closed-set decision, not open-vocabulary lipreading, which is the same design logic SRAVI used (fixed phrases, top-3 shown, user confirms) and which a peer-reviewed study found workable (75% rank-1, 86% top-3 in 14 patients)."
3. "TACIT's candidate generator also optimises the three replies to look different on the lips (viseme-aware), a step we found no prior description of; we report our own measured confusion rates on our own test set." (Only say this with a measurement behind it.)
4. "A deliberate second-channel confirmation (nod) guards against misread mouthing before anything is spoken to the caller; nothing is sent on the lip match alone."
5. "The voice is the user's own, cloned only with recorded consent" (framing as consent-first; Apple Personal Voice and ElevenLabs Impact already offer own-voice, so claim the integration, not the novelty of cloning).

### 1.4 Claims to avoid

1. "First / only AAC with AI-suggested replies" or "first to listen to the caller". Lingraphica Conversations already does it (VERIFIED).
2. "First lipreading AAC". SRAVI exists and has a published trial (VERIFIED).
3. "Reads lips" or any open-vocabulary lipreading claim, or accuracy figures not measured by the team on the demo setup. Published closed-set numbers (SRAVI 75%/86%, LipLearner 81.7%) are other people's systems and users.
4. "Clinically validated", "medical device", "for ALS/tracheostomy patients" or any user-benefit claim without testing with actual AAC users. State that it is an experimental prototype tested by teammates.
5. "Novel voice cloning" or "works on any call/any phone" and any latency claim ("real time", "under X s") unless measured end to end. Also do not claim the viseme re-ranking improves accuracy until an A/B (viseme-aware vs naive three replies) number exists.

---

## 2. HackUMass XIV (primary sources fetched 2026-11-13; hacking starts tonight)

Sources: official site https://hackumass.com (VERIFIED, fetched), Devpost https://hackumass-xiv.devpost.com/ , rules https://hackumass-xiv.devpost.com/rules , schedule https://hackumass-xiv.devpost.com/details/dates (all VERIFIED via curl). Devpost 403s WebFetch but returns 200 to curl with a browser User-Agent.

### Dates and schedule (EST)
- Fri Nov 13: check-in 6:30 PM, opening ceremony 7:30 PM, hacking begins 8:30 PM. (Devpost "Submissions begin" Nov 13 7:30 PM.)
- Sat Nov 14: meals 9 AM / 12:15 PM / 6 PM; sponsor fair 2 PM; workshops through the day.
- **Sun Nov 15: final submission deadline. Official site says 9:00 AM; Devpost says 10:00 AM EST.** Judging 12:30 PM, deliberation 3:00 PM, closing ceremony and winners 4:30 PM. Plan to the earlier time (9:00 AM).
- **Earlier checkpoint: Devpost rules say you must submit a Devpost project before Saturday 11:59 PM to be considered for judging; edits allowed until the final deadline.** hackumass.com calls this the "initial submission" (listed as 12:00 AM Sunday). Treat Sat 11:59 PM as the hard line.
- Venue: Integrative Learning Center, 650 N Pleasant St, Amherst. In person, 36 hours.

### Judging criteria (Devpost) and judges
Innovation, Functionality (works as intended, reliable, readable code), Practicality (realistic, reasonable resources, scalable), Presentation (clear communication, teamwork, purpose). Judges listed on Devpost: Matthew Rattigan (Professor), Cole Reilly. The list may be partial (UNVERIFIED).

### Prize categories (Devpost lists 25 non-cash prizes)
Rule: choose ONLY ONE category tagged [HACKUMASS]; all projects are automatically considered for Grand Prizes; sponsor (untagged / [MLH]) prizes must be opted in separately and do not count toward the one-category limit.

| Prize | Reward (Devpost) | Stated requirement |
|---|---|---|
| [HACKUMASS] Grand / Second / Third | 32" curved monitor / Beats Studio Pro / FPV drone | Automatic |
| [SOFTWARE] Best Software Hack; Best UI/UX; Best Beginner Hack | Echo Dot; Game Boy Lego kit; desk lamp | None stated |
| [MEDTECH] Best MedTech Hack | Fitbit Air | None stated |
| [AI] Most Impactful AI Hack; Best Beginner AI Hack | Marshall Emberton 2; ergonomic mouse | None stated |
| [HARDWARE] Best Hardware / Beginner Hardware / Mechanical | Arduino Uno; laptop stand; mech keyboard | None stated |
| [ENTREPRENEURSHIP] Best Pitch | Movie projector | None stated |
| [CYBERSECURITY] Most Secure Hack; Best AI Security Hack | MagSafe power bank; Anker charging stand | None stated |
| **Best Accessibility Hack** | Life360 Tiles | None stated. Likely best fit for TACIT. |
| Best UMass Hack | $25 UMass Store gift card | None stated |
| [MLH] Best Use of Gemini API | MLH swag kits | Only prose: "build with the Google Gemini API". No formal criteria on Devpost; MLH partner page has none either (https://www.mlh.com/partners/gemini). Opt in on the submission form. TACIT qualifies if Gemini generates the replies and you say so in the description. |
| [MLH] Build With SpaceXSI | Cursor mechanical keyboard per team member | Use Cursor as core coding agent AND integrate a Grok Bot automation; describe both in project description; opt in to the raffle. Does not fit a Claude Code workflow. |
| [MLH] Best Use of Solana / Tiger Data / Vultr / MongoDB Atlas (MongoDB is untagged but sponsor) / Best Domain Name (GoDaddy Registry) / DEV Writing Challenge ($100, publish a post on DEV) | various | Use of the named product; no ElevenLabs prize appears on the Devpost list |

Discrepancy: hackumass.com also lists "Best Use of Nessie (Capital One)" and "Best Agentic Hack (Sentient OS)"; neither appears on the Devpost prize list. Ask organizers if you want to target them. Not on either page: any ElevenLabs prize.

### Rules (Devpost rules page plus hackumass.com)
- Team max 4; each member needs a Devpost account and must be listed as a contributor to be prize-eligible. One project per team. Open to all college students incl. grad students (Devpost: above age of majority in country of residence).
- **Project must be started after the opening ceremony. Creating or editing a project beforehand "will result in disqualification" (hackumass.com). Devpost: no work done outside the hacking period.** This research doc and planning are fine; do not commit pre-written code. Libraries, frameworks and open-source code are allowed but must be documented in the submission and stated in judging.
- **Public GitHub repo link required under "Try it out" links; code must stay public after the event.**
- **Live demo in the judging space is required.** At least one member must be present for judging on Sunday. A demo video under 3 minutes is optional but recommended.
- Cannot submit the project to other hackathons. Unfinished projects may be submitted.
- Violations: disqualification and/or referral to the MLH Cheating Team. MLH Code of Conduct applies.

### Submission checklist
1. Every teammate registered on Devpost and joined to the hackathon (https://hackumass-xiv.devpost.com/).
2. After opening ceremony: create project on Devpost; all contributors added.
3. Choose exactly one [HACKUMASS] category (suggest Best Accessibility Hack; MedTech or Most Impactful AI are alternatives) and opt in to [MLH] Best Use of Gemini API (and any other relevant sponsor prizes).
4. Public GitHub repo URL in "Try it out"; repo public.
5. Description: what it does, how Gemini is used, what is external code/libraries (voice provider, STT, etc.), what was built during the event, honest limits.
6. Optional but do it: demo video under 3 minutes, as insurance.
7. Submit by Sat 11:59 PM; final edits by Sun 9:00 AM (earlier of the two stated deadlines).
8. Be at the judging space from 12:30 PM Sunday with the live demo working and a fallback (recorded video, mocked call).

---

## 3. Three prize-winning repos (cloned shallow to scratch; file tree and docs read)

Whether they won: Orbis README claims "Hack the North 2026 finalist (top 12 of 350 teams) and 2nd place in the OpenAI track" (self-reported, not independently verified). GuyOnWifi/hack-the-north: no prize claim in the repo; it is a single-commit snapshot (UNVERIFIED that it won). Aircade README says "Built at Hack the North 2026" with a Devpost link; no placement claim found in README or DEVELOPMENT.md. Patterns below are descriptive only.

Repos: https://github.com/dtpu/OrbisEngine , https://github.com/GuyOnWifi/hack-the-north , https://github.com/apollo-ullah/Aircade

### Top 8 transferable practices

1. **One source of truth for agent rules, thin per-host shims.** Orbis `CLAUDE.md` is one line (`@AGENTS.md`); `hack-the-north/web/CLAUDE.md` is the same. Orbis `AGENTS.md` states it is "durable: rules that hold for every session. Do not edit it or record progress here"; progress lives elsewhere. Keep TACIT's `AGENTS.md` rules-only.
2. **A "Never" list and a dead-end ledger.** Orbis `AGENTS.md` "Never" section (no committing media/keys, no bare `git stash` because worktrees share it, no skipping or weakening tests to reach green, no killing processes you did not start) plus `docs/known-limits.md` ("Approaches already measured to fail. Do not retry one without a new idea") and `docs/research-log.md`. Cheap to copy: stops agents re-trying failed lipreading/VAD/latency ideas.
3. **Evidence discipline for sensor and hardware claims.** Orbis `AGENTS.md` "Evidence": exit codes and passing tests do not prove quality; screenshots/measurements go under `.context/evidence/`; "Simulated XR is not headset evidence"; label unobserved/invented content. Aircade `VERIFICATION.md` is a dated log whose entries say things like the real AirPod stream "confirms the real sensor/API path, not the physical handheld condition... Do not claim milestone 1 hardware proof"; sim vs real logs use distinct filenames and a mode column; physical conditions are "user-reported". Copy this for the AirPods nod and webcam mouthing: separate "simulated", "recorded clip", "live" in every claim.
4. **Reproducible demo without the hardware, plus an offline kill switch.** Aircade `DEVELOPMENT.md` "Test without AirPods", `--duel-smoke`/`--menu-smoke` flags and scripted-game tests (`Sources/Aircade/*Smoke.swift`, `ScriptedGameCheck.swift`). hack-the-north `HANDOFF.md`: `PROVIDER=mock ./run.sh` is "offline and instant", `DEMO_SAFE=1` forces the mock ("wifi-dead insurance"), `run.sh` starts the whole stack, `fixtures/*.json` and `fixtures/tape.sse` freeze payload shapes. For TACIT: recorded caller audio + recorded mouthing clips + cached TTS replay path.
5. **Closed-set LLM decision with schema validation and visible provenance.** Aircade README: game supplies five legal candidates, strict JSON schema requires exactly one `candidateID`, station validates, UI shows "Cached" if a prior decision is reused, shows "latest response" and "applied shot" as separate facts, late responses from abandoned runs cannot overwrite the next. Direct template for TACIT's three-candidate step, including stale-response handling. Also its README "For judges" table (contribution / what we built / what judges can inspect) maps neatly to the Gemini prize.
6. **Interface contract doc between lanes.** hack-the-north `HANDOFF.md`: endpoint table, frozen fixture files, "render `error.human` strings verbatim", actor/status enums; `STATUS.md` living checklist; `MORNING.md` ("what happened overnight", "Decisions for you", branch not pushed to main). Orbis `docs/frontend/PROGRESS.md`: unit / owned files / status / PR table. Gives each agent or teammate owned files and a done check.
7. **Pre-written judge narrative.** hack-the-north `docs/DESIGN.md`: prize-track strategy, a 3-minute demo order, the judge questions ("isn't this a wrapper?") with answers, and a "What's actually built (so I can speak to it honestly)" section. Fits HackUMass's four criteria and its required live demo; write TACIT's version tonight.
8. **Architecture rule that makes the LLM's job narrow, backed by measurements.** `brickify/AGENTS.md`: "Models decide what to build; code places every brick", numbered rules, a measured table of effort vs time/quality, "Measure, don't eyeball", an explicit contract file the app depends on. Orbis `docs/unattended-runs.md` adds overnight practice: a per-run brief (branch, deadline, spend caps), an append-only log used as memory after context compaction, "Never stop to ask: log the question, state a bounded assumption, continue". TACIT analogue: Gemini proposes, deterministic code scores viseme distinguishability and validates.

Also noted: Orbis `AGENTS.md` caps subagents ("At most two at once, on independent tasks; do not poll them") and tells orchestrators to give each worker "a concrete goal, owned files, relevant context, and verifiable done checks".

### Winning-team Claude Code write-ups (secondary, UNVERIFIED details; I only saw search snippets, not the pages)
- Anthropic winner profiles: https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon and https://claude.com/resources/articles/meet-the-winners-of-built-with-opus-4-7-claude-code-hackathon (one winner reportedly ran 5-6 parallel agents, one per domain).
- Parallel agents need worktree isolation or they overwrite each other: https://unmarkdown.com/blog/parallel-agents-worktrees-claude-code
- AGENTS.md/CLAUDE.md as a constraint engine, each agent owns a clean slice: https://inbarshirizly.substack.com/p/coming-soon
- 2025 hackathon retrospective: subagent hand-offs must be defined or they fail: https://jayleekr.github.io/blog/collaboration/toyprojects/2025-08-01-20250731-hackathon-lesson-learnt
- Parallel agents cost roughly N times the credits (practitioner claim, UNVERIFIED): https://engineering.myhoai.com/posts/how-i-run-parallel-coding-agents

---

## 4. Not verified / open questions
- What "Bobbai" refers to.
- SRAVI phrase count (paper's Supplementary Fig S1 not opened) and current availability; HRA 21.8%/34.6% figures.
- Voiceitt not researched.
- Whether Lingraphica Conversations works on phone calls or uses the user's own voice (FAQ silent on both).
- Most non-starred table rows rely on search-result summaries; open the cited URL before quoting.
- Exact final deadline (9:00 AM per hackumass.com vs 10:00 AM per Devpost); full judge list; Nessie and Sentient OS prizes missing from Devpost.
- Repo "win" claims (only Orbis self-reports).
