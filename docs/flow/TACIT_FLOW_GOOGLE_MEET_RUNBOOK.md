# Setup, installation and actual Meet verification

Candidate only. Stable server/app must remain untouched. No tunnel, device-default change, Git write or stable launcher restart.

## Build / clean dependencies

From the candidate root, development dependency symlinks can be used as supplied. On a clean separate copy (without symlinks), run `cd server && npm ci`, `cd web && npm ci`; do not run `npm ci` against the supplied symlinked dependency directories. Node 22+, Xcode full toolchain, Swift, Python3, whisper-server, ffmpeg and the existing local whisper model are required. Auto-AVSR and its separately licensed weights stay in the stable installation and are referenced locally, never redistributed.

```
cd server
npm run typecheck && npm test
cd ../web
npm run typecheck && npm test && npm run build
cd ../macos/TacitRoute
swift build -c release
cd ../TacitVoice
swift build -c release
cd ../TacitCompanion
tools/build-flow.sh
```

The app is `macos/TacitCompanion/.build/TACIT Flow Candidate.app`, distinct ID `edu.hackumass.tacit-flow-candidate`, ad-hoc signed for local use only. No notarized/distributable signed build is claimed.

## Launch isolated runtime (foreground)

From `candidate/server`:

```
TACIT_FLOW_SOURCE_ROOT="/Users/tanushsavadi/Documents/Hackathons/HackUMass 26'" node_modules/.bin/tsx scripts/flow/launch.ts
```

This references the original `.env`/local model without copying credentials, starts private local STT :18766 and candidate :18890/:18892 with its own token file. Output route is disabled. Capture stays off. Do not set `TACIT_FLOW_PROVIDER_POLICY=paid-verified` without checking the actual API project's terms and billing. No meeting text is sent by default. Optional model is `TACIT_FLOW_MODEL`; default stays the bounded Flash-Lite adapter, not an unmeasured newer model.

For a deliberate audio acceptance session, close the first candidate supervisor (Ctrl-C), confirm its ports are free, and relaunch with `--with-output`. This uses the existing virtual-microphone route with the candidate's own helper; never change BlackHole defaults. Do not run both candidate and stable authorized speech simultaneously. Existing voice selection is not silently copied: choose the intended voice inside the new candidate session before enabling voice.

Open the separately named candidate app deliberately. macOS may ask for Documents access and (only if you choose camera input) camera access. No new system-wide audio permission is required for the Chrome path. If prompted for a permission, only the human grants it; do not reset TCC.

## Install extension and consent

1. `chrome://extensions` → Developer mode → Load unpacked → `candidate/web/flow-capture`.
2. Join a nonsensitive Meet with a consenting teammate on another device. Ask everyone: “May TACIT process this tab's incoming audio locally to help me keep my place? It won't save a recording. I will separately disclose if I enable Google text interpretation.” If anyone declines, leave Flow off.
3. Meet microphone = existing **BlackHole 16ch**; output = normal headphones. Remote device uses headphones. Incoming audio capture and outgoing microphone are different directions.
4. Candidate notch → More (…) → **Flow · conversation participation**. Confirm participants agreed. Leave Google text off until account terms are verified; then separately opt in if everyone agreed to that disclosure.
5. Enable Flow → Generate pairing code → Copy code. Select the actual Meet tab → click TACIT Flow toolbar icon (or Chrome's configured Ctrl-Shift-Y shortcut) → paste code → Capture this Meet tab. Native status and extension LIVE badge must agree.
6. Confirm the local user still hears the participant. If not, Stop listening. Do not proceed based only on a green indicator.

## Vertical slice and measurements

Remote asks “Could we meet Thursday at four?” Final local transcript must contain what was actually recognized. If it is wrong, leave that visible and record the failure. Gemini must quote a current source, not a script. Select Respond; type or use the separate reviewed silent-speech path. While typing, remote says “Actually, I meant Thursday at five.” Inspect original/later evidence; the original answer must stay unchanged. User keeps/edits deliberately, enables the chosen voice, presses Speak. Remote repeats the exact sentence heard, once. Stop during a separately approved longer message; remote confirms the cut and no later replay.

Log timings/keystrokes with separate consent; do not save private audio/video/transcripts by default. Record exact listener testimony only with permission. Local route/render events are not remote audibility. Repeat wrong tab, tab closure/reload/navigation, browser crash/relaunch, device switch, overlap, denial/revocation, 429/network loss and fifteen-minute resource load alongside Auto-AVSR. Targets and result fields are in EVALUATION_PLAN.

## Failure recovery / rollback

Capture failure → Stop listening; use ordinary typed/reviewed TACIT. Source error → select and pair again; never use broader capture. Gemini failure → local context/drafts still work, no retry storm. Recognition error → explicit Edit on current reviewed words, never Gemini correction. Output failure → check chosen voice and Meet mic; do not claim delivery. Global Stop = ⌃⇧⌘. on the active candidate, or visible Stop. Candidate can register the same global shortcuts as stable TACIT; their simultaneous hotkey behavior is **unverified**, so use visible controls during dual-app tests.

Rollback: stop capture, close candidate app, Ctrl-C candidate supervisor. It stops only its children. Confirm :18890/:18892/:18766 are closed and Chrome badge is off. Stable :8790, recognizer, app and BlackHole configuration must be unchanged. Never run the stable rollback/rebuild commands merely to exit the candidate.
