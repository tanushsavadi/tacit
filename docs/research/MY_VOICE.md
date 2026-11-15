# My Voice — personalized voice identity (branch `feat/my-voice`)

**Your words. Your voice. Your choice.** The user chooses how they are heard, can change it, and TACIT speaks the
approved words unchanged in that voice. Measured 2026-11-15 01:20–01:55 UTC on the M3 Pro dev Mac (macOS 27.0.1).

## What is implemented
| Piece | Where | What it does |
|---|---|---|
| `tacit-voice` | `macos/TacitVoice/` | Swift helper. `list`: every installed `AVSpeechSynthesisVoice` (identifier, name, locale, quality, Apple novelty/personal traits) + Personal Voice authorization. `serve`: one warm `AVSpeechSynthesizer`, FIFO + cancel, renders mono PCM16 WAV. Unknown voice → error (never the silent default); out-of-range rate/pitch → rejected (never clamped); Personal Voice → refused; empty render → error. Writes files only; never plays or routes. |
| `VoiceHelper` | `server/src/voices.ts` | Supervises `tacit-voice serve` (restart budget, warm-up render at start, per-request 0700 temp dir, abort → `cancel`). |
| `MyVoice` | `server/src/voices.ts` | Registry (Apple voices + consented ElevenLabs clone + `say` default), validation, persisted selection (`server/data/voice-prefs.json`, 0600, atomic, git-ignored), visible fallback, revisioned **binding** of each approved request. |
| `SpeechOutput` | `server/src/speech.ts` | Binds the effective voice when a typed / reviewed / corrected request is ACCEPTED; synthesis uses that binding even if the user changes voice later. Optional `voiceRevision` refuses requests approved under another voice. |
| `VoicePreview` | `server/src/preview.ts` | Private preview with `afplay` on the Mac's own output; leak guard (below); one at a time; Stop ends it. |
| `myvoice:check` | `server/scripts/myvoice-check.ts` | Live end-to-end check against a running server (see "Verification"). |
| `say` fix | `server/src/tts.ts` | `say` executed embedded `[[…]]` commands found in user text; now defused (zero-width space), words unchanged. |

Voice ids: `apple:<AVSpeechSynthesisVoice.identifier>` · `elevenlabs:<voiceId>` · `system:default`.
Controls are offered only where the provider really supports them: Apple voices `rate` 0.3–0.7 (AVSpeech scale,
default 0.5) and `pitch` ×0.8–1.25 (measured on Samantha: ×1.3 → median F0 171 → 223 Hz; ×0.75 only → 160 Hz, so
the range stays narrow and is not an effects control). **Volume is deliberately not offered**: it works
(×0.5 → peak 0.79 → 0.20) but call loudness is set by the route's calibrated gain; a quieter synthesis voice would
only make the user harder to hear. `say` and the ElevenLabs clone expose no controls.

The registry never describes voices by gender or personality (asserted by a test and by `myvoice:check`). Apple's
own novelty flag (Bells, Zarvox, Albert…: 15 voices here) is passed through so UIs keep effects out of the main list.

## Safety and fidelity (how each rule is enforced)
- **Exact text.** Text passes through unchanged (only the existing ALL-CAPS → sentence-case for model candidates).
  AVSpeechSynthesizer reads `[[slnc 3000]]` / `[[volm 0]]` literally (measured: same duration as the words read
  aloud, full peak). `say` executed them (4.02 s with injected silence vs 3.08 s fixed) → fixed for the fallback.
- **Stale voice.** `voice_status.revision` bumps whenever the effective voice or settings change; a speak request
  carrying an older `voiceRevision` is refused ("Your voice changed after this was shown"). For reviewed speech the
  refusal does NOT consume the utterance — the user presses Speak again.
- **Voice change during synthesis / while queued.** The request keeps the voice frozen at acceptance (unit test +
  live: two queued messages stayed Samantha after switching to Eddy).
- **Pause / Stop.** Unchanged authorization path; Stop aborts synthesis (helper `cancel`) and the route. Live:
  stop → interrupted **7–8 ms** (server clock). Output stop/pause also stops a preview.
