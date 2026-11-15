# HANDOFF — TACIT

**Last updated:** 2026-11-15 ~18:00 UTC (clock-checked)
**Last working agent/model:** Claude Code, Opus 5.5 (integration/release owner, Git owner) — session "Living Notch + Presence integration".
**Product:** Mode 2 only — silent speech → the user's voice inside an ordinary call (AGENTS.md top). Automatic speaking of
recognised words stays DISABLED.
**Start here:** `docs/RELEASE_RUNBOOK.md` (release gate, PASS/FAIL matrix, commands, rollback, physical checks), then this file.

## EXPERIMENTAL PERSONAL DEMO PROFILE — ACTIVE (2026-11-15 ~17:45–18:00 UTC, Claude; user-authorised, local only)
- **Running now:** server restarted on `def764f` code (idle: Live off, no call, no BlackHole reader) and the recognizer
  switched to `personal-demo` (silent2_251 overlay, EXPERIMENTAL, Review First). Verify: `./scripts/tacit.sh profile status`.
  **Rollback:** `./scripts/tacit.sh profile base` (sidecar only; `--force` in an emergency). Pre-change snapshot:
  `recognition/data/eval/demo_profile/pre_activation_snapshot.txt`. Base checkpoint and overlays unchanged (sha checked).
- **Commits:** `55d6342` fix(server) socket protocol errors no longer crash the server (one >64 KB /ws frame used to
  kill it; also caller/twilio) · `268186d` recognizer profiles · `def764f` Review First enforcement + `tacit.sh profile` ·
  `e854f6c` fix(recognition) strict JSON (-Infinity from a short window surfaced as "Recognition failed") ·
  `1a10171` review-flow-check · `b96c2d3` prerecorded replay tools.
- **Interface contract (additive, announced here for Sol):** `ServiceStatus.recognition.profile?: RecognizerProfile`
  `{id, label, experimental, reviewRequired, error, requested}`; `RecognitionHypothesis.recognizerProfile?:
  {id, experimental, reviewRequired}`; `/api/health` (token) adds `live {state, mode, reviewRequired}`. While
  `reviewRequired`, `live_control activate mode:'automatic'` is refused with reason REVIEW_REQUIRED_PROFILE. Optional
  notch request: show an "Experimental profile · Review First" badge from `services.recognition.profile` (today the
  existing Model line shows the model string, which says EXPERIMENTAL).
- **Evidence (existing data only; demoCheck fresh takes NOT recorded → fresh-take criteria UNVERIFIED):** see the
  addendum in `docs/research/TACIT_PERSONAL_ADAPTATION_V2.md` and the demo section at the top of `docs/RELEASE_RUNBOOK.md`
  (phrase card, flow, fallback). Checks: server 204 tests, recognition 50, web typecheck + 80; review-flow-check 6/6 on
  base and personal-demo (BlackHole, no reader); native `--analyze-video --send` replay personal 10/10, base 9/10.
- **General-release verdict for silent2_251 stays NO-GO.** heldout_v2 still unrecorded/unscored.
- **Still uncommitted (waiting on the user):** `recognition/prompts/adapt_v2_*.txt` (set E contains the user's first
  name; repo is PUBLIC) and `docs/research/TACIT_PERSONAL_ADAPTATION_V2.md`.

## JUDGING PITCH — produced outside the repo (2026-11-15 ~11:21–12:00 UTC, Claude) — no runtime/code change
- Workspace `~/Documents/TACIT-Pitch/` (NOT in Git; index in its `README.md`). Figma Slides master (user asked for
  Figma MCP): https://www.figma.com/slides/jf8CzZjdqJfhMHhcb9lCrT (7 main + 8 appendix, speaker notes). PDF from Figma
  renders; native PPTX from the same spec (`build/spec.py`), checked structurally only: Keynote/Quick Look automation hung, so
  it wasn't rendered in PowerPoint. Inter TTFs copied to `~/Library/Fonts` for the PPTX.
- Scripts 90 s / 3 min / 5 min, demo runbook, Gemini mini-pitch, 20-question Q&A, evidence sheet, rehearsal checklist.
  Sources verified today: Fassler 2026 (PMID 41485241), Musalia 2023 (PMID 37430313), ASHA practice portal, ACS 2026.
- **Demo caution recorded in the runbook:** while Live captures, the presenter's own talking is read as new utterances.
  Mouth → silent → Speak → Pause → talk. Still unverified (human): Meet listener hearing reviewed speech from the
  current build, live camera in the judging room, `--analyze-video --send` (Level 2 fallback) run by a human.

## PERSONAL ADAPTATION V2 — restarted by the user (2026-11-15 ~11:13 UTC, Claude) — no runtime change
The user explicitly lifted the 00:48 UTC ML freeze for one bounded experiment: ~150 new silent training sentences →
arm `silent2_251` (same recipe as silent1), pre-registered in `docs/research/TACIT_PERSONAL_ADAPTATION_V2.md` (to be
written BEFORE any training). Demo stack untouched (server 38791, sidecar 42794 left running; no restarts).
- **Phase 0 verified on disk (11:15 UTC):** base sha e740cef3… and silent1 overlay/run/meta/log match
  `data/eval/preserve_hashes_0.txt`; silent1 val errors ep0–6 = 84/63/53/50/48/52/57 (ep 4 chosen), 101 train
  (adaptA 50 + adaptB 43 + adaptBretake 8, 8 excludes) / 20 val; silent1_w50/w75/front1 overlays present;
  `20261114T215105Z-heldout1` is EMPTY — heldout_v2 still unrecorded/unscored.
- **Prompts written:** `recognition/prompts/adapt_v2_{c,d,e}.txt`, 50 each = 150 unique (2–8 words, median 6; 304 words
  new vs adapt_v1+val vocab). `eval.dataset prompts-check` vs all prompt files + inventory: 0 dup / 0 clash each.
  Extra near-duplicate scan (content-word Jaccard / shared 3–4-grams; scratchpad script, not committed) vs 241
  reference sentences + each other: 46 flags across 3 rounds → all evaluation-set (heldout_v2, adaptVal) neighbours
  and strong practised-frame neighbours replaced; final 0 flags. Not yet committed.
- **Preflight 11:17 UTC FAILED:** mouth brightness 74 (need ≥ 90; good sessions 149–161), IOD 69 px (sessions
  150–163 px). User must restore the adaptA/B lamp position + sit at the earlier distance, re-run `--check`.
- **adaptC audit (11:43–12:05 UTC, read-only, CPU only):** session `data/webcam/20261115T113516Z-adaptC` (three empty
  11:34 starts ignored). Labels 50/50 = adapt_v2_c exactly, 0 dup/missing/unlisted, all silent. All decode 1280x720,
  6.01 s, 180 frames, 29.97 fps, max gap 33 ms, 0 audio streams; FaceMesh 100 %. vs adaptA/adaptB (same scripts):
  ROI brightness 126–147 p50 140 (A 150, B 153 — lower, still ≫ 90; 3 clips < 130), IOD 139–147 p50 145 (A 142, B 156),
  roll p95 6.4° (A/B ~4°), words/s p50 1.67 (B 1.84). Smile screen (width ≥ 25 % over rest ≥ 6 frames; on adaptB it
  hits 5/8 historical excludes, 2/43 kept) + frame-strip review: grins in clip04/16/17/18/21/25/30; end truncated
  (still articulating at the last frame) clip22/35. Tail/early/rate flags on 02/07/23/41/48 = false positives (visual).
  **Verdict: RETAKE 9** → `prompts/adapt_v2_c_retake.txt`; 41 valid. Train later with `--train adaptCretake` and
  `--exclude adaptC/clip04 …/clip16 …/clip17 …/clip18 …/clip21 …/clip22 …/clip25 …/clip30 …/clip35`. Originals untouched.
  Audit scripts + results + images: `recognition/data/eval/audit_v2/` (git-ignored).
- **adaptCretake + adaptD audit (12:04–12:20 UTC, same scripts/rule):** `20261115T115544Z-adaptCretake` 9/9 = exactly
  the 9 excluded adaptC sentences → set C = 50 unique labels = adapt_v2_c, no duplicate training label once the 9
  excludes apply. `20261115T115728Z-adaptD` 50/50 = adapt_v2_d, 0 dup/missing/unlisted. All 59 decode 1280x720, 6.01 s,
  179–180 frames, 0 audio, FaceMesh 100 %. Light much better: ROI brightness p50 151 (C-accepted 140), L/R asymmetry
  p50 ~11 (A 49, B 37, C 34); IOD D p50 151; roll p95 D 5.5°. RETAKE 4: adaptCretake/clip08 "thanks that was really
  kind" (grin again), adaptD/clip36 + clip44 (grin), adaptD/clip50 (ends < 0.1 s before clip end, precaution) →
  `prompts/adapt_v2_cd_retake.txt` (session name adaptCDretake). Pre-stated: a third grin on "thanks that was really
  kind" drops that sentence (C = 49). Tail flags 13/22/26/33/43 and black-frame "early" flags = false positives (visual).
  Images: `data/eval/audit_v2/{cr_spread,d_spread,d_tail}.png`.
- **Set E replaced at the user's request (~12:25 UTC, before recording):** `prompts/adapt_v2_e.txt` is now 50
  DEMO-DOMAIN sentences (self-introduction with the user's first name ×3, "tacit" ×2, explaining the product, call
  phrases). prompts-check 0 dup / 0 clash vs every prompt file + inventory (incl. C/D); near-duplicate scan: no
  neighbour in any evaluation set (heldout_v2, adaptVal, dev, live:test); only mild overlaps with training sentences and an
  intentional intra-E "can you hear me" ×2. Consequence for the prereg: recognising these phrases at demo time is
  training-set performance, never generalisation evidence; set E differs in domain from C/D (document it).
