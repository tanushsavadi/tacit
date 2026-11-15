# Presence — live meeting awareness (Phase B): investigation, not implemented

**Status (2026-11-15): NOT implemented. Help Me Respond is not meeting-aware.** Context is typed or pasted by the
user, or is the visibly labelled SAMPLE question. The UI says so ("TACIT doesn't listen to your meeting") and the
protocol has no live context source (`RespondContextSource = 'user-provided' | 'sample'`; the server refuses anything else).

## Why it was not built in this sprint
The bar was "implement only if verified end to end". That needs three things an agent cannot supply alone:
1. A macOS privacy grant (Screen & System Audio Recording, or system-audio capture) — a human must answer the
   system prompt. Agents never click TCC prompts.
2. A real remote participant speaking in Google Meet, to measure what TACIT transcribes and how fast. Local capture
   of a test sound is not evidence of remote transcription.
3. A free window: the user's Meet/BlackHole setup was live during the sprint and had to stay untouched.

## Capture options (from Apple's documented APIs; not exercised here)
| Option | What it captures | Notes |
|---|---|---|
| **Core Audio process tap** (`CATapDescription` + `AudioHardwareCreateProcessTap`, macOS 14.2+) | Audio output of chosen processes (e.g. the browser running Meet), before the output device | Best fit: per-app, works whatever the output device is (speakers or **AirPods**), can exclude TACIT. Needs `NSAudioCaptureUsageDescription` + the user's grant. |
| **ScreenCaptureKit audio** (`SCStreamConfiguration.capturesAudio`, `excludesCurrentProcessAudio`) | App/display audio via a content filter on the browser app | Needs Screen Recording permission (broader and scarier than needed); fine as a fallback. |
| BlackHole loopback | — | Wrong direction: BlackHole carries TACIT's voice **into** Meet. Never read it for context. |
| Mac microphone | Room sound | Useless with AirPods, picks up the user's surroundings, and is the wrong consent model. |

## Feedback from TACIT's own voice
- TACIT speaks into BlackHole 16ch (Meet's microphone). Meet does not play your own microphone back to you, so the
  browser's **output** contains the remote participants, not TACIT's synthetic speech.
- Still guard it: tap only the browser process (exclude TACIT and tacit-route), and drop transcript segments that
  overlap a TACIT `speech_delivery` window (requestedAt…endedAt) or match the text TACIT just spoke.

## Transcription
Existing local STT: whisper.cpp server (`server/src/stt.ts`, `ggml-base.en`, measured p50 90 ms per call on short
clips). Local means no meeting audio leaves the Mac for transcription. A rolling window (e.g. last 30–60 s, RAM only,
dropped on Stop/stop-listening) would feed the "They said" card; the question detector picks the latest `?` sentence.

## Proposed design (for a future, separately approved sprint)
1. `MeetingListener` (Swift, companion): process tap on the browser chosen by the user → 16 kHz mono PCM → server
   over the existing authenticated socket. Never persisted.
2. Explicit start per call: a sheet that names the app being heard, states that other participants should be told
   (consent), and needs a deliberate "Start listening". Unmistakable indicator in the collapsed notch (distinct colour +
   "Listening to Meet") and a one-tap Stop listening; global Stop also stops it.
3. Server: rolling transcript in RAM only; new context source `'meeting-live'` (additive protocol change) with
   timestamps, labelled "HEARD IN MEET · live · auto-transcribed (may be wrong)". Still untrusted data for the model.
4. Nothing about this path can speak: suggestions still need intent + edit/approve + Speak.

## Verification plan (required before calling anything "live meeting-aware")
- Second device joins the Meet; a person says 10 scripted questions. Measure WER of the transcript vs the script,
  end-of-speech → card latency (p50/p95), and false context from TACIT's own voice (must be 0).
- Repeat with AirPods as output, and with TACIT speaking while the other person talks.
- Revoke permission / Stop listening mid-sentence → capture ends within 100 ms, buffer cleared.
