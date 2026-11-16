> **Archived on `experiment/tacit-flow` (2026-11-16).** Source of the isolated Flow demo package. The scripts'
> `candidate/` directory was a copy of this repository: to run it, place or symlink a checkout of this branch at
> `flow-demo/candidate` and run `npm i` here. Logs, builds, recordings and evidence captures were left out on purpose.
> NO-GO for promotion; see `docs/flow/`.

# TACIT Flow Demo

**READY for a local interactive demonstration. Overall verdict: PARTIAL — remote Meet audibility is UNVERIFIED.**

Double-click **start.command**. The separately identified native app opens with a Demo Control Center and the real TACIT notch. Scenario A is loaded; Start, then Next event. No bot, meeting, camera, or incoming recording is needed.

The default is real TTS into this Mac's physical speakers/headphones, visibly labelled **LOCAL REHEARSAL AUDIO**. Voice starts OFF. Choose My Voice, enable voice, and press Speak for each exact message. No global audio device settings change; the stable BlackHole runtime remains untouched.

- [Presenter/runbook, setup, Meet checklist and recovery](runbooks/DEMO_RUNBOOK.md)
- [Actual build, tests, rehearsals and limitations](runbooks/VERIFICATION.md)
- [90-second and three-minute scripts](runbooks/PRESENTER_SCRIPTS.md)
- [Synthetic input fixtures](demo/flow/scenarios.json)
- [Typed adapter](runtime/provider.ts), [authenticated service](runtime/service.ts)
- [Genuine Gemini metadata](evidence/gemini-native/gemini-operations.json)
- [Five runs of all three scenarios](evidence/native-five-run/rehearsal.json)
- [Actual local-TTS/route rehearsal](evidence/real-local-audio/rehearsal.json)
- [Genuine app captures](evidence/real-local-audio/)

Stop only this demo: double-click **stop.command**. Reset/relaunch: **reset.command**. During a presentation use the native controls; no terminal commands are needed.

Before a Meet demonstration, close this demo and the stable runtime yourself during an idle window. From this folder run `./start.command --with-output`. The launcher refuses a competing speech router. Set Meet's microphone to BlackHole 16ch yourself; headphones remain the output. Only a consenting remote listener can verify remote audibility. To return to local-only operation, stop this demo, then double-click start.command again. `./start.command --silent` starts with output disabled.

Development-only automated rehearsal: `./rehearse.command` (five A/B/C runs; explicitly MOCKED TTS/route), `./rehearse.command live` (two actual Gemini calls, synthetic text, no speech), or `./rehearse.command audio` (one A/B/C run with real local speech and Stop). These stop only the demo first. Do not run automated rehearsals during judging.

This is a local development package. Node dependency links and native route/voice helper links refer to the existing engineering candidate. The server sources, shared protocol and audio authorization code are unchanged snapshots. Stable source/deployed app, secrets, model data, database and capture permissions are not part of this package. Credentials are read locally at runtime through the existing environment; never distribute data/ or candidate/server/data/.