- **adaptCDretake + adaptE audit (12:35–12:50 UTC):** `…122336Z-adaptCDretake` 4/4 PASS (incl. "thanks that was really
  kind", 3rd take, no grin); `…122758Z-adaptE` 50/50 = NEW demo set (verified, not the old list), 48 PASS, RETAKE 2:
  clip03 (grin), clip05 (late start + ~0.2 s end margin + grin-like spreads, precaution) → `prompts/adapt_v2_e_retake.txt`
  (session adaptEretake). E light: brightness p50 139, IOD 143.
- **Dry-run 12:37 UTC (no model, no MPS):** 8 sessions, 23 excludes matched, 249 train / 20 val, hygiene passed;
  independent check 249 clips = 249 unique labels, ∩ val = ∩ heldout = 0; v1 101/101, C 50/50, D 50/50, E 48/50.
- **Pre-registration written** (12:38–12:50 UTC, before training): `docs/research/TACIT_PERSONAL_ADAPTATION_V2.md` —
  arm D silent2_251 (silent1 recipe, frozen HP), conditional D50 (alpha 0.5, only if D fails CREMA-D alone), unchanged
  E.5 gate, sign test + paired bootstrap, adaptVal = optimistic development evidence, heldout once.
- **adaptEretake** `…124106Z-adaptEretake` 2/2 PASS (12:42 UTC). **Final dry-run: 251 train / 20 val, 9 sessions,
  23 excludes; 251 unique = v1 ∪ C ∪ D ∪ E exactly, ∩ val = ∩ heldout = 0.** Manifest:
  `data/eval/audit_v2/silent2_251_train_manifest.json`; command env `data/eval/audit_v2/silent2_cmd.sh`.
- User confirmed TACIT idle (12:42 UTC). Pre-run hashes `data/eval/preserve_hashes_v2.txt` (base e740cef3…, silent1,
  w50, w75, front1 overlays + run.json); prior bench results archived to `data/eval/bench/archive_pre_v2/`.
  **Training `silent2_251` started 12:43 UTC** (log `data/eval/silent2_251_train.log`). Analysis script
  `data/eval/audit_v2/analyze_v2.py` reproduces silent1's documented 84→48, 15/3, p=0.008.
- **RESULT (13:10 UTC): NO-GO.** silent2_251 (epoch 6 = cap, overlay sha 48460d67…, run 12:43–13:02): val errors
  84 → **36**/114 (silent1 48, W50 64), 15/1 better/worse (p=.001), CI [−57.0, −27.3] pt — but **CREMA-D 61/536 =
  11.4 % (+5.2 pt; 0 better / 19 worse; CI [+2.9, +7.9])** and **rest-after-floor dev 1 vs 0, val 2 vs 0** → gate
  items 3 and 5 FAIL. D50 not built (allowed only if CREMA-D were the sole failure). Phase C not run; heldout_v2 still
  unrecorded (`…215105Z-heldout1/manifest.jsonl` 0 bytes). All 9 preserved hashes OK; nothing deployed; server/sidecar
  never restarted. Full table + proposals: `docs/research/TACIT_PERSONAL_ADAPTATION_V2.md` → Results.
- Gotcha (zsh): an unquoted `$VAR` holding several flags is passed as ONE argument — wrap such loops in `bash -c`
  (cost one wasted bench pass; the base-only results were re-run so all four candidates are back to back).
- Uncommitted: `recognition/prompts/adapt_v2_{c,d,e}.txt`, `adapt_v2_{c,cd,e}_retake.txt`, the research doc, HANDOFF.
  Waiting on the user: set E contains the user's first name and the repo is PUBLIC — commit only after they agree.

## GEMINI SPONSOR-TRACK AUDIT (2026-11-15 11:04–11:11 UTC, Claude) — no runtime change
- Deployed build verified = main: server pid 38791 (05:37 UTC, no server/shared change since), companion pid 48577
  (binary 05:51, no newer source). Live `respond_status` = Google Gemini, models flash-lite → flash (code defaults).
- Fresh: `respond:eval` real Gemini 20/20, p50 872 ms, p95 2610 ms, 0/58 removed, focus 4/4; live WS probe on :8790
  (doctor's-office scenario) share_view median 1097 ms (n=5), refusal/cancel/supersede/injection OK, 0 speech events;
  respond.test 20/20; Swift PresenceTests 15/15.
- **Risk:** eval + probe together (~35 calls/20 s) hit Gemini **429 per-minute quota** (recovered in ~40 s). Never run
  evals/probes within ~2 min of judging. Paste (don't type) Help Me Respond context: code suggests the empty field turns
  into the bubble after the first character (unverified in GUI; Sol-owned, not changed).
- Added root `README.md` (`0f479b8`, pushed) — the public repo had none. Full report, 35–40 s demo script, Devpost copy:
  `~/Documents/TACIT-Film-Production/devpost-upload/submission-notes/GEMINI_TRACK.md`.
- Repo description still mentions "wearable sensing"; suggested `gh repo edit` commands are in that report (not run).

## DEVPOST MEDIA — produced outside the repo (2026-11-15 ~10:45–11:00 UTC, Claude)
- `~/Documents/TACIT-Film-Production/devpost-upload/`: 10 gallery PNGs (1800×1200, ≤1.5 MB each), video thumbnail
  1280×720, social 1200×630, contact sheets, `DEVPOST_UPLOAD_CHECKLIST.md`, `submission-notes/DEVPOST_LINKS.md`,
  `YOUTUBE_UPLOAD.md`. Remotion stills source in `source/` (film project untouched). Help Me Respond views rendered with
  the shipped binary's `--render-presence` (copied out of the bundle; running app/server untouched).
- **Repo made PUBLIC** by Claude at the user's explicit request (~11:05 UTC; verified signed out). Video:
  https://youtu.be/GeV55H-ozqw (user-supplied; embeddable, 168 s = 2:48 cut). Everything pushed is now world-readable —
  never push secrets, recordings or invite links (AGENTS.md "Never commit" list matters more than ever).

## FILMS — produced outside the repo (2026-11-15 08:02–08:45 UTC, Claude)
- Production workspace `~/Documents/TACIT-Film-Production/` (NOT in Git; contains the founder's face clips). Renders:
  `renders/TACIT_Devpost_Demo_2m48s.mp4` (168.0 s), `TACIT_Directors_Cut_3m40s.mp4` (220.1 s), `TACIT_Judging_Cut.mp4` (75.1 s), all 1080p30 H.264, −16 LUFS;
  Remotion project `timeline/tacit-film/`; notes, storyboards, captions, manifests in `production-notes/`, `captions/`.
- Footage: founder's silent clips (video-only) + verbatim evaluator hypotheses; real notch captures; offline lab renders
  labelled as such; brand motion from `feat/brand-orb` (still unmerged). No Higgsfield footage (10 credits; MCP unlim
  unavailable). Narration: ElevenLabs stock voice (free tier, credited). TACIT app, server, branches untouched.
- Deadline per hackumass.com schedule: final submission 9:00 AM EST Sun Nov 15 (Devpost pages 403 to the agent; user
  recalls 10 AM final edits — unconfirmed).

## LIVING NOTCH + PRESENCE — integrated, DEPLOYED (2026-11-15 05:29–05:56 UTC) — main `cbb1612`
- **Codex checkpoint (05:26 UTC, yielded in WORKSTREAM_SOL)** reviewed and committed on `feat/living-notch`: `302bc0c`
  feature, `8e04de7` workstream docs (SHA-256 manifest taken before staging). Untracked `docs/demo-review-races-codex.mts`
  left untouched (not part of the yield). Codex's preview instance (pid 27862) quit at deploy; it is superseded.
- **Integration:** worktree `../tacit-integration`, branch `release/living-presence` = living-notch + `feat/presence`
  (`ae5fb91`, clean merge — no file overlap). Help Me Respond = dock speech-bubble button inside the 460×350 workspace;
  renders without clipping (lab 19/19 geometry).
- **User request mid-session (~05:46 UTC):** "move the tacit ui upwards into the dark notch area… tacit branding to the
  left". `cbb1612`: on notched displays the window is flush with the screen top, compact = notch band (cutout height,
  66 pt wings → 317×32 here), "tacit" left wing, glyph + Pause/Stop right wing; Peek/workspace drop down from it;
  non-notch = 264×38 pill below the menu bar. Tests updated to pin it. **Sol/Codex: this supersedes the below-notch
  neck geometry — start any further notch work from `cbb1612`.**
- **Gate (merged tree):** Swift 103/103 · server tsc + 196/196 · web tsc + 80/80 + build · TacitRoute 4/4 · tacit-voice
  5/5 · recognition 40/40 · offline selftest 10/10. Isolated server (:8799, route off): `--presence-check` real Gemini
  11/11; `security:check` 11 + 2 known Twilio env FAILs. (Gotcha: `security:check` targets `TACIT_HTTP`, default
  :8790 — set `TACIT_HTTP=http://localhost:8799` for an isolated server.)
- **Deploy (idle: Live/output off, 0 BlackHole readers, last activity 05:26):** ff-merge to main, server restarted
  05:37 UTC (pid 38791), companion rebuilt + relaunched; relaunched again 05:51 UTC (pid from that build) for `cbb1612`. **A re-signed build
  shows macOS "TACIT would like to access files in your Documents folder" — the user must click Allow** (token read);
  until then the notch says Connecting… and the launcher says "has not connected yet".
- **Live runtime checks after deploy:** live:check OK · speech:check OK · reviewed:check 13/13 · myvoice:check --preview
  10/10 (restored Daniel) · live:stress --kill-recognizer OK (8 s) · security:check 13/13 · companion --selftest OK ·
  `--presence-check` 11/11 incl. edited draft spoken once via speak_typed → rendered at BlackHole (no listener) ·
  native `--analyze-video --send` exact on 2 recorded clips. Final state: Live off, output off, 0 readers, Gemini on.
- **Film:** `docs/FILM_FEATURE_AUDIT.md` (verified features, claims to avoid, shot list per cut). Real window captures
  in `macos/TacitCompanion/.build/film-evidence/` (ignored). Hover Peek, Help Me Respond / My Voice / Real-time in the
  real notch and screen recordings need a human pass (agent has no Accessibility permission). No Higgsfield footage made.
- **UX notes (not fixed):** a pending review keeps priority in the Peek if speech starts from ANOTHER client (header says
  Speaking + Stop, body shows the review); "tacit" appears twice in the expanded workspace (crown + header); focus loss
  while pasting into Help Me Respond collapses the notch after 380 ms (context kept).
- **SECURITY — AWS key exposure (Codex profiling, 2026-11-15 04:57:39 UTC):** long-term IAM user key `AKIA…GZGD`
  (also `[default]` and `[jobforge]` in ~/.aws/credentials). Root cause: `~/.codex/config.toml` →
  `[shell_environment_policy.set]` injects AWS_ACCESS_KEY_ID/SECRET into every Codex shell; an Instruments metadata
  export printed them. Exposure: one tool output in Codex session `rollout-2026-11-14T23-44-55-01a1dd85….jsonl` (key ID
  + secret, 2 lines) — i.e. sent to Codex's model provider and stored locally. NOT found in: any repo/worktree incl.
  ignored `.build` evidence, full Git history (all refs), /tmp, $TMPDIR, ~/Library/Logs, Claude transcripts. STS now
  returns InvalidClientTokenId for this key (inactive or deleted — rotation NOT confirmed by anyone). **Urgent, human:**
  confirm in IAM the key is deleted, issue a new one if needed, review CloudTrail for the key since at least 04:57 UTC
  (ideally since it was put in the Codex config), remove the creds from `~/.codex/config.toml` (+ its backup copy).
- **Rollback:** tag `demo-modes-2026-11-15` (see RELEASE_RUNBOOK → CURRENT RELEASE).
- **Worktrees removed at the user's request (06:05 UTC, disk):** tacit-demo, -integration, -my-voice, -native,
  -p1-integration, -presence, -review-races — all clean and on main (review-races = `d3fa006`, checked by range-diff);
  branches kept. Then (user: "go + qa"): `../tacit-independent-qa` removed after its unique QA docs were archived
  in `docs/qa/codex-independent-qa/` (`21217f8`; its code was already on main; its 1.4 GB was Swift build caches). Also
  cleared: ~/.cache/huggingface (old datasets/models, not TACIT), Playwright/Cypress caches, a stale Codex runtime
  install, companion `.build/{out,index-build,living-notch-build}` + Codex's preview app. Disk 6.9 → 32 GB free.
  Not cleared: uv cache (8.6 GB) — locked by running uvx MCP servers; `uv cache clean` once they are closed.
  Still present: Codex's `~/.codex/worktrees/564f` (uncommitted, superseded since 02:45 UTC).
- **Disk:** was 0.7 GB free at 05:35 UTC; now ~2.8 GB after removing this session's caches. Biggest reclaimable:
  ~/Library/Caches/ms-playwright (3.5 GB), Codex's `.build/living-notch-build` (360 MB, rebuildable).
- **Next (human):** Meet listener test of Review → Speak, Help Me Respond → Speak and Stop; live camera with a person;
  hover Peek; film capture pass; then rotate/verify the AWS key.

## PRESENCE — AI Help Me Respond (2026-11-15 ~04:45–05:25 UTC) — branch `feat/presence`, NOT merged, NOT deployed
User asked for Help Me Respond to become a real, opt-in communication assistant. Built in worktree
`../tacit-presence` (from `c33a813`); the running demo (server pid 87313, app pid 87493) was not touched.
Commits: `b86d815` server · `f6e7679` companion · `3b22047` research doc. Pushed to `origin/feat/presence`.
- **Flow:** They said (typed/pasted, or SAMPLE — never "live") → your move (Ask a question · Share my view · Disagree
  kindly · Buy a moment · Phrase it for me) → your own point for opinion intents → Gemini wording in an editable bubble
  → one Speak via the normal `speak_typed` (output generation + voice revision locked). AI never overwrites user text.
- **Safety:** opinion intents refused without the user's point; context fenced as untrusted; deterministic grounding
  checks (new numbers/dates/names/links/experiences, stance for neutral intents); replies only to the requesting socket;
  newer request supersedes; cancel / Stop / disconnect abort; content never logged; module has no path to speech.
- **Evidence (fresh):** server 196/196 (+20 respond, +1 assisted); Swift 94/94 (+15 PresenceTests); web tsc + 80/80;
  offline selftest 10/10; `respond:eval` real Gemini **20/20, p50 920 ms, p95 1669 ms, 0/55 drafts needed removal,
  focus verbatim 4/4** (synthetic agent-written cases incl. 2 injections + personal-fact bait); `--presence-check`
  native → isolated server (:8799, `TACIT_ROUTE=off`) → Gemini → native: all PASS, ~1.2 s round trip, cancel/supersede
  OK, zero speech before Speak; WS probe: other client got 0 suggestions, Stop cancels, 0 speech deliveries;
  security:check 11 PASS + 2 known Twilio env FAILs (no whisper on isolated server). Offline renders inspected at
  404×196 and 360×176 (fixed: truncated placeholder, clipped failure line, redundant retry, wrong empty-editor label).
- **Not verified:** final Speak rendering to BlackHole (route off by design in isolation; same typed path verified in
  earlier releases); live GUI in the real notch; human/AAC-user testing. **Live meeting capture NOT implemented**
  (needs a human TCC grant + a remote Meet participant): `docs/research/PRESENCE_MEETING_AUDIO.md`.
- **Interface contract (additive, on the branch):** C→S `respond_suggest {requestId, intent, context ≤4000,
  contextSource 'user-provided'|'sample', userPoint? ≤500, tone? 'brief'|'warm'|'direct'}`, `respond_cancel {requestId}`;
  S→C `respond_status {available, provider, models, dataNotice, reason}` on connect, `respond_suggestion {requestId,
  state generating|ready|refused|failed|cancelled, intent, contextSource, drafts[{text}], focus, model, reason,
  generationMs, removed}`; `speak_typed.assisted?` → `SpeechDelivery.assisted?`. Web ignores all of it (checked).
- **Codex/Sol (Living Notch, ACTIVE):** the branch does not touch IslandController/IslandGeometry/IslandView/ExperienceLab
  (session binding moved to App.swift). Presence content needs ≥ ~360×176 pt; one-line change in
  CommunicationWorkspace (`PresenceView`). At the user's request (05:05 UTC) Claude quit only Codex's
  `TACIT Living Notch.app` test instance and its `recognition-check.mjs` replay (it sat on top of the real notch); Codex's
  source edits were not touched. User: "codex will take care of" making the notch subtle.
- **Rollback:** nothing deployed; main unchanged. To integrate later: merge `feat/presence` after Codex's checkpoint,
  rebuild app, restart server while idle (`TACIT_RESPOND=off` disables suggestions without a code change).

## SPEAKING MODES + DEPLOY (2026-11-15 ~04:30–04:55 UTC) — merged `7942fbd`, RUNNING
User asked for a fast "human realism" mode and a human-in-the-loop mode. **Policy change approved by the user and
recorded in AGENTS.md** (automatic speech exception + one-tap Speak).
- `3af43dc` server: `live_control activate mode:'automatic' acknowledgeUnreviewed:true` → `LiveStatus.unreviewed:true`;
  `speakRecognized` speaks raw words verbatim (casing only) once per utterance; plain `automatic` still refused;
  kill switch `TACIT_REALTIME=off`; gate stays UNVALIDATED, `autoTransmitAllowed:false`. **Interface contract (additive):
  `LiveStatus.unreviewed?`, `live_control.acknowledgeUnreviewed?`; `speech_delivery` source `recognized` now occurs.**
  Sol/web: web ignores both (typecheck + 80/80 unchanged).
- `48ce356` notch: Review first = one tap Speak (exact shown words via speak_reviewed); Real-time = mode switch +
  confirmation card + REAL-TIME badge + spoken transcript; no review UI for already-spoken words.
- Deployed while idle (no BlackHole reader, only the app connected): server restarted 04:44 UTC (pid 87313), app
  relaunched (pid 87493) — also activates the navigation fix below.
- Evidence: server 175/175 (+8 realtime); Swift 80/80 (+7 SpeakingModeTests); web 80/80; live:check, speech:check,
  security:check PASS; reviewed:check 13/13 (with --allow-listeners: the only "reader" was TACIT's own tacit-route
  loopback helper, a stale cached status after speech:check — standalone preflight showed no reader); companion
  --selftest 7/7, --offline-selftest 10/10. **Real-time end to end** (`TacitCompanion --analyze-video --realtime`,
  recorded clips → native pipeline → live server → recognizer → automatic speech → BlackHole, no listener):
  "HOW ARE YOU DOING" and "PLEASE TURN ON THE LIGHTS" recognised and spoken, request→audio 345 ms / 762 ms (queued);
  nonspeech clip → nothing. Lab renders: review (one Speak), realtime-confirm, realtime, ready with mode switch.
- Launcher waits up to 30 s for the app (a re-signed app took ~12 s on first launch).
- Not verified: live camera with a human in either mode; Meet listener.

## NOTCH NAVIGATION FIX (2026-11-15 ~04:15 UTC) — merged `1becab2` (fix `fix/notch-navigation`), running since 04:44 UTC
User: after opening phrases/My Voice/typing there was no way back to the camera view. Now: dock "Camera" home button
(green dot while capturing), "‹ Camera" back button on every other surface, Escape steps back before collapsing,
successful Speak from phrases/composer returns to the camera view (draft kept; Hold stays put), "New words to review ·
Show" banner elsewhere. Swift 73/73, offline selftest 10/10, lab renders checked. **Not relaunched:** Brave was reading
BlackHole 16ch (a Meet session) at deploy time, so the running app (pid 68965, from 7dd51dd) was left alone; the new
bundle is built on disk. To use it: quit TACIT (notch ••• or menu) when not in a call, then `./scripts/tacit.sh demo`.

## ONE-CLICK DEMO + NATIVE CAMERA + CODEX P1 — integrated and deployed (2026-11-15 03:25–04:00 UTC)
User asked for: Codex P1 fixes first, then one obvious entry point, and "the live preview website shouldn't be
something I have to rely on". Done in that order. Runbook: **`docs/RELEASE_RUNBOOK.md` → "30-second startup"**.
- **P1 (Codex) — `fix/tacit-p1-reliability` → `e6bced1`, merged `1755090`, tag `demo-p1-2026-11-15`.** Patch applied
  unchanged (sha256 cd67ff91…, all 9 file hashes = manifest). New native tests FAIL on 4920946 (7 requests for one
  pending message; correction nil after reconnect) and pass after; `docs/qa/verify-p1.mjs` 14/14 in an isolated worktree.
  Companion rebuilt + relaunched 03:34 UTC while idle; live `--selftest` 7/7.
- **Root causes of the confusing startup (investigated):** (1) "Start in camera workspace" only opened a new browser
  tab (one per click); the notch had no way to start capture. (2) The browser stores the token per tab
  (sessionStorage) → any tab opened without `?token=` asks for an access code. (3) The browser workspace pauses and
  releases the camera whenever its tab is hidden (`visibilitychange`) — e.g. Meet in the same window — and never
  resumes by itself (by design). (4) "Those words have expired" = any later mouth movement (smile/talk) sends a new
  header → `review_invalidated`, or the 120 s TTL. (5) "Voice ready" referred to output only.
- **Native Start (`feat/native-start` → `bb52d66`, launcher `c66f343`, merged `7dd51dd`):** camera now runs INSIDE
  TACIT.app (AVFoundation + Apple Vision lip landmarks + Swift port of the browser endpointing) and uploads the same
  `visual_utterance` + JPEG frames over the app's authenticated socket — **no shared/server/web change**. "Start
  communicating" = enable/resume voice output + camera permission (macOS prompt, `NSCameraUsageDescription`) + camera +
  `live_control activate display-only camera`. Pause/Stop/disconnect/another client activating → camera released, never
  auto-restarted. Windows are DROPPED while a candidate is selected/edited or speech is queued/synthesizing/routing.
  `CommunicationGuide` (pure, tested) drives the notch copy + one recovery action per state; call line reports only the
  virtual-mic readers ("In Google Meet, choose BlackHole 16ch" / "a calling app is using …"), never "heard".
- **Calibration (recorded clips, not a human live test):** `TacitCompanion --analyze-video` — velocity 0.40, quiet
  640 ms (browser 480 split 6/92 sentences; 640 splits 2/92), 0 missed; nonspeech swallow 0, smile 0, 'listen' 1.
  Threshold chosen on adaptVal, checked on 72 clips from other sessions (adaptB, s1, diag1, bright-test).
  End-to-end `--analyze-video --send` (real client upload → running server → recognizer, display-only): bright-test
  "HOW ARE YOU DOING", "PLEASE TURN ON THE LIGHTS" exact, "I WOULD LIKE SOME WORK PLEASE"; nonspeech → no window.
- **Launcher:** `./scripts/tacit.sh demo` / double-click `TACIT Demo.command`. Measured: cold (server + app stopped) →
  ready in 12 s; warm re-runs 2 s, same server pid 68808, same single app pid 68965, 1 recognizer. No secrets printed.
- **Release tag `demo-oneclick-2026-11-15`** (this docs commit). Rollback: `demo-p1-2026-11-15` (P1 only),
  `demo-release-2026-11-15`, `demo-known-good-2026-11-15` — see RELEASE_RUNBOOK → Rollback.
- **Next (human, ~5 min):** double-click `TACIT Demo.command` → Meet mic = BlackHole 16ch → notch Start communicating
  → Allow camera → mouth a sentence → Speak with a Meet listener on a second device; then the physical checklist.
- **Real GUI:** screencapture of the live notch after cold launch: "Ready to start", Start communicating, "Voice off ·
  In Google Meet, choose BlackHole 16ch as the microphone". **Not done by an agent:** pressing Start (needs a human to
  answer the macOS camera prompt — never automated), live camera recognition with a human, Meet listener.
- **Sol/Codex coordination:** companion files edited by Claude with the user's direct request (Client.swift,
  CommunicationWorkspace.swift, CompanionContent.swift, IslandController.swift, App.swift, build-app.sh; new
  NativeLivePipeline/NativeCamera/StartCommunicating/VideoAnalysis.swift, Tests/NativeStartTests.swift). **Sol: start
  any further native work from current `main`.** Web untouched. Worktrees left: `../tacit-p1-integration`,
  `../tacit-demo` (both merged).
- **Fresh gate on `7dd51dd` (live runtime from the cold launch, idle, 03:48–04:00 UTC):** server tsc 0 + **167/167**;
  web tsc 0 + **80/80** + build; companion Swift **69/69** (54 + 15 NativeStartTests); TacitRoute **4/4**; tacit-voice
  **5/5**; recognition unittest **40/40**; `security:check` 14 PASS; `live:check` OK; `reviewed:check` all PASS (stop
  during reviewed speech 21 ms); `speech:check` OK; `myvoice:check --preview` all PASS (first attempt refused itself
  because TACIT's own loopback helper was still reading BlackHole — rerun with no reader: PASS); companion `--selftest`
  7/7; `--offline-selftest` 10/10. Launcher cold 12 s / warm 2 s (no restart, one app). Server/shared/web/recognition
  byte-unchanged vs `demo-p1-2026-11-15`; gate UNVALIDATED; automatic speech disabled.

## UNIFIED RELEASE — My Voice + Sol native experience, integrated and deployed (2026-11-15 02:10–02:45 UTC)
User approved both for integration. **Rollback tag `demo-known-good-2026-11-15` = `e710dfe`** (verified ~01:00 UTC).
Release gate, matrix, commands, exact rollback and the physical checklist: **`docs/RELEASE_RUNBOOK.md`** (rewritten).
- Merges on main: `2435a1d` My Voice · `e5c86e5` preflight/health My Voice row · `03cb9a4` Sol native experience
  (8cc130a feature, c793e1a docs) · `263e872` My Voice in the notch (3dc3a5d) · `35ec16a` lab real-snapshot render.
- Runtime restarted 02:26 UTC while idle (Live off, output off, no BlackHole readers); companion rebuilt (ad-hoc signed,
  verify OK) and relaunched from HEAD 02:36 UTC. Preflight 0 FAIL: "My Voice engine — speaking as Samantha".
- Fresh gate: server 167/167, Swift companion 40/40, tacit-voice 5/5, TacitRoute 4/4, web 80/80 + build, recognition
  40/40; live:check, live:stress --kill-recognizer, reviewed:check 13/13, speech:check, security 13/13, ui:check A+B,
  myvoice:check --preview, companion --selftest 7/7, --offline-selftest 10/10. Latency to BlackHole p50 68–94 ms (say 945).
- Unchanged vs the tag: recognition/, live.ts, reviewed.ts, route.ts, TacitRoute; gate UNVALIDATED; weights e740cef3….
- Not verified: Meet listener (two voices, reviewed, corrected, Hold, phrase, Stop); live camera with a human.
- **Sol coordination:** Sol's yielded files were copied by SHA-256 manifest into `feat/tacit-native-experience` and are
  on main; the Codex worktree (`~/.codex/worktrees/564f`, detached `e710dfe`, uncommitted) was NOT modified and is now
  superseded. **Before any further native work, Sol must start from current `main`** (its old worktree lacks
  MyVoiceViews.swift and the Client/Workspace/Lab My Voice changes — editing there would overwrite them). Claude edited
  companion files `Client.swift`, `CommunicationSession.swift`, `CommunicationWorkspace.swift`, `ExperienceLab.swift`,
  new `MyVoiceViews.swift`, `Tests/MyVoiceTests.swift` with the user's explicit authorization for this integration.
  Worktrees left: `../tacit-my-voice` (feat/my-voice), `../tacit-native` (fix/lab-real-voice-status, merged).

## Interface contract — My Voice (LIVE on main since 2026-11-15 02:26 UTC; additive; native UI implemented in `MyVoiceViews.swift`)
Types in `shared/protocol.ts` on the branch: `VoiceOption`, `VoiceStatus`, `VoicePreviewState`. Nothing existing changes
meaning; clients that ignore the new messages keep working (companion `default: break`, web if/else — checked).
- **S→C `voice_status {status}`** on connect and after every change: `revision`, `selected {voiceId, rate?, pitch?,
  source}`, `effective {voiceId, rate?, pitch?, label}` (what will speak), `fallback` (reason when effective ≠
  selected — show it), `voices: VoiceOption[]` (`id, name, locale, language, provider, quality, kind, novelty,
  available, unavailableReason, local, controls {rate?, pitch?: {min,max,default,step}}`), `samples` (preview
  phrases), `engine`, `applePersonalVoice {authorization, usableInCalls:false, reason}`, `custom`, `lastChange
  {requestId, ok, reason}`.
- **C→S `voice_select {requestId?, voiceId | null, rate?, pitch?}`** → result in `voice_status.lastChange` (match
  `requestId`). null = back to default. Only render sliders for `controls` present; send values inside the range.
- **C→S `voice_preview {previewId, voiceId, rate?, pitch?, text? (≤200, verbatim) | sample? (index)}`**, **`voice_preview_stop`**
  → S→C `voice_preview {preview}`: synthesizing → playing → done | stopped | refused | failed; `output` = local device
  name ("Plays on MacBook Pro Speakers only"). A refusal reason explains a virtual-mic sound output.
- **Speak requests:** add `voiceRevision: voice_status.revision` to `speak_typed` and `speak_reviewed` (optional,
  recommended). Mismatch → refused "Your voice changed…" (reviewed: utterance NOT consumed — press Speak again).
  `output_status` gains `voiceId`, `voiceRevision`; `speech_delivery` gains `voiceId` (voice bound at acceptance).
- **UI rules:** choose by listening — no gender/personality copy; hide `novelty` voices behind "More voices"; show
  `kind:'apple-personal-voice'` voices disabled with `unavailableReason`; never present preview as call audio; previewing
  the ElevenLabs clone (`local:false`) uses the network. Voice choice never edits the user's words.
- **Persistence:** the server stores the choice in `server/data/voice-prefs.json` (0600) and restores it on restart
  (`selected.source:'saved'`); `persisted`/`persistError` say whether saving worked. Clients store nothing.
- **Rate/pitch:** only when `controls.rate`/`controls.pitch` exist (Apple voices: rate 0.3–0.7 default 0.5, pitch ×0.8–1.25
  default 1.0, step 0.05); send values inside the range or the selection is refused (never clamped).
- **Error states to render:** `lastChange.ok:false` + reason (unknown/unavailable voice, out-of-range control) ·
  `fallback` (saved voice missing/engine restarting → macOS default; show it) · `engine.state` `starting`/`unavailable`
  (only the macOS default is usable) · preview `refused` (Mac output is/contains a virtual mic; cannot verify; unknown
  voice; text > 200) or `failed` (render/playback) · speak refused "Your voice changed after this was shown" (press
  Speak again; reviewed utterance not consumed) · disconnected (`voice_status` absent until reconnect).

## Integration pivot — release gate (2026-11-15 00:48–01:02 UTC)
User decision: ML workstream FROZEN (no training, no heldout_v2, no new recordings; pretrained base stays default; no
overlay deployed). Priority = complete, reliable macOS app for the demo.
- Committed Sol's yielded notch (`d51d51a`); cherry-picked Codex's review-race fix from `fix/review-races` (`d3fa006`;
  HANDOFF conflict resolved to main's text); restored synthesis-only sentence casing for ALL-CAPS model candidates
  (`fc7027c`); native follow-up — choices bound to their rendered utterance + `review_invalidated` handling (`b5991bc`);
  `live:stress` burst assertion updated to the new contract (`4927244`); `reviewed:check` gained live correction +
  invalidation checks and rerunnable request IDs (`a091ff3`).
- **Interface contract (additive, now on main):** `ServerMessage` `review_invalidated {authorizationId, generation,
  utteranceId}` — a valid newer header revokes every earlier review choice; superseded results are abstained and sent only
  to the submitting socket. Terminal `npm run review`: full token `1@v3` / `e 1@v3`. Sol: the notch already consumes it.
- Runtime restarted 00:54 UTC via `tacit.sh restart` (idle since 21:06, only the companion connected); then stop/start
  once more for the lifecycle test. Recognizer = pretrained LRS3_V_WER19.1 sha e740cef3…, no overlay. Companion rebuilt
  (ad-hoc signed) and relaunched with the node launcher; it reconnects by itself across server restarts.
- Checks (all fresh): server 140/140, web 80/80 + build, companion Swift 18/18, TacitRoute 4/4, recognition 40/40,
  security:check, preflight (0 FAIL), Codex preflight (0 FAIL, 4 human actions), companion selftest 7/7, live:check,
  live:stress --kill-recognizer, reviewed:check 13/13, speech:check, ui:check A+B. route:check NOT run (rewrites calibration).
- Not verified: remote Meet audibility of reviewed/corrected speech; human live-camera trial. Recommendation: GO for a
  reviewed-speech demo conditional on the physical checklist in RELEASE_RUNBOOK.
- Untracked, intentionally: `docs/demo-review-races-codex.mts` (historical diagnostic; crashes on the new terminal
  syntax by design). Codex worktree `../tacit-review-races` (branch `fix/review-races`) left in place; its fix is on main.
- Next: user's physical rehearsal (RELEASE_RUNBOOK checklist); no further code changes unless rehearsal finds a defect.

## Generalisation experiment — RESULTS (2026-11-15 00:29–00:42 UTC; log `recognition/data/eval/gen_exp.log`)
All candidates benched back to back on the same MPS session (val latency comparable). Base + silent1 hashes unchanged.
```
                      base        R silent1   W75         W50         F front1 (ep5/6)
val silent errors/114 84 (73.7%)  48 (42.1%)  52 (45.6%)  64 (56.1%)  40 (35.1%)
  better/worse clips  —           15/3        13/2        11/3        16/2
  exact / top-5       0 / 1       4 / 6       1 / 5       1 / 4       5 / 6
CREMA-D errors/536    33 (6.2%)   54 (10.1%)  49 (9.1%)   38 (7.1%)   58 (10.8%)
  CREMA-D exact /96   79          67          70          75          65
val nonspeech shown   2/3 (fl 2)  2/3 (fl 1)  2/3 (fl 2)  2/3 (fl 2)  2/3 (fl 2)
rest shown dev /36    4 (fl 0)    4 (fl 1)    4 (fl 0)    4 (fl 0)    4 (fl 1)
rest shown val /13    4 (fl 0)    4 (fl 1)    4 (fl 1)    4 (fl 1)    4 (fl 2)
dev silent / voiced   .444/.377   .404/.215   .384/.246   .404/.277   .333/.231
val model ms p50/p95  283/371     260/324     266/322     268/321     262/324
```
Against the pre-registered rules: only W50 meets the CREMA-D guard (38/536 = exactly the +1 pt limit) and every raw-count
condition; after the evidence floor it shows 1 val resting-face segment vs base 0 (strictly a fail by 1/49). W50 keeps
only 20/36 = 56 % of R's validation gain (rule: ≥ 2/3, ≤ 60 errors) → decision rule NOT met. F has the best validation
score but the worst CREMA-D, and its epoch curve (49 → 40 → 54 errors at epochs 4–6) shows ±7-error noise on 20 clips,
so F vs R on validation is not a reliable difference. Interpolation traces a near-linear frontier (W50 → W75 → R:
val 64 → 52 → 48 errors, CREMA-D 38 → 49 → 54): with 101 clips, personal gain and generalisation trade against each
other; neither recipe change escapes it. Nonspeech triggers are unchanged by every candidate (2/3 raw; the base
already fails this). Latency unaffected (same architecture). **Conclusion (per pre-registered rule): the existing 101
clips do not support a better-balanced checkpoint; W50 is the best balanced fallback (val −17.6 pt, CREMA-D +0.9 pt).**
Nothing deployed; overlays only in git-ignored `recognition/data/adapt/{silent1_w50,silent1_w75,front1}`.

## Generalisation experiment on the existing 101 clips — PRE-REGISTERED 2026-11-15 00:30 UTC (before any result)
Goal: keep silent1's personal gain while reducing its CREMA-D regression; no new recording. silent1 (overlay.pt sha
aa2d8de5…) and the base (e740cef3…) are read-only; hashes re-checked at the end. Candidates (no other runs, no search):
- **R** = `silent1` epoch 4 (reference).
- **W50 / W75** = weight-space interpolation of R toward the base, alpha 0.5 / 0.75 (WiSE-FT; `adapt.interpolate`, no
  training). Two alphas only; choosing between them on adaptVal is mild selection optimism (reported).
- **F** = `--scope frontend` (visual front end only, 11.2 M params), otherwise the default recipe/data/seed/epoch selection.
- Multi-speaker replay: NOT run — no suitable data on disk (no LRS3; CREMA-D has only the 12 sentences of the CREMA-D
  regression benchmark, so replaying it would contaminate the very metric being protected).
Metrics (eval.bench, gate included): adaptVal silent WER/exact/top-5 + clips better/worse vs base; CREMA-D WER/exact;
adaptVal nonspeech shown (raw/after floor); rest shown (dev 36 + val 13; raw/after floor); model ms p50/p95.
"Balanced" = ALL of the unchanged E.5 Phase-C conditions: val WER ≤ base − 5 pt; better > worse; CREMA-D WER ≤ base + 1 pt
(≤ 38/536 errors); val nonspeech shown not higher; rest shown not higher; plus p95 latency ≤ +300 ms.
Decision rule: if a balanced candidate keeps ≥ 2/3 of R's validation gain (≤ 60/114 errors), the 101 clips support a
better-balanced checkpoint; if none does, the recommendation is to record more data. No candidate is deployed either way.

## Adaptation arm 1 `silent1` — trained + validated (2026-11-15 00:08–00:25 UTC)
**Audit (read-only, same scripts as adaptA/B):** adaptBretake 8/8 and adaptVal 20 silent + 3 nonspeech (swallow, listen,
smile) all decode 1280x720, 180 frames, 0 gaps; ROI brightness 151–160; FaceMesh 100 %; IOD 150–157 px. Roll spikes
only in clips opening with 3 black frames (retake 05, val 05/12/15). Val clip05 has an 11-frame lip spread inside
"tonight" (articulation, frame strip checked). Nonspeech: swallow = closed lips; listen = one ~0.6 s mouth opening
(breath-like, a harder negative); smile = clear smile 0–1.6 s. PASS, no retakes; originals untouched.
**Data:** dry-run and run = 101 train clips (adaptA 50 + adaptB 43 + retake 8; the 8 named excludes), 101 unique =
adapt_v1_a ∪ adapt_v1_b; val 20 unique = adapt_val_v1; train ∩ val = train ∩ heldout_v2 = val ∩ heldout_v2 = ∅; no
recorded session contains a heldout_v2 sentence (heldout_v2 still unrecorded and unused).
**Run:** `data/adapt/silent1`, git e69f041, scope frontend+embed+block0 (25.8 M / 250.4 M), default recipe, MPS,
00:12:06–00:20:21Z, base sha e740cef3… re-verified, run.json present. Trainer val errors/114 by epoch 0–6:
84, 63, 53, 50, **48**, 52, 57 (train loss 1.12 → 0.66 at ep 4 → 0.51–0.53) → selected epoch 4; overfitting after
epoch 4 (loss falls, val errors rise).
**Bench (gate included; `data/eval/silent1_bench.log`, `data/eval/bench/`):**
```
                         base                adapted (ep 4)       Δ
val silent WER           84/114 = 0.737      48/114 = 0.421       −31.6 pt (clips better/worse 15/3, sign test p≈0.008)
val silent exact         0/20                4/20
val top-1/3/5/10         0/1/1/2             4/5/6/6              (top-5 recall 1/20 → 6/20)
val nonspeech shown      2/3 (floor 2)       2/3 (floor 1)
val abstained            0 (+0)              0 (+0)
CREMA-D WER (96)         33/536 = 0.062      54/536 = 0.101       +3.9 pt  (exact 79 → 67/96)   ← FAILS ≤ +1 pt
dev silent / voiced WER  0.444 / 0.377       0.404 / 0.215
rest shown (floor)       4/36 (0)            4/36 (1)
model ms p50/p95 (val)   283 / 388           303 / 401            (same run conditions; dev/CREMA-D base from 21:13 run)
```
**Decision checklist (E.5, pre-registered):** items 1–2 pass; Phase-C entry FAILS on CREMA-D (+3.9 pt > 1 pt) and,
marginally, rest-after-floor 0 → 1. Status: VALIDATION (val chose the epoch; epochs 2–6 scored 42.1–50.0 % vs 73.7 % base — corrected 00:28 UTC, an earlier
version of this line said "46–50 %").
The verdict: improved on the user's own silent speech, but at the cost of forgetting other speakers (CREMA-D),
so NOT adopted and Phase C NOT run. Production recognizer, server, BlackHole route and notch untouched; no overlay
loaded anywhere. The sidecar on :8790 stayed up (idle) during training/bench.
**Next (user decision):** recommended: record ~150 more adaptation sentences (toward 250) and re-register arm 2 BEFORE
training on them, e.g. same recipe + more data, optionally + rehearsal of public (CREMA-D-like) clips against
forgetting; keep adaptVal as validation and heldout_v2 untouched for one final test. Separate task pending: Codex's
three review races (`docs/DEMO_RUNBOOK_CODEX.md` "Reproduced failures"; repro `docs/demo-review-races-codex.mts`) —
server-side fixes in `server/scripts/review.ts`, `server/src/live.ts`, `server/src/speech.ts`; Codex files untracked.

## adaptBretake audit + final training set (2026-11-15 00:03 UTC, read-only)
`data/webcam/20261115T000100Z-adaptBretake`: 8/8 silent clips = exactly `adapt_v1_b_retake.txt` = the 8 excluded adaptB
sentences. 1280x720, 6.0 s, 180 frames, no gaps; brightness 156–159 (adaptB p50 156); IOD 154–157 px; FaceMesh 100 %;
roll ≤ 1.4° after the warm-up frames. Smile check: longest lip-spread run ≤ 4 frames (adaptA ≤ 5; flagged adaptB
takes 14–28); frame strips show no grins. PASS. Final training set (adaptA 50 + adaptB 43 + retake 8): 101 clips, 101
unique sentences = adapt_v1_a ∪ adapt_v1_b, 0 duplicates; trainer dry-run (val placeholder diag1) plans 101 clips.
Training NOT started (adaptVal not yet recorded). Command: DEMO_READINESS E.5.

## adaptB recording audit (2026-11-14, read-only, finished 23:57 UTC)
`data/webcam/20261114T234421Z-adaptB` (an empty aborted `234406Z-adaptB` is ignored): 51/51 silent clips = exactly
`adapt_v1_b.txt`, 0 overlap with adaptA/val/held-out/diagnostic/dev. All decode 1280x720, 6.0 s, 180 frames, no gaps.
Brightness 149–161 (p50 156 vs adaptA 153), clipping ≤ 0.3 %, light more even (asymmetry p50 35 vs 47); IOD 151–163 px
(p50 156 vs 142 — sat ~10 % closer; the crop warp normalises scale); FaceMesh 100 %. Black-frame openings (3 frames) in
12 clips cause roll spikes only in frames < 10 (≤ 2.6° afterwards). Clips 07/19/44 settle the head in the first ~1.5 s,
then articulate stably. Articulation slower than adaptA (p50 1.5 vs 2.2 words/s), all complete inside the clip.
**Issue: smiles.** Sustained lip spreading (≥ 12 % wider than rest for ≥ 0.4 s): adaptA max 5 frames; adaptB 12 clips
up to 28 frames. Frame strips confirm broad grins (teeth, raised cheeks) outside the sentence in clips 21, 24, 25, 29,
30, 34, 35, 46; 22, 23, 41, 44 ambiguous (could be spread vowels). Smile → text is a known false-trigger mode (D.7), so
those 8 should not be trained under sentence labels. Added (`adapt.finetune --exclude <name>/<clipNN>`, refuses
non-matching excludes, recorded in meta.json) + `prompts/adapt_v1_b_retake.txt` (the 8 sentences). Commands: DEMO_READINESS
E.5. Tests 38/38. Verdict: NEEDS RETAKES (8 clips, ~4 min) — or exclude them (93 training clips).

## adaptA recording audit (2026-11-14, read-only, finished 23:42 UTC)
`data/webcam/20261114T232916Z-adaptA`: 50/50 silent clips = exactly `adapt_v1_a.txt` (0 missing/duplicate/unlisted; 0
overlap with adapt_v1_b, adapt_val_v1, heldout_v2, diagnostic_v1, dev PROMPTS or any other recorded clip). All decode:
1280x720, 6.0 s, 180 frames (clip03: 179, one 67 ms gap), 150 model frames. Mouth-ROI brightness 149–157 (p50 153; diag1
silent re-measured 133–136 with the same code), clipping ≤ 0.2 %, side-light asymmetry 42–54 (diag1 41–44). FaceMesh
100 % of frames in every clip, IOD 139–146 px, jitter ≤ 0.006 IOD. Every clip starts and ends with the mouth closed
(articulation ends ≤ 4.6 s; no truncation). Minor: clips 09/22/36 open with 3 black frames (camera warm-up, before
articulation); clips 08/11/43 low aperture range (0.08–0.10 vs p50 0.21) but articulated. Verdict: READY FOR TRAINING,
no retakes. Keep the same seat/light for adaptB/adaptVal (brightness now ~153). Audit scripts lived in the session
scratchpad (not committed). Two empty aborted dirs (232345Z, 232615Z-adaptA) are ignored by `resolve_session`.

## Hand-off — adaptation pre-run review (2026-11-14 23:20–23:27 UTC)
**While the user records adaptA/adaptB/adaptVal** (adaptA started 23:23 UTC; webcam, MPS, server untouched by Claude).
Independent review of `recognition/adapt/` — recipe sound: scope = frontend+embed+block0 only (others, CTC head,
decoder frozen; grads flow through the frozen decoder); every `_BatchNorm` in eval, dropout on; AdamW over trainable
tensors only (wd 1e-4 negligible at lr 1e-4); loss = (0.1 CTC_sum + 0.9 label-smoothed att_sum)/tokens (espnet
`LabelSmoothingLoss(..., normalize_length=False)` → sum for batch 1, verified in third_party source); validation
decoder = production beam on the same device as bench (MPS). Fixed in `aec4d75` (pushed): overlays from unfinished runs
were loadable (now need run.json); end-of-run base hash came from the mtime cache (now byte re-hash); a tracking
failure burned the run name (crop before mkdir); ROI cache key path-only (now + size/mtime); missing clips silently
dropped (now warned); sessions resolvable by name (`--train adaptA`, `--session adaptVal`). Known, documented: the
trainer's per-epoch val WER has no abstention gate and selects the epoch → optimistic; report bench numbers only.
DEMO_READINESS E.5 now has the commands, report format and a decision checklist (Phase-C entry criterion: val silent
WER ≥ 5 pt better etc. — a PROPOSAL written before results; the user may veto before training). Tests 37/37.
Codex's `docs/demo-preflight-codex.mjs`, `docs/demo-review-races-codex.mts` (untracked) and Sol's files untouched.
**Next:** when the three sessions exist → `adapt.finetune --name silent1 --train adaptA --train adaptB --val adaptVal --dry-run`.

## Hand-off — personal adaptation pipeline (2026-11-14 22:10–22:35 UTC)
**State:** pipeline READY, waiting for the user's recordings (DEMO_READINESS E.5 has the exact commands). Nothing trained
on real adaptation data; production unchanged (no overlay loading in `tacit_vsr`); base weights unchanged
(SHA-256 e740cef3…); notch/BlackHole/server untouched; :8790 still needs the idle restart from the accuracy session.
**Done (pushed):** `705e5ff` prompt partitions A 50 / B 51 / validation 20 (new) + recorder `--resume` + 1.5 s camera
lead-in; `c51b3e1` `recognition/adapt/` — Lipflow/Silent Voice recipe (front end + embed + Conformer block 0, BN frozen,
0.1 CTC + 0.9 attention, crop/flip/gain/time-mask, AdamW 1e-4, 6 epochs), validation-epoch selection + early stop,
hygiene refusals, overlays pinned to the base hash, `eval.bench --overlay`. Tests 36/36. Measured 0.87 s/step on MPS.
**Diag1 review (D.16):** no methodological issue; silent-articulation shift and a speaker/domain gap both supported;
decoding (search) not the failure; endpointing untested by this design.
**Synthetic lip-sync data (user question):** recommendation NO before the demo. Audio-driven lip-sync (Higgsfield-type
tools) renders the generator's average VOICED articulation on the user's face — identity and texture, not the user's
own silent articulation, which is exactly the gap measured (same face, same light: voiced 20% vs silent 57%). SynthVSR
(Liu et al., CVPR 2023) gained from thousands of hours of synthetic data for generic pretraining, not single-speaker
silent personalisation. Higgsfield's API, cost and controls were NOT checked (no account call made); every clip would
need human review for mouth artifacts. If ever tried: a separate arm after real adaptation works, same untouched real
validation/final sets, synthetic never used for evaluation. Real-recording augmentation is already in the recipe.
**Next:** user records adaptA, adaptB, adaptVal (~35 min) → `adapt.finetune --dry-run` then train arm 1 → bench base vs
overlay on adaptVal + CREMA-D → report → only then heldout_v2 once (Phase C) and a default-off selector.

## Hand-off — paired diagnostic (2026-11-14 21:45–22:00 UTC)
**Asked by the user before recording the 60 held-out sentences:** is it silent articulation, capture/preprocessing, or
speaker/model mismatch? **Built (`55be59d`, pushed):** `record_webcam.py --paired` (voiced + silent back to back) and
`eval/paired_diag.py` (capture timing, tracking jitter, ROI illumination, lip features, raw recognition, teacher-forced
reference log-prob, encoder-space DTW, CREMA-D reference, ROI contact sheets), 5 new sentences in
`prompts/diagnostic_v1.txt`. **Preliminary run on the 16 existing pairs (rehearsed prompts, DEMO_READINESS D.15):**
capture timing and tracking fine; lighting is the dominant capture factor; silence is a modest, inconsistent penalty;
the model encodes silent ≈ voiced (15/16 pairs); moderate speaker gap vs CREMA-D even in good light. Fine-tuning cost
probe: 186 ms/step (top 3 blocks) on MPS. **Next:** the user records E.4 (5 pairs, ~6 min) → run `eval.paired_diag`
→ then the recommended top-3-block fine-tuning experiment (E.4) needs `adapt_v1` × 2 sessions + a `heldout_v2`
session. Production recognizer unchanged; no training run started. An empty `data/webcam/20261114T215105Z-heldout1/`
(0-line manifest, no clips) exists — an aborted start, left untouched; it is skipped by the tools.

## Hand-off — accuracy session (2026-11-14 21:05–21:40 UTC)
**Done (pushed):** `e46888b` low-evidence abstention (sidecar abstains decodes with attention log-prob/token < −1.5,
`TACIT_MIN_SHOW_ATT`; words/runner-up/alternatives withheld → never a review candidate); `c93dc50` `recognition/eval/bench.py`
(frozen offline baseline + one-variable A/B, `--compare`, `--union` review coverage, `--session/--tag` for held-out);
`77c77a2` recorder `--prompts/--limit/--nonspeech`, `eval/dataset.py` (inventory, prompts-check, leakage-refusing split),
`prompts/adapt_v1.txt` (101) + `prompts/heldout_v2.txt` (60). Evidence: DEMO_READINESS D.14.
**Results (development data, NOT validation):** baseline reproduced (silent 44/99 = 44.4%, 6/20 exact; voiced 37.7%;
CREMA-D 6.2% with the production gate). 10 test-time variants — tempo ×5, crop zoom ×2, crop shift ×2, per-clip
normalisation, motion trim ×2, AdaBN, tempo ensemble — **none adopted** (all worse on silent or on CREMA-D; AdaBN breaks
this checkpoint even with in-domain statistics). Evidence floor: 0/142 real utterances lost, resting face 4/36 → 0/36.
Review coverage base 8/20 silent; base + tempo-1.1 alternatives 10/20 (post hoc → pre-registered for E.3, not adopted).
Personalisation not attempted: 48 own clips = 13 distinct sentences → no sentence-disjoint split possible.
**Checks:** recognition unittests 26/26; server typecheck clean, `npm test` 115/115; isolated :8799 + sidecar :8768:
`live:check` OK and resting-face replay (D.14). **:8790 NOT restarted** (user clients connected, voice output used at
~21:06 UTC) → it still runs the pre-`e46888b` sidecar; run `./scripts/tacit.sh restart` when idle to activate the floor.
**Next, in order:** (1) restart :8790 when idle; (2) the user's E.3 recording (60 held-out silent sentences + non-speech
controls) → `eval.bench --session … --tag heldout1` — the first independent numbers since D.7; (3) E.2 Meet test;
(4) after ≥ 2 adaptation sessions of `adapt_v1.txt`: fine-tuning experiment on a `eval.dataset split`.
**Release targets (≤ 5% WER, ≥ 90% exact): NOT MET, NOT VALIDATED.** Do not retry: LM fusion, flip TTA, tempo/crop/
normalisation/trim variants, AdaBN, tempo ensembles (D.8, D.12, D.14).
**For Sol (no protocol change):** abstained hypotheses can now carry reason "too little evidence of a sentence
(non-speech movement such as a smile or swallow?)" — show it like other abstentions; an abstention never replaces the
latest shown (reviewable) utterance (unchanged server behaviour).

## Hand-off — reviewed-speech session (2026-11-14 20:50 UTC)
**Done this session (all pushed):** reviewed speech backend + contract (`7853bd8`, `614a261`); phrase-rule-v2 default
(`3a76e6a`); `npm run reviewed:check` (`e0894f3`); eval grouping fix (`665c8c4`); 5-best review candidates after the
first oracle top-K run (`3cb0871`); `npm run review` terminal review client (`605880a`); flip-TTA A/B, rejected
(`e4f668d`). :8790 was restarted twice (both times verified idle: Live off, output off, no app reading BlackHole) and
now runs all of it; Live and output were left OFF.
**Next, in order:** (1) Sol's review-and-Speak UI (web and/or notch) on the contract below — or use `npm run review`;
(2) the user's physical test DEMO_READINESS E.2 (reviewed speech → Meet listener) — the only way to claim remote
audibility of reviewed speech; (3) DEMO_READINESS E (live:test v2 + `--phrases`: first held-out numbers for v2 and
smile/swallow/listening controls); (4) only with ≥ 100 new labelled own silent clips: speaker adaptation experiment.
**Release targets (≤ 5% WER, ≥ 90% exact on ≥ 50 new silent utterances, 0 accepted non-speech): NOT VALIDATED.**
**Later (20:55–21:05 UTC):** `e583589` pre-synthesizes shown review candidates locally while output is on (tests 114/114;
measured on isolated :8790-equivalent instance: press→first audio 5 ms vs 798 ms without; ACTIVE on :8790 since the ~21:12 UTC restart (idle-checked; reviewed:check all PASS again; pick pressed ~5 s after display → request→audio 5 ms) — earlier note: it needed a restart to take effect — NOT restarted because Live was ACTIVE on :8790 at ~20:57 UTC,
someone was using it; at ~21:05 Live + output were PAUSED by that client, still not restarted). server.log at ~21:00
shows another client's `reviewed-recognition rendered` (request→audio 1810 ms) and `user-corrected rendered` (892 ms)
— most likely Sol's notch integration; Claude did not send those. Alternatives/personalisation desk review + `eval/enroll_knn.py` → `docs/research/VSR_ALTERNATIVES.md`.

## Interface contract — reviewed speech (`speak_reviewed`) — for Sol — 2026-11-14 ~20:30 UTC (`7853bd8`, additive)
All in `shared/protocol.ts`. Nothing existing changed meaning; `recognizedSpeechAllowed`/`autoTransmitAllowed` stay
literal `false` (they describe AUTOMATIC speech, which stays disabled). `speak_typed` is unchanged and must NOT be used
for recognised text.
- **`RecognitionHypothesis` (decision `'shown'` only) gains:** `generation` (Live generation it was recognised under),
  `alternatives: string[]` (other N-best decodes, raw), `reviewCandidates: ReviewCandidate[]`, `reviewExpiresAt`
  (server epoch ms; now +120 s). `ReviewCandidate = {kind: 'raw'|'alternative'|'phrase', index, text, textHash}`;
  index 0 = raw; a phrase appears ONLY if `phraseMatch.accepted` and is not already listed; `textHash` = lowercase hex
  SHA-256 of the UTF-8 text. Display these exact strings; do not re-case or edit them in the candidate list.
- **New `ClientMessage`:** `{type:'speak_reviewed', requestId, outputAuthorizationId, outputGeneration, liveAuthorizationId,
  liveGeneration, utteranceId, candidate, index, text, textHash}`.
  - Pick: `candidate` = the candidate's `kind`, `index`/`text`/`textHash` echoed exactly from `reviewCandidates`.
  - Correction: `candidate:'edited'`, `index` = the candidate the edit started from, `text` = the user's text (≤ 500
    chars), `textHash` = SHA-256 of exactly that `text`. Spoken verbatim, labelled `user-corrected` (user-authored —
    show it as "your correction", never as recognition).
  - `outputGeneration` = latest `output_status.generation`; `liveGeneration` = the hypothesis' `generation` (must equal
    current `live_status.generation`). Both REQUIRED.