- **Unavailable providers fail safely.** A bound voice that errors or renders silence → delivery `failed`
  ("Nothing was sent"); never another voice. A SAVED voice that is unavailable at selection time falls back to the
  macOS default with `fallback` reason + labelled voice — visible before the user approves anything. The personal
  clone is never substituted (VoiceRouter's `allowSystemFallback` policy still decides).
- **No automatic transmission.** Unchanged: `recognizedSpeechAllowed: false`, `UNVALIDATED_GATE`.
- **Preview cannot leak into a call.** Played only after a read-only `tacit-route list/diagnose` check, right before
  playback: refused if the Mac's sound output is the route device, ANY virtual device with inputs (BlackHole,
  ZoomAudioDevice…), an aggregate containing one, or cannot be verified. Verified on the real device list (speakers
  → allowed; route = speakers → refused; no tacit-route → refused). Residual risk: a call app using the PHYSICAL
  mic could pick up the speakers acoustically — TACIT's setup uses BlackHole as the call mic; headphones avoid it.

## Apple Personal Voice — findings
1. **APIs exist on macOS 14+:** `AVSpeechSynthesizer.requestPersonalVoiceAuthorization`,
   `personalVoiceAuthorizationStatus`, `AVSpeechSynthesisVoice.Traits.isPersonalVoice` (local SDK header
   `AVFAudio.framework/Headers/AVSpeechSynthesis.h`). Personal voices appear in `speechVoices()` only when authorized.
