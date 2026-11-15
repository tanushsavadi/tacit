# TACIT — release gate and demo runbook (unified release, 2026-11-15 ~02:45 UTC)

Integration owner: Claude (Git owner). Evidence below was produced on this Mac against the running runtime (restarted
02:26 UTC, idle, from the integrated code) unless marked otherwise. **PASS = the stated scope only.** Nothing here proves
that a remote Google Meet participant heard anything — only a human listener can confirm that.

Recognizer unchanged and frozen: unmodified pretrained Auto-AVSR `LRS3_V_WER19.1` (weights sha256 `e740cef3…`); no
overlay; `recognition/`, `server/src/live.ts`, `reviewed.ts`, `route.ts` and `macos/TacitRoute` are byte-identical to the
rollback tag. Automatic speech of recognised words stays DISABLED (`UNVALIDATED_GATE`, `recognizedSpeechAllowed:false`).

## What this release adds (on `main`, integration merge `35ec16a`)

| Merge / commit | Change |
|---|---|
| `2435a1d` ← `feat/my-voice` | **My Voice**: `tacit-voice` helper (installed macOS voices, warm AVSpeechSynthesizer), voice registry + persisted selection (`server/data/voice-prefs.json`), voice bound to each approved request (`voiceRevision`), private preview with virtual-mic leak guard, `say` `[[…]]` fidelity fix, `npm run myvoice:check` |
| `e5c86e5` | preflight + `/api/health` report the My Voice engine and effective voice |
| `03cb9a4` ← `feat/tacit-native-experience` | **Sol's native experience** (yielded STABLE 01:47 UTC; Astra motion): inline review/correction, persistent typed draft, Hold My Turn (⌃⇧⌘H), four customizable phrases, local Help Me Respond (no AI/capture), recovery states, bounded spring motion + Reduce Motion, offline Experience Lab + `--offline-selftest`. Files copied by SHA-256 manifest; Sol's worktree untouched |
| `263e872` ← `feat/native-my-voice` | **My Voice in the notch**: real voice list (current first; novelty under "More voices"), Listen privately, Use, Speed/Pitch only when reported, fallback/engine/disconnected/refused-preview states; every speak request (typed, Hold, phrase, reviewed) carries `voiceRevision` |
| `35ec16a` | Lab can render a `voice_status` snapshot captured from a real server (evidence tool) |

## Integration matrix (fresh, 2026-11-15 02:26–02:41 UTC, live runtime)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| A | App launches, connects | **PASS** | restart → recognizer ready 4.7 s; companion relaunched (`open`), connected; companion `--selftest` 7/7, one instance after |
| B | Silent sentence → result | **PASS (recorded)** / **PHYSICAL PENDING** | `reviewed:check` real silent clip → shown + 5 candidates; `ui:check` A 2/2 shown in production web UI |
| C | Pick / edit candidate | **PASS** | Swift 40/40 (review, invalidation, correction provenance); `reviewed:check` correction → `user-corrected`, exact |
| D | Explicit approve + Speak | **PASS** | `reviewed:check` 13/13: pick rendered, duplicate refused, 6 tamper/stale refusals, newer header invalidates |
| E | Exact text → My Voice → BlackHole 16ch | **PASS (local)** | reviewed pick press→first audio **152 ms** (was 887–1219 ms with `say`); voice "Samantha (en-US, macOS voice, on this Mac)" |
| F | Next utterance | **PASS** | `review_invalidated` before result; old pick refused; `live:stress` OK |
| G | Pause / Stop / errors fail safe | **PASS (local)** | Stop during reviewed speech 21 ms; typed pause cut 14 ms; My Voice Stop 6 ms; recognizer killed → abstains, restart 8 s; voice helper killed → visible fallback, back in 0.64 s |
| H | Typed / Hold / phrase speech | **PASS (unit + local)** | `speech:check` OK; `ui:check` B typed → BlackHole 165 ms; Hold/phrases use authorized `speak_typed` only (Swift tests: blocked when paused/unavailable, draft preserved) |
| I | Never auto-speaks | **PASS** | `transmitted=false` everywhere; gate untouched (diff vs tag) |
| J | Choose voice, persists, exact text | **PASS (local)** | `myvoice:check --preview` all PASS: 180 voices / 39 languages; refusals; selection persisted + restored after restart; stale voice refused; queued messages keep approved voice |
| K | Preview stays private | **PASS (local)** | preview played on "MacBook Pro Speakers", selection unchanged; leak guard refuses when output is/contains a virtual mic (unit + real device list) |
| L | Native UI rendered | **PASS (offline render)** | Experience Lab captures 10/10 at expected sizes incl. My Voice with the REAL server registry; Reduce Motion: 18 snap transitions vs 260 animated, hover cancel OK |
| — | Remote Meet listener hears both voices | **NOT VERIFIED** | requires a human (checklist below) |