- **Server refuses** (one `speech_delivery` with `state:'refused'` + reason) when: output not `ready` / paused / stale
  authorization / generation changed; Live not `active` / authorization or generation changed (any Live
  pause/resume/interrupt makes earlier utterances unspeakable — mouth again); utterance is not the LATEST shown one;
  expired; candidate kind/index/text/hash not exactly as shown; utterance already spoken (ONE speech per utterance,
  pick or correction); duplicate `requestId`; virtual mic not ready / queue full (these two do NOT consume the
  utterance — the user may press Speak again).
- **Delivery:** `SpeechDelivery.source` = `'reviewed-recognition'` or `'user-corrected'` (new `SpeechSource` values —
  the companion currently filters `source == "typed"`; extend it), plus `review: {utteranceId, liveAuthorizationId,
  candidate, index}`. States as for typed (queued → synthesizing → routing → rendered | refused | interrupted | failed);
  `rendered` is local only, never "heard". Output pause/stop and Live pause/interrupt/end cut it like any delivery.
- **UI rules (AGENTS.md policy):** no pre-selection, no auto-confirm, no timeout send, never LLM-edited; the Speak
  button needs an explicit press per utterance; hide/disable Speak once a newer shown hypothesis arrives, after expiry,
  or while output/Live is not active. ALL-CAPS model text is put in sentence case for synthesis only (server).