2. **Capture is not allowed.** Apple: apps you allow to use Personal Voice "can't capture speech from Personal Voice"
   ([support 104993](https://support.apple.com/en-eg/104993)). TACIT's call path renders audio and writes it into the
   virtual mic — that is capture. `tacit-voice` therefore refuses Personal Voice; we did NOT test whether
   `write(_:toBufferCallback:)` returns audio for it, because using it would be the prohibited workaround.
3. **No supported speech-into-call API on macOS.** `mixToTelephonyUplink` is
   `API_AVAILABLE(ios(13.0), watchos(6.0)) API_UNAVAILABLE(tvos, macos)`; `outputChannels` and
   `usesApplicationAudioSession` are also `API_UNAVAILABLE(macos)` (same header).
4. **Compliant route that exists: Apple's own Live Speech** (System Settings → Accessibility → Live Speech), which can
   speak typed text with the user's Personal Voice "during in-person conversations and in apps like FaceTime"
   ([Mac help](https://support.apple.com/guide/mac-help/mchldd11f4fd)). Apple documents FaceTime; **Google Meet is
   not documented and NOT verified** — FaceTime support does not prove Meet compatibility. A user test would be:
   Meet in Chrome with the physical mic, Live Speech on, a remote human listener. Live Speech is outside TACIT: TACIT
   cannot feed it recognised text programmatically.
5. **Licence:** Personal Voice is for the user's "own personal, non-commercial use" (Apple support 104993; SLA).
6. **This Mac:** authorization status from the unbundled CLI helper = `denied` (CLI tools cannot be granted access;
   a bundled app could request it, which would still not permit routing).

**Result:** truthful disabled state. `voice_status.applePersonalVoice = {authorization, usableInCalls: false,
reason}`; any Personal Voice that becomes visible is listed `available: false` with that reason. TACIT never claims
Personal Voice works through BlackHole.

## Custom / cloned voice (ElevenLabs) — feasibility
Already supported and unchanged in policy: `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` + `ELEVENLABS_VOICE_CONSENT=self`,
startup check that the voice is a `cloned`/`professional` voice, no pre-synthesis without opt-in, no substitution
without `set_voice_policy`. My Voice lists it as `elevenlabs:<id>` (`kind: personal-clone`, `local: false`) and it
is the default when configured (today's behaviour). Previewing it calls ElevenLabs (network, uses credits).
**Not built (deliberately):** an in-app cloning/upload flow. It would need: explicit consent + proof of authority
over the voice, a privacy/data-handling disclosure (audio leaves the Mac; ElevenLabs retention), user-initiated
deletion (`DELETE /v1/voices/{id}`) and provider disconnect (remove the key), and authorized samples. TACIT has no
voice recordings — the silent-speech clips are video-only — so a clone requires the user to supply their own audio.
No ElevenLabs API call was made in this sprint (no paid usage). People who cannot record still get the full local
voice choice above.

## Performance (measured, same real route path, request → first sound captured at the virtual mic input)
| Engine | TTS p50 / max | request → sound at virtual mic p50 / max | n | network |
|---|---|---|---|---|
| tacit-voice · Samantha (en-US) | 52 / 61 ms | 76 / 89 ms | 10 | none |
| tacit-voice · Eddy (en-GB) | 44 / 68 ms | 65 / 90 ms | 10 | none |
| `say` default (pre-My-Voice engine) | 844 / 901 ms | 872 / 926 ms | 10 | none |
| ElevenLabs flash v2.5 | not measured this sprint (no key / no paid use) | | | yes |

30/30 renders succeeded in the 10-run pass (plus 3-run and 4-run passes). Cold first render of the helper ~0.6–0.7 s
is paid by a warm-up at start. Helper idle: 41 MB RSS, 0 % CPU; per sentence ~45–60 ms of synthesis. Stop 7–8 ms.
Prototype measurements (scratch, not committed): fresh-process AVSpeech 0.55–0.6 s vs `say` 0.9 s; in-process warm
24–55 ms. **Naturalness / comfort in a real conversation: NOT evaluated** — that needs the user's own listening,
ideally over the Meet path. All voices here report quality `default` (compact); enhanced/premium voices can be
downloaded in System Settings → Accessibility → Spoken Content and appear after `voice_refresh`.

## Verification (fresh, isolated instance :8799 from the worktree, TACIT_HOST=127.0.0.1; demo :8790 untouched)
- Server `npm test` 167/167 (26 new), typecheck clean; tacit-voice core tests 5/5 (Xcode toolchain:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test`); web typecheck + `npm test` 80/80 + build
  against the new protocol (Sol's files untouched); companion and web ignore unknown message types (read-only check).
- `myvoice:check --preview`: all PASS — registry (180 voices, 39 languages, 15 novelty), refusals, persisted
  selection, preview played on "MacBook Pro Speakers" without changing the selection, chosen voice captured at the
  BlackHole 16ch input, stale revision refused, queued binding, Stop.
- Persistence across a real restart: selection came back `source: "saved"`.
- Regression: `speech:check` OK (typed speech now in the effective Apple voice, pause cut 22 ms); `security:check`
  13/13 (with a whisper model present — without one, two Twilio checks report close code 1005 instead of 1008
  because `index.ts` closes Twilio sockets when no STT exists; pre-existing, not My Voice).
- Not verified: a remote human hearing My Voice audio in Meet; naturalness listening test.

## Integration and rollback
Integrate (Git owner, after the user's go-ahead and a Sol checkpoint):
1. `git merge --no-ff feat/my-voice` on `main` (no conflicts expected: HANDOFF is updated only on main).
2. `./scripts/tacit.sh build` (now also builds `macos/TacitVoice`), then `./scripts/tacit.sh restart` only when idle.
3. `cd server && npm test && TACIT_URL=ws://127.0.0.1:8790 npm run myvoice:check && npm run speech:check && npm run reviewed:check`.
4. Physical: Meet with BlackHole 16ch as mic, remote human listener, one reviewed message in a chosen voice.

Rollback, cheapest first:
- **Runtime, no code change:** `TACIT_VOICE=off` (env) → no helper; voice falls back to the `say` default as before
  (selection shows the visible fallback). Delete `server/data/voice-prefs.json` to forget the choice.
- **Code:** `git revert -m 1 <merge>`; or redeploy the known-good `e710dfe` (main before this branch).
- The branch never changed recognition, the review contract, route calibration, or BlackHole routing.
