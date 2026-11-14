# TACIT — human demo checklist

Four separate claims. Mark each only when its **pass** line is met; never infer one from another.

## 0. Setup (every session)
1. `cd server && npm start` → log shows `auth: required`, `turn logging: off`, `stt: whisper.cpp server`, and the voice line.
2. `cd web && npm run dev` (Sol's frontend). `cd server && npm run links` → user URL + caller URL (treat as passwords).
3. `cd server && npm run security:check` → `ALL SECURITY CHECKS PASSED`.
4. **Token rotation (once, recommended):** before Sol's Vite fix, the dev server (`--host`) could serve
   `server/data/secrets.json` to anything on the network. Stop the server, delete `server/data/secrets.json`, restart,
   re-run `npm run links`, reload both pages.
5. Logging stays **off** unless the user opts in on the user page (`timings` stores no conversation text).

## A. Browser audio conversation (no phone network)
- Caller page in a second browser/device (`localhost` or HTTPS — mics need a secure context), mic enabled, headphones
  recommended. User page open.
- Steps: caller speaks a question → user page shows the transcript + 3 replies → user selects (tap/keys) → confirm
  (enabled after ~0.6 s) → caller page plays the reply.
- **Pass:** the *person at the caller device says they heard* the confirmed reply, and the user page shows
  `played`. `played` alone = the caller browser reported playback ended; it is not proof a human heard it.
- Record: diagnostics stage timings (transcription, generation, HUMAN selection, HUMAN confirmation, postConfirm,
  playback incl. audio length). Don't report `systemMs` as interaction latency.

## B. Webcam selection
- User page: enable camera → neutral calibration → hold a mapped mouth gesture (Sol's experimental mapping; **not
  lip-reading**) → the proposal shows `source: mouth` + `method` → a separate explicit confirmation is still required.
- **Pass:** for each attempt, record target vs. outcome (correct / wrong / abstained / tracking lost). Report counts,
  not "works". Tap/keys remain the fallback.

## C. Personalized voice (ElevenLabs)
- Needs `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (the user's own cloned voice), `ELEVENLABS_VOICE_CONSENT=self`.
  `cd server && npm run voice:check` must report category `cloned`/`professional`. Restart the server.
- Defaults (user-controlled per session via `set_voice_policy`): the personal voice is **not** pre-generated before
  confirmation, and the system voice is **never** substituted if the personal voice fails — the reply is refused with
  "Nothing was sent". Approving the fallback makes substituted audio say `SUBSTITUTED` in its label.
- **Pass:** caller hears the reply in the user's cloned voice and `speech.voice` names the ElevenLabs voice (no `SUBSTITUTED`).
- Not yet run: no key in this environment.

## D. Actual phone delivery (Twilio PSTN)
- Needs `TWILIO_AUTH_TOKEN`, a Twilio number, and the user's explicit authorization to open a public tunnel.
- `npm run tunnel` → set `PUBLIC_URL` → restart → `npm run twilio:preflight` all OK → number's Voice webhook
  `POST <PUBLIC_URL>/twilio/voice` → call the number from a phone; same select/confirm flow on the user page.
- **Pass:** the *human on the phone* hears the confirmed reply. The server's `twilio-mark` ack means Twilio reached
  that point in its playback buffer; it is not audibility proof. `npm run twilio:sim` is a protocol simulation only.
- After the demo: stop the tunnel, unset `PUBLIC_URL`.