- Verified: server typecheck clean, `npm test` 109/109 at `7853bd8` (now 112/112; 11 new tests: candidates, latest-shown target, every refusal,
  once-per-utterance, route refusal retry, correction path, pause cut, sentence case); web typecheck clean against the
  new types; throwaway server on :8799 (fake recogniser, `TACIT_ROUTE=off`) over a real WebSocket: shown hypothesis
  carried `reviewCandidates`, a tampered text was refused, the genuine pick passed every check and was refused only at
  the (disabled) virtual-mic stage. Later, on the restarted :8790 with REAL recorded silent clips and the real route:
  `npm run reviewed:check` and `npm run review` rendered picks into BlackHole 16ch, all refusals held, stop → interrupted
  in 21 ms (DEMO_READINESS D.13). NOT yet verified: a human listener on the far end (DEMO_READINESS E.2).
- Since `3cb0871` the sidecar decodes 5-best: up to 4 `alternatives`. Since `3a76e6a` `phraseMatch.rule` is
  `'phrase-rule-v2'` and has optional `freeAttPerToken` (v2 rejects < −1.5 with reason "too little evidence of a sentence").
- Terminal fallback UI (backend-owned): `cd server && npm run review` — numbers speak candidates, `e N` edits, o/p/r/s.
  Pure message builder for clients to mirror: `server/src/reviewed.ts` `buildReviewedRequest`.

