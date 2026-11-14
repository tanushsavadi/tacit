# Third-party code, models and tools used by TACIT

TACIT is a HackUMass XIV project. This file records pre-existing work it reuses or depends on.

## Code adapted into this repository
| Component | Upstream | Licence | Where | What changed |
|---|---|---|---|---|
| Fast joint CTC/attention beam search (KV-cached decoder steps, NumPy CTC prefix scorer) | [SilentFlow](https://github.com/ahosseini06/silent-flow) `inference/fast_step.py`, `inference/fast_beam.py` at commit `44b4f9fdfd7cb5939150a4db3bdcfd840e6f0c42`, © 2026 Ali Hosseini | MIT (notice kept in the file header) | `recognition/tacit_vsr/fast_beam.py` | Merged into one module, LM optional, repeated-n-gram ban off by default (`no_repeat=0`) to match ESPnet scoring. Selected by `TACIT_DECODER=fast` (default); `TACIT_DECODER=espnet` reverts. |

## Reviewed as references only (no code copied)
| Project | Commit inspected | Licence | Used for |
|---|---|---|---|
| [Lipflow](https://github.com/amywork777/lipflow) | `3aac76ca8d505f663aec60ca20841e2b6202bf6e` | MIT (+NOTICE) | Model prewarming idea (TACIT warms its own service at start-up). |
| [Hushkey](https://github.com/amirrsyed/hushkey) | `f6437d8ca701bd0ea3d804d76566c3c64d97127d` | MIT (+NOTICE) | Menu-bar lifecycle and motion-gate design reference. |

## Runtime dependencies (not vendored in Git)
| Component | Licence | Notes |
|---|---|---|
| Auto-AVSR visual-only weights `LRS3_V_WER19.1` (mpc001) | **Research / non-commercial only** (custom licence) | Downloaded into `third_party/visual/weights/` (git-ignored). TACIT is not commercial-ready while it depends on these weights. |
| ESPnet, Auto-AVSR, chaplin model code | Apache-2.0 / MIT | `third_party/visual/` (git-ignored clones). |
| MediaPipe (FaceMesh / Tasks Vision) | Apache-2.0 | Face landmarks in `recognition/` and `web/`. |
| PyTorch, NumPy, PyAV, sentencepiece | BSD / Apache-2.0 | Python environment `recognition/.venv`. |
| whisper.cpp + `ggml-base.en` | MIT | Speech-to-text for the legacy browser-caller path. |
| [BlackHole](https://github.com/ExistentialAudio/BlackHole) virtual audio driver | GPL-3.0 | Installed separately by the user (`brew install blackhole-2ch`); TACIT does not bundle or modify it and only talks to it through Core Audio. |
| macOS `say` (system voice), AVFoundation, Core Audio | Apple system frameworks | |
| ElevenLabs API (optional) | Commercial service | Only with the user's own consented voice (`ELEVENLABS_VOICE_CONSENT=self`). |
| CREMA-D clips (evaluation only) | ODbL-1.0 / DbCL-1.0 | Voiced actor recordings; git-ignored; used for offline benchmarks, never as silent-speech evidence. |