Static gate on `35ec16a`: server tsc 0 + **167/167**; companion Swift **40/40**; tacit-voice **5/5**; TacitRoute **4/4**;
web tsc 0 + **80/80** + build; recognition **40/40**; companion release build ad-hoc signed, `codesign --verify --deep
--strict` OK; `--offline-selftest` 10/10. Runtime gate: `tacit.sh preflight` 0 FAIL (2 user actions; new row "My Voice
engine — speaking as Samantha"); `demo-preflight-codex.mjs` 0 FAIL, 4 human actions; `live:check` OK; `live:stress
--kill-recognizer` OK; `reviewed:check` 13/13; `speech:check` OK; `security:check` 13/13; `ui:check` A+B; `myvoice:check
--preview` all PASS. `route:check` deliberately NOT run (rewrites calibration).

Latency (request → sound captured at the BlackHole input, warm, n=5 each, live runtime): Eddy p50 **68 ms**, Samantha
p50 **94 ms**; old `say` engine on the same path p50 **945 ms**.

## Remaining risks

- **P1 — physical:** Meet listener verification (reviewed, corrected, Hold, phrase, two voices). Live camera
  endpointing with a human not re-tested this session.
- **P1 — accuracy:** pretrained model only; prior live silent result 44 % WER, 2/5 exact. Use correction / typed / phrases.
- **P1 — procedure:** while Live captures, ANY mouth movement that ends a window (talking, smiling) revokes the current
  review. Operator stays silent between mouthing and Speak; a teammate narrates.
- **P2:** a newer accepted utterance cuts reviewed audio still playing — wait for speech to finish before the next sentence.
- **P2:** changing voice between seeing and pressing Speak refuses that message ("Your voice changed…") — press Speak again.
- **P2 — packaging:** companion is **ad-hoc signed** (no Developer ID, not notarized) — this Mac only. If `open` ever
  stalls on credentials, use `node macos/TacitCompanion/tools/open-companion.mjs`. Dev checkout, not a standalone package.
- **P2 — UI evidence:** production notch screenshots come from the offline lab renderer (same view code; real registry
  snapshot); the live notch on screen was not captured (no Screen Recording permission for the terminal).
- **P3:** Apple Personal Voice cannot be used for call audio (Apple restriction; truthful disabled state).

## Commands

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ./scripts/tacit.sh build   # route, tacit-voice, companion, web — when idle
./scripts/tacit.sh start | stop | restart | status | preflight
open macos/TacitCompanion/.build/TACIT.app       # or: node macos/TacitCompanion/tools/open-companion.mjs (check pgrep -f MacOS/TacitCompanion first)
./scripts/tacit.sh open                          # camera workspace (token never printed)
# local verification (idle runtime, nobody reading BlackHole; these render test audio into it)
cd server && npm run live:check && npm run reviewed:check -- ../recognition/data/webcam/20261114T191005Z-bright-test \
  && npm run speech:check && npm run myvoice:check -- --preview && npm run security:check
macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion --selftest           # live, idle only
macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion --offline-selftest   # no sockets/audio
```

**Recover:** recognizer crash → restarted (~8 s); voice helper crash → visible fallback to the macOS default, restarted
(<1 s); stuck runtime → `./scripts/tacit.sh restart` (companion reconnects; Live and voice come back OFF — re-enable
deliberately; the chosen voice is restored from disk); audio going out wrongly → notch Stop / ⌃⇧⌘. / mute Meet.

## Rollback (cheapest first)

1. **Voice engine only, no code change:** add `TACIT_VOICE=off` to `server/.env`, `./scripts/tacit.sh restart` → speech
   uses the old `say` default voice (preflight shows INFO "disabled by TACIT_VOICE=off"). Forget a choice:
   delete `server/data/voice-prefs.json`.
2. **Whole release:** `git switch --detach demo-known-good-2026-11-15 && ./scripts/tacit.sh build &&
   ./scripts/tacit.sh restart`, then relaunch the companion (`pkill -f MacOS/TacitCompanion; open
   macos/TacitCompanion/.build/TACIT.app`). That is `e710dfe`, the release verified at ~01:00 UTC (old notch, `say`).
   Return: `git switch main` + build + restart + relaunch. Old app ignores the new phrase/voice preference files.
3. Only when idle (no Live session, no call reading BlackHole).

## Physical checklist (on the exact demo setup, with a second device as the Meet listener)

- [ ] Meet mic = **BlackHole 16ch**, output = headphones/speakers; listener device joined, its mic muted.
- [ ] **Camera:** start Live in the workspace; mouth one sentence → it appears in the notch; nothing is spoken.
- [ ] **Review:** pick raw or an alternative → Speak → listener reports the exact words, once.
- [ ] **Correction:** Edit → type your words → Speak → listener hears your correction.
- [ ] **Hold My Turn:** press it (or ⌃⇧⌘H) while typing elsewhere → listener hears the hold phrase; your draft is kept.
- [ ] **Phrase:** My phrases → select one → Speak → listener hears it.
- [ ] **Change voice:** My Voice → Listen privately to two voices (the listener must hear NOTHING) → Use voice 2 →
      speak a phrase → listener hears voice 2; switch back to voice 1 → speak → listener hears voice 1, clearly, both times.
- [ ] **Stop:** start a long typed message → Stop / ⌃⇧⌘. mid-sentence → listener confirms the cut and no later audio.
- [ ] **Recovery:** mouth a new sentence while an old choice is selected → old choice disappears; pause/resume voice
      deliberately; quit+reopen the notch → it reconnects and keeps your chosen voice.

## Recommendation

**GO** for tomorrow's demo on this Mac — reviewed silent-to-speech, native notch (review, correction, Hold, phrases)
and My Voice are integrated and verified end to end locally (recorded input → recognition → explicit review → exact
text → chosen voice → BlackHole 16ch, every refusal/Stop path, preview isolation), **conditional on the physical
checklist**. **NO-GO for claims** of remote audibility (until the listener confirms), live recognition accuracy,
automatic speech, Apple Personal Voice in calls, or a distributable signed app.