**Phrase-rule-v2: IMPLEMENTED** (`3a76e6a`, D.9: dev re-run reproduces the analysis exactly; NOT validated). Next for
false triggers: a pre-decode speech-likeness check once smile/nod/listening recordings exist (live:test v2 has them).
**Not to do:** LM fusion (D.8); flip TTA (D.12); tuning on the v1 held-out sentences or on dev data then calling it
held-out; enabling automatic speech; any LLM rewriting of recognised words.

## Verified status (2026-11-14 20:50 UTC)
| Item | Status |
|---|---|
| Google Meet remote audibility | **VERIFIED (human-observed):** BlackHole 16ch as Meet mic; the user's iPhone heard TACIT |
| FaceTime remote audibility | NOT YET TESTED |
| Typed synthesized speech | VERIFIED through a real call (Google Meet) |
| Silent recognition, held-out live v1 (frozen baseline) | **44% WER (11/25), 2/5 exact**, front-lit 127–130, end→shown p50 1385 ms; smile → wrong phrase accept; repeat ×3 → 1 window; pause 0 (D.7) |
| LM-assisted decoding | Rejected on dev data (worse everywhere, hallucinations, ~2× decode) (D.8) |
| Oracle top-K | Run on dev: reference in top-1/3/5/10 — own silent 6/7/8/10 of 20; CREMA-D 80/85/92/93 of 96 (D.10) |
| Phrase rule | v2 default (`3a76e6a`); dev: rest 4→0, tails 10→3, heads 2→1, in-list 37 kept; NOT validated (D.9) |
| Flip TTA | Rejected (D.12) |
| Reviewed mouth-to-call | Backend done; local route verified with real recorded silent clips (D.13); UI (Sol) + human Meet listener pending |
| Automatic recognised-speech transmission | STILL DISABLED. NO-GO open vocabulary and phrase mode |
| Offline benchmark / test-time variants | `eval/bench.py`; 10 variants, none adopted (D.14) |
| Low-evidence abstention | `e46888b`; dev resting face 4/36 → 0/36, 0/142 utterances lost; smiles unmeasured; :8790 needs restart (D.14) |

