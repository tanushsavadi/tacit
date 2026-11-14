# TACIT frontend · continuous silent speech

`npm run dev` serves http://localhost:5173/ and proxies the existing backend on :8790. `npm run open:local` opens authenticated workspace and caller tabs in normal Mac Chrome without printing private links; `npm run open:local -- --check` checks connectivity. `/` is the Mode 2 workspace; `/#caller` is the caller companion.

## Current capability

The primary application has no reply candidates or per-utterance confirmation. It provides opt-in camera tracking, real MediaPipe facial/mouth signals, timestamped JPEG frame buffering, experimental temporal articulation windows, immediate pause/stop, caller transcription, history and diagnostics. Escape pauses capture and stops outgoing audio. The sticky header keeps pause accessible when the camera is on. Pause, hidden tabs, camera loss, multiple faces and disconnect invalidate incomplete capture/recognition work.

**Automatic silent speech is gated.** The backend has not published session-authorized visual-speech delivery or validation evidence. MediaPipe is not a word recognizer. Motion windows can include smiling, swallowing or other non-speech movement; they never become canned text or Gemini replies. No visual frames are uploaded by the current unavailable adapter. Images remain only in bounded RAM (10 seconds / 300 frames / 12 MiB maximum), with up to two queued windows and one uncertain window retained when a future validated adapter is used. No conversation/frame disk storage is added.

`src/silent/port.ts` defines a frontend-local replacement interface, not a competing backend protocol. `LiveSpeechSession` requires an intentional call-scoped activation and validated availability. It rejects pre-activation frames, stale authorization/results, duplicate IDs and unstable accepted results, aborts in-flight work on pause/end, and leaves acceptance/TTS/delivery to the server. Claude must publish the shared contract before this adapter can connect. Interface requests are in `../docs/WORKSTREAM_SOL.md`.

The prior UserPage, gesture modules, candidate reducers and browser scripts are preserved as dormant/historical infrastructure. They are not exposed by the primary route. Earlier candidate/confirmation screenshots describe the previous product, not current Mode 2 readiness.

## Checks

```
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:microphone
npm run test:vision
```

- Browser: actual authenticated backend, desktop/laptop/mobile, long caller text, keyboard, reduced motion, camera-denial recovery, zero legacy selection/confirm messages, gated activation, axe WCAG A/AA audit and backend-file denial.
- Microphone: synthesized test microphone → actual browser AudioWorklet PCM16/16k → actual server Whisper; ensures transcript reaches the new UI and no unsolicited audio is delivered. No claim of physical microphone testing or human audibility.
- Vision: recorded reference face video → real MediaPipe → real JPEG buffering/temporal motion windows; pause clears the buffer and local capture resumes. Headed Chrome is required because this environment's headless WebGL failed. No word recognition or physical silent-speech accuracy claim. Temporary media is removed.
- Outputs: `artifacts/silent-speech/`. Earlier `artifacts/ui-review/` is historical candidate-flow evidence.

## Physical checks

Run `npm run open:local` or `npm run validate:human`. Click **Set up camera**, allow Chrome camera permission and wait for **Face tracked**. Open Diagnostics, silently articulate natural phrases, then pause. Check actual captured frames, motion windows and endpoint interval. Compare relaxed expression, smiling, swallowing, head movement, loss of face, multiple faces and camera-off. No recognized words should appear until a genuine decoder is integrated. No audio should transmit while the validation gate is blocked.

Camera failure: use localhost/HTTPS, check Chrome camera permission, close other apps holding the device, turn the camera off/on. Diagnostics show whether the worker is processing fresh frames. The caller microphone remains available for backend regression: Call TACIT → Enable microphone → speak then pause; check the real transcript. Typed caller input remains a fallback. These do not validate user silent speech.

Before automatic transmission can be enabled: evaluate previously unseen genuinely silent human utterances with references; report WER, abstentions, incorrect transmissions, non-speech false triggers and measured endpoint/recognition/delivery/turn-taking latency. A human remote listener must confirm actual received words and audibility.

MediaPipe is pinned to 1.2.3 with matching local WASM/model assets. Fonts are self-hosted, SIL OFL 1.1; sources/licenses in public/ASSETS.md. Existing esbuild/fsevents lifecycle warnings were inspected: installed functionality works without script approval; no security settings were weakened.
