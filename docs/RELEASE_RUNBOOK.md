# TACIT — release gate and demo runbook (2026-11-15 ~01:00 UTC)

Integration owner: Claude (Git owner). Evidence below was produced on this Mac in this session against the running
runtime unless marked otherwise. **PASS = the stated scope only.** Nothing here proves that a remote Google Meet
participant heard anything — only a human listener can confirm that.

ML workstream frozen: production recognizer = unmodified pretrained Auto-AVSR `LRS3_V_WER19.1` (weights sha256
`e740cef3…`, matches the recorded base); no adaptation overlay is loaded (`tacit_vsr/` has no overlay loader; no
`TACIT_*` env overrides). Personal overlays/recordings untouched in git-ignored `recognition/data/`. No training, no
heldout_v2, no new recordings.

## Integrated in this release (on `main`)

| Commit | Change |
|---|---|
| `d51d51a` | Sol's native notch + explicit reviewed speech (yielded 21:09 UTC, files unchanged since) |
| `d3fa006` | Codex's review-race fix, cherry-picked from `fix/review-races` (`c2ae556`) after review |
| `fc7027c` | Restores synthesis-only sentence casing of ALL-CAPS model candidates (words unchanged; corrections byte-exact) |
| `b5991bc` | Notch: choices bound to the utterance they were rendered for; honours `review_invalidated` |
| `4927244` | `live:stress` burst assertion aligned with the latest-accepted-header contract |
| `a091ff3` | `reviewed:check`: live-server correction + invalidation checks; rerunnable request IDs |

Races (original diagnostic `docs/demo-review-races-codex.mts`): all 3 REPRODUCED on main before integration; after,
races 1–2 NOT REPRODUCED; race 3 is covered by `server/src/review-races.test.ts` (drives the real terminal script —
the old diagnostic uses the removed bare `e 1` syntax and now crashes by design; it is kept untracked as history).

## Integration matrix (fresh, 2026-11-15 00:49–01:00 UTC)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| A | App launches, connects to backend | **PASS** | `tacit.sh restart` → recognizer ready; companion launched via node launcher, connected; reconnected by itself after a server stop/start |
| B | Silent sentence → result in notch | **PASS (recorded input)** / **PHYSICAL PENDING** | `reviewed:check` real silent clip → shown + 5 candidates; `ui:check` production browser pipeline 2/2 shown. Live camera + notch display not exercised by a human this session |
| C | Pick alternative / edit candidate | **PASS (unit + server)** | Swift 18/18 incl. delayed-closure + invalidation tests; `reviewed:check` correction → `user-corrected`, exact text |
| D | Explicit approve + Speak | **PASS** | `reviewed:check`: pick → rendered; duplicate Speak refused; 6 tamper/stale refusals |
| E | Exact text → TTS → BlackHole 16ch | **PASS (local)** | rendered at BlackHole 16ch, readers `[]`; press→first audio 887–1219 ms (macOS `say`, labelled system voice) |
| F | Next utterance immediately after | **PASS** | newer header → `review_invalidated`, old pick refused; `live:stress` 3–8 sequential shown, burst bounded |
| G | Pause/Stop/stale/errors/disconnect fail safe | **PASS (local)** | Stop during reviewed speech → interrupted 21 ms; pause mid-recognition dropped; recognizer killed → abstains, supervised restart 8 s; stale auth/duplicate/out-of-order refused; `speech:check` pause → interrupted, last sound 19 ms after pause |
| H | Typed/corrected text when recognition is wrong | **PASS (local)** | `speech:check` 3/3 rendered; `ui:check` B typed via UI → sound at BlackHole; correction path in C |
| I | Recognition never auto-speaks | **PASS** | every hypothesis `transmitted=false`; `autoTransmitAllowed=false`; preflight: automatic speaking DISABLED |
| — | Remote Meet listener hears reviewed/corrected words | **NOT VERIFIED** | requires a human (below) |

Static/unit gate on `a091ff3`: server tsc 0 + **140/140**; web tsc 0 + **80/80** + build; companion Swift **18/18**;
TacitRoute Swift **4/4**; recognition unittest **40/40**; `security:check` all pass; Codex preflight helper tests 3/3.
Runtime gate: `tacit.sh preflight` no failures (2 user actions); `node docs/demo-preflight-codex.mjs` **0 FAIL**, 4 human
actions; companion `--selftest` 7/7; `live:check` OK; `live:stress --kill-recognizer` OK (after contract update);
`reviewed:check` 13/13; `speech:check` OK; `ui:check` A+B PASS. `route:check` deliberately NOT run (rewrites
calibration and plays a tone); existing calibration +16 dB is current.