## Restartable checkpoint (state at hand-off, 20:50 UTC)
- `main` pushed through the docs commit after `e4f668d`. Checks: server typecheck clean, `npm test` **112/112**;
  recognition unittests **15/15**; web typecheck clean (read-only check, Sol's files untouched). Running :8790 = current
  code; Live off, output off. No background jobs. Sol's uncommitted files (`docs/WORKSTREAM_SOL.md`,
  `macos/TacitCompanion/**` incl. new `ReviewedTextView.swift` etc.) are untouched and unstaged — Sol is mid-edit.
- New git-ignored artefacts this session: `recognition/data/eval/{phrase_rule_probe_v2,oracle_topk,tta_ab}.jsonl`,
  `recognition/data/eval_{phrase_v2,oracle_topk,tta_ab}.log` (private transcripts); `server/data/run/{driver,stop}.mts`
  (scratch test drivers, ignored).
- Licensing: the user stated (2026-11-14 ~20:40 UTC) they hold written permission from all authors to reuse code; no
  external code was copied this session anyway. Keep attributions/notices regardless.
- Previous session's commits: `4dda303` feat(server) per-window `win_*` diagnostics in hypothesis `stages`
  (+test); `24c2baf` feat(server) `live:test` v2 (fresh set, `--set v1` kept, 22 s repeat, 12–20 s non-speech incl.
  listening, arrival times, `--phrases`); `fd3c8d3` feat(recognition) `eval/lm_ab.py`, `eval/phrase_rule_probe.py`,
  `eval/oracle_topk.py`; then the docs commit (AGENTS.md policy, this file, DEMO_READINESS).
- Checks at hand-off: server typecheck clean, `npm test` **98/98**; recognition unittests 7/7; eval scripts compile.
  `live:test` v2 typechecked only (not run — it would pause an active Live session). Web untouched.
- Running server (`./scripts/tacit.sh start`, :8790 + sidecar :8765) was NOT restarted: it still runs the pre-`4dda303`
  code, so `win_*` keys appear only after `./scripts/tacit.sh restart`. No background jobs left running.
- New git-ignored artefacts: `third_party/visual/weights/lm_en_subword/` (215 MB LM, pinned rev f4e39b6d…, research-only
  terms); results with private transcripts in `recognition/data/eval/{lm_ab,phrase_rule_probe}.jsonl` and
  `recognition/data/eval_*.log`. The v1 live log: `recognition/data/live/2026-11-14T19-58-01-573Z-livetest.jsonl`.
- External code: SilentFlow fast beam already vendored (MIT notice in `tacit_vsr/fast_beam.py`). Lipflow / SilentFlow
  LM loading pattern followed (no code copied). Hushkey, Personalized-Lip-Reading, VALLR, VSP-LLM, phoneme-to-words-lm:
  not inspected this session. No LLM correction anywhere.
- Decoder still fast beam 10, CTC 0.1, no LM (top-1 unchanged); N-best 3 → 5 (`3cb0871`); gate thresholds and phrase list
  unchanged; phrase rule v1 → v2 default (`3a76e6a`, v1 selectable).

## Sol coordination / ownership (updated 2026-11-14 ~20:25 UTC)
- **Companion ownership TRANSFERRED to Sol by the user's explicit authorization (2026-11-14 ~20:25 UTC).** Steps per
  AGENTS.md → Git: Claude's Git operations were finished (`541611d` pushed); working tree inspected: clean except Sol's
  uncommitted `docs/WORKSTREAM_SOL.md` notes (+44 lines, preserved, not staged); `git status macos/` empty — no native
  companion edits in progress by anyone; Sol had edited no native sources.
- **Sol owns:** `macos/TacitCompanion/**`, `web/**`, `docs/WORKSTREAM_SOL.md`. **Sol may begin editing
  `macos/TacitCompanion/**` now.**
- **Claude owns:** `macos/TacitRoute/**`, `server/**`, `recognition/**`, `shared/**`, `scripts/**`, the rest of the
  AGENTS.md table, and ALL Git-write authority. Claude does not edit companion files while Sol implements the notch.
- **Sol does not commit or push.** Claude commits Sol's files only at a checkpoint Sol records as stable.
- Backend/shared interface changes are Claude's; Claude announces them in "Interface contract" below before Sol
  depends on them. Next announcement: the `speak_reviewed` contract (NOT started; the user deferred it to a new
  session — see Hand-off priority 1).
- Root `THIRD_PARTY_NOTICES.md` stays Claude-owned: Sol keeps companion-local notices for any MIT adaptation and asks
  Claude to add root entries.
- Sol's open companion notes (to fix after transfer): paused results accepted, nil-authorization equality, stale
  delivery generations, URL in error text; request for an additive per-utterance generation / session boundary on
  hypotheses — considered in the `speak_reviewed` contract.
- Frontend requests still open: show `phraseMatch` (display-only; v1 can be wrong on non-speech) and the brightness hint
  (`gate.mouth_brightness` < 90); the reviewed-speech review UI once the contract is published.

## Requests for Sol (frontend)
1. Send `outputGeneration: output_status.generation` with every `speak_typed` (additive, `d974748`): the server then
   refuses a message written before a pause/interrupt instead of speaking it later. The companion already does.
2. Live is now ended by the server when the socket that sent `activate` closes; other clients (companion) can only
   pause/resume/end. UI clients that miss a 10 s WebSocket ping are terminated (browsers answer pings automatically).
3. `speech_delivery` may now end `failed` with reason "audio rendered as silence".
4. NEW optional `RecognitionHypothesis.phraseMatch` (`800a9ea`): show "Phrase list match: … (display only)" or its
   rejection reason; never feed it to speech. `gate.mouth_brightness` < 90 → "too dark, light from the front" hint.
   End→shown latency = `stages.endpoint_wait + stages.upload + recognitionMs`. Consider `preRollMs` 160 → 400.
6. **Reviewed speech UI** on "Interface contract — reviewed speech" (top of this file). Do not reuse `speak_typed`;
   label `user-corrected` deliveries as the user's correction. Extend the companion's `source == "typed"` delivery filter.
5. NEW additive keys in `RecognitionHypothesis.stages` (`4dda303`, no type change): `win_start`, `win_end` (browser
   clock ms, from your header), `win_ms`, `win_frames`, `win_max_gap` — segmentation diagnostics; do not sum them into latency.

## Repository
- `https://github.com/tanushsavadi/tacit` — PRIVATE, branch `main`. Git owner: **Claude** (AGENTS.md → Git).
- CI: `.github/workflows/ci.yml` — server typecheck+tests, web typecheck+tests+build (no secrets, no devices, no models).
- Not in Git by design: `.env`/secrets, `*/data/` (faces, motion, logs), weights/models, `third_party/`, `web/evidence/`,
  `web/artifacts/`, builds. Recognition has no CI job (needs the 1 GB Auto-AVSR checkpoint).

## Visual speech recognition (Mode 2) — evidence so far
- Model: Auto-AVSR visual-only conformer `LRS3_V_WER19.1` (mpc001 weights, research/non-commercial licence; code Apache-2.0)
  via `recognition/tacit_vsr` (MediaPipe FaceMesh mouth ROI → encoder → beam search, unigram5000). Audio is never read.
  Hushkey / SilentFlow not evaluated: this checkpoint was already local and working.
- **Offline, real video, open vocabulary:** 24 CREMA-D clips (12 sentences × 2 unseen speakers, frontal studio, VOICED
  speech): WER 3/134 = 2.2%, 22/24 sentences exact (errors: "TO MORROW", "SLICK"→"SELECTED"). Caveat: voiced actors,
  short common sentences — says nothing yet about silent articulation or webcam conditions.
- Latency (M3 Pro, ~2.3 s clips): CPU total median 839 ms (landmarks+crop 123, encoder 348, beam 330). MPS needs
  `PYTORCH_ENABLE_MPS_FALLBACK=1` (max_pool3d missing on MPS); encoder 191 ms vs 455 ms CPU, identical outputs.
- Gate features emitted per utterance (att/ctc log-prob per token, n-best margin, runner-up, frames/token): on the one
  error vs a correct clip, att −0.31 vs −0.11, margin 0.07 vs 0.37 — promising, not yet calibrated.
- **First webcam session `s1` (2026-11-14, partial 12 clips, backlit):** silent 13/20 = 65% WER (0/4 exact), voiced
  21/36 = 58% (2/8 exact), no-face 0, 555 ms per 5.5 s clip on MPS. Voiced ≈ silent ⇒ capture domain dominates.
  Mouth-ROI brightness 40–47 (CREMA-D 134–164); inter-ocular 88–89 px (CREMA-D 39–64). Variants (trim, contrast,
  gamma, CLAHE, BlazeFace, downscale) gave no consistent gain. Diagnostic scripts were throwaway (not committed).
- **Next (needs the user):** front-lit re-record (`record_webcam.py --check`, then `--name s2`), then `eval_session`.

## AirPods deliberate articulation w3 → w4: NO-GO (pre-registered; details in docs/research/AIRPODS_SILENT_SPEECH.md)
- w4 held-out primary 26% (13/50, p=0.19 vs 20%); strongest baseline rhythm-ROCKET 42%; frozen threshold accepted 1/50
  words, 2/20 control false accepts. Bud changed L (w3) → R (w4). Within-session w3 73% did not generalize.
- Earbud diagnosis: both buds share a head-aligned frame (no axis mirroring), but articulation motion is
  mirror-symmetric between buds (all L→R template correlations negative on ry/rz). Exploratory same-bud pairs: R→R 70%
  (vs rhythm 42%), L→L 52% — hypothesis only. Recorder now has `--require-bud` + `budcheck`; held-out refuses cross-bud.
- Exploratory re-analysis (`airpods/analysis/explore_existing.py`): mirror-normalised ROCKET pooled across sessions 48%
  vs rhythm 37% (McNemar p=0.002, ~20 cells examined); LIMU-BERT ≈ chance; unseen-word transfer ≈ chance.
- User asked NOT to record w5/w6 yet. If recording resumes, the specific test is a pre-registered mirror+pooling model
  (frozen on existing sessions) evaluated once on a new held-out session — see research doc.

## AirPods: hardware audit + fusion plan (w3/w4 untouched: recorder, probe binary, features and heldout script unchanged)
- Inventory table: `docs/research/AIRPODS_SILENT_SPEECH.md`. Usable = one fused ~50 Hz motion stream (accel, rotation,
  attitude, gravity, which-bud tag). Not exposed on macOS: voice accelerometer, inward mic, simultaneous L+R motion,
  iOS-26 high-quality AirPods recording.
- Most promising next experiment: **camera + AirPods fusion**, first for articulation onset/offset (Live endpointing),
  then held-out word recognition ablation camera-only vs AirPods-only vs fused on identical test trials.
- `recognition/record_sync.py --name f1` records continuous webcam (video only, ffmpeg `-copyts`) + AirPods motion
  (same unchanged TacitAirPods.app) + cue labels, all on mach host time (`time.monotonic`, CMDeviceMotion.timestamp,
  AVFoundation pts). Per-session verification: motion arrival offset/drift, first-pts delta, and 3 sync nods
  cross-correlated by `python -m tacit_vsr.sync_check <dir>` (validated: planted +80 ms recovered, r=0.97).
- Needs NEW data (f1 train / f2 held-out after re-seating); w1–w4 are never reused for new methods.
- Live product sync (later, with Sol): browser frames carry `performance.timeOrigin + performance.now()`; the server
  estimates browser↔server offset by WS ping/pong (min-RTT) and maps AirPods host time via the probe's arrival offset.

## Apple Watch value test (time-boxed; not a product direction) — INCONCLUSIVE, awaiting one device measurement
- Findings + decision rule: `docs/research/WATCH_FEASIBILITY.md`. Normal-wrist position: no articulation mechanism.
  Near-mouth: only Lipwatch-style active echo, which needs ≥44.1 kHz input — watchOS does not let apps request a rate.
- Probe `watch/` builds (device + simulator SDKs, unsigned). Deploy blocked on user: Xcode Apple ID/team, iPhone
  connected + Developer Mode on iPhone and Watch. No ultrasonic emission without a separate reviewed plan.

## Interface contract — Live + voice output (for Sol; all in shared/protocol.ts, all additive) — 2026-11-14 ~10:45 UTC
Server :8790 restarted with this code (`./scripts/tacit.sh restart`). Auth unchanged: user WS `/ws?token=`.

**1. Live Silent Speech `tacit-live-v1` (unchanged wire format; ONE server-wide session since b0ba703)**
- Capability: `snapshot.services.recognition.live` when the VSR sidecar is healthy (reported as soon as it listens).
- C→S `live_control {action:'activate'|'pause'|'resume'|'interrupt'|'end', mode?, inputSource?:'camera'}`. `mode:'automatic'`
  is refused (live_status.reason). No caller/session needed for display-only.
- S→C `live_status {status}` on connect and after EVERY control from ANY client (the companion can pause your session).
  Detect your control's effect by a generation/state transition, never by "the next live_status".
- Per utterance: `visual_utterance {utteranceId, authorizationId, startMs, endMs, endpointMs, frameTimesMs[]}` then exactly
  frameTimesMs.length binary JPEG messages on the SAME socket (frames are matched per socket).
- S→C `recognition_hypothesis` exactly once per header, incl. rejects: `decision 'shown'|'abstained'`, `reason`, `rawText`
  (raw model output), `uncertainty {calibrated:false}`, `recognitionMs`, `stages`, `transmitted:false`, `stable:false`.
  Abstain reasons now include: duplicate utteranceId (per authorization), incomplete (new header / control / sender
  disconnect before all frames), "Recogniser busy" (>2 in flight per server — dropped, NOT queued), stale authorization,
  Live paused/off, frame-order/count/size/duration limits (300 frames, 12 MB, 10 s), no face tracked.
- Pausing/interrupting/ending Live also interrupts any speech output in progress. Last user client disconnect ends Live
  and stops voice output.

**2. Voice output into the virtual microphone (NEW)**
- `snapshot.services.voiceRoute: VoiceRouteStatus` and in every `output_status.status.route`: `state` 'unconfigured' |
  'starting' | 'ready' | 'unavailable' | 'error', deviceName/Uid, sampleRate, gainDb, calibrated, `readers` (bundle ids of
  apps currently reading the virtual mic — e.g. 'com.apple.FaceTime'; null = unknown; refreshed every 15 s), warnings
  (echo risk, muted), reason. `readers` non-empty is the only local evidence that a call app selected the mic.
- C→S `output_control {action:'enable'|'pause'|'resume'|'stop'}` → S→C `output_status {status: SpeechOutputStatus}`
  (`authorizationId` fresh on enable, `generation`, `state 'off'|'ready'|'paused'`, `voice` label, `queued`,
  `recognizedSpeechAllowed:false`). output_status is also unsolicited on queue/route changes.
- C→S `speak_typed {requestId, outputAuthorizationId, text}` — ONLY for text the user typed (AAC fallback), sent by an
  explicit action. ≤500 chars, unique requestId, needs state 'ready' + matching authorization + route ready; max 4 pending.