Lifecycle: `tacit.sh stop` leaves no tsx/sidecar/route process and no listener on 8790/8765/8766; the companion stays
up and reconnects; exactly one companion instance after selftest.

## Remaining blockers / risks

- **P1 — physical:** Meet listener verification of the reviewed and corrected path (typed path was human-verified
  earlier). Live camera endpointing reliability with a human (3 consecutive sentences) not re-tested this session.
- **P1 — accuracy:** pretrained model only; prior live silent result 44 % WER, 2/5 exact (DEMO_READINESS D.7). Plan
  for the correction fallback.
- **P1 — procedure:** while Live is capturing, ANY mouth movement that ends a window (talking to judges, smiling)
  becomes a newer utterance and revokes the current review. Pause Live also clears it. The operator must stay silent
  between mouthing and pressing Speak; a teammate narrates.
- **P2:** a newer accepted utterance also cuts reviewed audio that is still playing — wait for speech to finish
  before mouthing the next sentence.
- **P2:** Speak latency ~0.9–1.2 s (review pre-synthesis removed by the race fix; was ~5 ms).
- **P2 — packaging:** companion is **ad-hoc signed** (`codesign --verify --strict` valid; no Developer ID, not
  notarized) — runs on this Mac only. Launch via the node launcher (GUI launch hit a blocking credential-file read).
  The runtime is a dev checkout (Node/tsx, Python venv, Swift builds, git-ignored weights) — not a standalone package.
- **P3:** `/api/health` exposes no code revision; loaded revision is inferred from process start time (00:54 UTC
  restart, after all commits except test scripts).

## Commands

```sh
# build everything (route helper, companion app, web)          — when idle
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/tacit.sh build
./scripts/tacit.sh start | stop | restart | status | preflight
node docs/demo-preflight-codex.mjs                 # passive; exit 2 (= human actions only) is the healthy result
node macos/TacitCompanion/tools/open-companion.mjs # launch notch (only if not already running: pgrep -f MacOS/TacitCompanion)
./scripts/tacit.sh open                            # camera workspace (token never printed)
# local verification (idle runtime, nobody reading BlackHole; reviewed/speech checks render audio into it)
cd server && npm run live:check && npm run reviewed:check -- ../recognition/data/webcam/20261114T191005Z-bright-test && npm run speech:check
```

**Recover:** recognizer crash → server restarts it (~8 s); stuck runtime → `./scripts/tacit.sh restart` (companion
reconnects by itself; Live and voice come back OFF, re-enable deliberately); companion gone → node launcher; audio
going out wrongly → companion Stop / ⌃⇧⌘. / mute Meet.

**Rollback (backend to pre-race-fix, notch kept):** `git switch --detach d51d51a && ./scripts/tacit.sh build &&
./scripts/tacit.sh restart`, relaunch companion. Return: `git switch main` + build + restart. Rollback reintroduces the
three reproduced races; only use if the new code fails in rehearsal.

## Demo flow

Use the five-minute script, Meet setup and fallback in [DEMO_RUNBOOK_CODEX.md](DEMO_RUNBOOK_CODEX.md) ("Prepare
before judges", "Five-minute judge demo", "Transparent fallback"). Superseded parts of that file: its "Reproduced
failures" (fixed above), the "Owner action" about stale recognizer/web build (restarted/rebuilt 00:54 UTC), and its
terminal syntax (now full token `1@v3`, `e 1@v3`). Add: operator silent while reviewing; wait for speech to finish
before the next sentence.

## Physical checks you must do (on the exact demo setup)

- [ ] Meet mic = **BlackHole 16ch**, output = headphones/speakers; second device joined, its mic muted.
- [ ] One live mouthed sentence reaches the notch, nothing is spoken until you press Speak.
- [ ] Pick raw/alternative → Speak: listener reports the exact words, **once**.
- [ ] Edit → your words → Speak: listener hears your correction.
- [ ] Typed AAC → Speak, then Stop / ⌃⇧⌘. mid-sentence: listener confirms the cut and no later audio.
- [ ] Mouth a new sentence while an old choice is selected: old choice disappears and cannot be spoken.
- [ ] Hide the workspace window → capture pauses; return and resume deliberately.

## Recommendation

**GO** for a reviewed-speech demo on this Mac — local software path verified end to end (recorded input → recognition
→ explicit review → exact text → BlackHole 16ch, with every refusal/Stop path), conditional on the physical checklist
above. **NO-GO for any claim** of remote audibility of reviewed speech, live recognition accuracy, automatic speech, or a
distributable signed app until those are actually verified.