- S→C `speech_delivery {delivery}` for each state change: queued → synthesizing → routing (again with
  `timings.firstAudioAt` when audio starts) → exactly one terminal state: rendered | refused | interrupted | failed.
  Carries `outputAuthorizationId` + `generation` (added for Sol's correlation request), `source:'typed'|'recognized'`,
  `voice`, `reason`, `timings {requestedAt, synthStartAt, synthEndAt, firstAudioAt, renderedAt, endedAt}` (server ms).
  **`rendered` = written into the virtual mic on this Mac. `remoteAudibility` is always 'unknown'.** UI must not say
  "sent"/"heard" — say "spoken into <device>".
- Recognised words are never spoken (Live refuses automatic; ReliabilityGate = UNVALIDATED). UI must not copy model text
  into speak_typed (Sol already committed to this).

**3. What Sol may show:** Listening (Live active) · Recognising (utterance sent, awaiting hypothesis) · raw text "shown"
(display only, uncalibrated) · Speaking (delivery has firstAudioAt) · Paused · route state/device/readers/warnings ·
measured timings from the messages. Not: remote delivery, confidence %, "recognised speech sent".

**4. Integration tests that should pass:** server `npm test` (91), `npm run live:check`, `npm run speech:check`
(both against :8790); Sol: web typecheck/test/build + its live-recognition browser test against :8790.

## AirPods silent speech — CONCLUDED: NO-GO for word recognition (details: docs/research/AIRPODS_SILENT_SPEECH.md)
- Gate 1 (deliberate jaw opening) detectable; Gate 2 five words, strict w1-tuned → w2 held-out: with the w1-chosen
  abstention threshold 0/50 accepted (0 incorrect accepts); forced choice 34% vs 20% chance (p=0.014) but equal to the
  rhythm-only baseline (34%) → timing cue, not articulation-specific. Only exaggerated trials carry signal.
- Preserved, not integrated: `airpods/` (TacitAirPods.app probe), `server/src/airpods/motion.ts` (+tests),
  `server/scripts/airpods-{record,analyze,gate2}.ts`, data + frozen config + report in `airpods/data/`.
- Mode 2 sensing continues with webcam visual speech recognition (see Next actions).
- **Reopened by the user (2026-11-14 ~08:15 UTC): one controlled follow-up, deliberate articulation, sessions w3 → w4.**
  Pre-registered pipeline `npm run airpods:heldout -- prereg <w3> --compare <w1>` then `evaluate <w3> <w4>`:
  candidates DTW 1-NN (Subvox templates) and ROCKET + ridge (Dempster 2020, `server/src/airpods/rocket.ts`) ×
  {cue, trim} × {rot, att, acc+rot, all}, selected by w3 exact LOO; abstention threshold by w3 utility; baselines
  rhythm-DTW, rhythm-ROCKET, duration, energy, timing bundle (duration + mean/peak energy + syllable-like peak count).
  Criteria are written into the frozen config; `evaluate` refuses configs not hashed to w3 or created after w4.
  Validated on synthetic data: noise → NO-GO, rhythm-only words → INCONCLUSIVE, axis-specific words → GO. (Fixed a LOO
  leak found by the null test: intercept used the held-out label → now exact refit LOO.) w2 is not used for selection.
  Status: waiting for the user's w3/w4 recordings. Webcam VSR must not wait on this.

## Ready for physical integration
- **Browser caller ↔ TACIT user** (Sol's pages): auth, caller mic PCM → server Whisper, Gemini replies, confirm,
  system-voice audio to the caller device, playback ack. Backend side verified by scripts + 61 unit tests; Sol verified
  a fake-mic Chrome run. **Pending: a human speaking and a human confirming audibility.**
- **Twilio PSTN:** code paths, auth and failure handling verified with a protocol simulator and unit tests. **Pending:**
  `TWILIO_AUTH_TOKEN`, a Twilio number, and the user's explicit go-ahead for a public tunnel (`npm run twilio:preflight`).
- **ElevenLabs personal voice:** implemented and tested against a local mock only. **Pending:** real key + voice ID + consent flag.

## Voice authorization (this pass)
- **Audit:** the cloned voice was NOT pre-generated by default (off for personal voices), but an operator env var
  (`TTS_PRESYNTH=on`) could enable it without user consent, and ElevenLabs failures auto-substituted the system voice.
- **Now (`VoiceRouter`, server/src/tts.ts):** user session policy via `set_voice_policy` → `services.voicePolicy`.
  Defaults: `personalPresynth=false` (personal-voice audio only synthesized after confirmation; env cannot opt the user
  in), `allowSystemFallback=false` (personal voice failing/unavailable → reply refused, "Nothing was sent"). Approved
  substitution is labelled `… — SUBSTITUTED for your personal voice (approved fallback; …)` in caller metadata and
  `speech.voice`. A failed startup voice check marks the personal voice unavailable instead of silently swapping.
  Local system-voice pre-synthesis stays on (never leaves the machine; nothing sent before confirmation); `TTS_PRESYNTH=off` disables.
- **Live proof** (`npm run voice:policy-check` on a 2nd instance with an unreachable personal voice): confirmed reply →
  ERROR + notice, **0 audio frames** to the caller; after user approval → sent, labelled SUBSTITUTED.
- Remote playback still requires the controller's explicit confirmation in every path (unchanged).

## Verified this session (fresh runs)
- After the voice-policy change (05:00): 64/64 tests; security 13/13; `smoke` text OK; `smoke --audio --choose-ms 2000`
  → transcription 803–824, generation 1080–2145, postConfirm 0 → systemMs 1904–2948; fast confirm (no choosing
  delay) postConfirm 589; `twilio:sim` OK (whisper exact, ack=twilio-mark simulated); `twilio:preflight` 2 TODO
  (auth token, tunnel); turn log unchanged (4 lines, logging off); Vite now returns 403 for `server/data/secrets.json`,
  `server/.env`, server source (status-only check), 200 for `shared/protocol.ts`.
- `npm run typecheck` clean; `npm test` → **61/61** (controller 26, Twilio transport 8, browser transport 5, TTS/ElevenLabs
  mock 6, auth/log/metrics/fallback 11, segmenter/signature 5).
- `npm run security:check` → 13/13 PASS on the live server (auth unchanged and intact; logging still opt-in, default off).
- Live end-to-end with real Gemini: `smoke` (text), `smoke -- --audio` (PCM → whisper-server), `twilio:sim` — all OK.
- **Failure recovery (live):** forced Gemini timeout (`GEMINI_TIMEOUT_MS=1`) → options labelled
  `local-rules (no LLM) — Gemini unavailable: timeout`, turn completed. Killed whisper-server mid-session → next turn
  transcribed via whisper-cli fallback (1781 ms), supervisor relaunched whisper-server in ~1 s, next turn 827 ms.
- **Failure recovery (unit):** STT error → caller state back to LISTENING; transcriptions serialized in order; duplicate
  utterance ids ignored (scoped to the current call); disconnect mid-reply ends once, later speech refused; caller
  device playback failure reported as `sent`, never `played`; cancel during Twilio playback sends `clear`; unauthorized
  Twilio stream audio ignored; abandoned proposals expire (existing); stale/early confirmations rejected (existing);
  TTS failure → error state, nothing sent (existing) or labelled system-voice fallback when personal voice fails.

## Latency work (only changes backed by measurements)
Baseline last session (`smoke --audio`, scripted): transcription 1817, generation 1610, synthesis 871 → ~4.3 s.
| Change | Evidence | Result |
|---|---|---|
| Persistent `whisper-server` (supervised, falls back to whisper-cli) | `npm run bench:stt`, 96 real CREMA-D clips | p50 **80–90 ms** vs 388 ms per whisper-cli call; WER 1.7% (16 kHz) / 4.8% (8 kHz μ-law phone path) |
| Pre-synthesize the 3 displayed options (nothing sent before confirm) | A/B, `smoke --audio --choose-ms 2000` | confirmation→first audio **0–1 ms** (on) vs 938–1060 ms (off) when the user takes ≥2 s to choose |
| Noise floor 350→150 RMS + rolling 10th-percentile noise tracking | bench endpointing sweep | missed utterances **1/96** (was 14/96); 0 triggers on 3 s white noise up to RMS 400 |
| Segment durations from audio time, not wall clock | unit test reproduced drops on bursty delivery | bursty Twilio/WS delivery no longer drops speech |

Measured after: transcription ~815–850 ms (700 ms endpoint hangover + ~100 ms STT), generation 1.1–1.8 s (Gemini),
postConfirm 0–1 ms → **systemMs 2.0–2.5 s** with ≥2 s choosing time (scripted selection, not a human).
Not changed (insufficient evidence): 700 ms hangover — 500 ms showed 0 false splits, but CREMA-D clips are single short
sentences without mid-sentence pauses. Configurable via `STT_HANGOVER_MS`. Remaining largest stage: Gemini generation.
Pre-synthesis caveat: if the user confirms within ~1.5 s, three parallel `say` jobs are still running (observed
postConfirm 742–1175 ms in that case). Default on for the system voice, off for ElevenLabs (cost) unless `TTS_PRESYNTH=on`.

## Interface contract (backend ⇄ frontend) — `shared/protocol.ts`, `shared/metrics.ts`
Unchanged from last session (auth `?token=`/`?invite=`, `session_info`, logging consent, `audio_start` PCM, playback acks).
**New, all additive:**
- `ClientMessage mouth_gesture_select {candidateSetId, index, method, window?, framesUsed?}` → controller
  `gestureSelect` → proposal `source:'mouth'` with `Proposal.method` (e.g. `neutral-calibrated-mouth-gestures-v1`);
  same confirm guard/expiry/stale checks; rejected while speaking; confirmation still separate. Turn record gets
  `selectionMethod`. This is a gesture mapping, not lip-reading — UI should show `method`.
- `SpeechStatus.voice?` — the voice that actually spoke (set when the reply completes; names any fallback, e.g.
  `macos-say … — FALLBACK, personal voice failed: …`). Caller `audio` messages already carry the same value.
- `turnStages()`: new `postConfirmMs` (confirmation → first audio sent). **`systemMs` now = transcription + generation +
  postConfirm** (previously added synthesis + send; with pre-synthesis, synthesis overlaps the user's choosing time).
- `ClientMessage set_voice_policy {allowSystemFallback?, personalPresynth?}` and `ServiceStatus.voicePolicy:
  VoicePolicyStatus` (personalConfigured/Available, personalVoice, personalError, systemVoice, both choices,
  presynthActive). **Frontend request:** show the active voice and these two explicit toggles; show `personalError`.
- Note: `selectionMs` can be negative when a proposal arrives before the UI reported `candidates_displayed`.

### Backend responses to `docs/WORKSTREAM_SOL.md` requests
- `mouth_gesture_select`: **implemented as proposed** (+ tests). Sol may now drop the intermediate review tap.
- Actual voice label on `Snapshot.speech`: **implemented** as `speech.voice`.
- Caller PCM path: Sol's AudioWorklet 16 kHz mono PCM16 matches the backend contract (Sol's `test:microphone` run).

## Known blockers / open issues
- **Rotate access tokens once** (see `docs/DEMO_CHECKLIST.md` §0): Sol found the old Vite `fs.allow: ['..']` served
  `server/data/secrets.json` to the network-reachable dev server (status 200 observed; content not read). Fixed in
  `web/vite.config.ts`; rotation not done by Claude to avoid breaking the live human-test pages — user decides.
- No Twilio credentials/number; no ElevenLabs key. Tunnel not opened (needs user authorization).
- 1 unexplained text-smoke timeout seen last session (not reproduced in 12+ runs since; steps are labelled).
- `server/data/turns.jsonl`: 4 pre-consent test turns (left untouched; 7-day retention or `delete_turn_logs`).
- Gemini `3.8-flash` was overloaded/timing out when tested; default chain avoids it.

## Commands
```
cd server && npm run typecheck && npm test
cd server && npm start                    # :8790, spawns + supervises whisper-server on 127.0.0.1:8766
cd server && npm run links                # private user + caller URLs
cd server && npm run security:check       # live auth checks
cd server && npm run smoke [-- --audio "sentence"] [--choose-ms 2000]
cd server && npm run twilio:sim           # Twilio protocol simulator (NOT a real call; mark echo is simulated)
cd server && npm run twilio:preflight     # real-call readiness (read-only, no tunnel)
cd server && npm run bench:stt [-- --limit 96 --cli --endpoint-only]
cd server && npm run gemini:probe         # GEMINI_MODELS=a,b to compare
cd server && npm run voice:check          # real ElevenLabs check (needs key + voice ID)
cd server && npm run voice:policy-check   # live: no unapproved voice substitution (point TACIT_URL at an instance)
```

## Demo
`docs/DEMO_CHECKLIST.md` — separate pass criteria for A browser audio, B webcam selection, C personal voice, D phone.

## Exact missing steps
- **ElevenLabs:** in `server/.env` set `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (the user's own cloned voice),
  `ELEVENLABS_VOICE_CONSENT=self`; run `npm run voice:check` (must report category `cloned`/`professional`); restart.
  Server refuses to present a premade/library voice or a failed check as personal (falls back to the labelled system voice).
- **Twilio:** set `TWILIO_AUTH_TOKEN`; user authorizes → `npm run tunnel` → `PUBLIC_URL=<https url>` → restart →
  `npm run twilio:preflight` all OK → number's Voice webhook POST `<PUBLIC_URL>/twilio/voice` → call it; success only
  when the human caller hears the reply.

## Next actions (backend)
0. **Mode 2 webcam VSR (parallel, needs user's ownership decision for `recognition/`):** proposed split — Sol: webcam
   capture + mouth-ROI/frames in `web/`; Claude: verify `recognition/` Auto-AVSR offline on real clips, then a backend
   recognition endpoint + additive `RecognitionResult` contract (announced here first). Recognized text still goes
   through explicit confirmation before playback. No AirPods work unless the user reopens it.
1. Support the human browser test with Sol (watch server log; collect `turnStages` per turn with logging opt-in if the user agrees).
2. Real Twilio call once authorized. 3. If keys arrive: `voice:check`, then repeat smoke/twilio:sim with the personal voice.

## Git
AGENTS.md → Git. Claude is the sole writer; Sol's `web/` is committed at Sol's recorded checkpoints.
