# Frontend assets

- `models/face_landmarker.task`: Google's MediaPipe Face Landmarker float16 v1, downloaded from https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task . Model information: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker . No phrase-recognition capability is implied.
- `mediapipe/*`: unmodified WASM/loaders copied from installed `@mediapipe/tasks-vision` 1.2.3. Keep these matched to the installed SDK. This SDK includes an ESM loader; `forVisionTasks(path, true)` is necessary in a module worker.
- `fonts/*`: unmodified Manrope and DM Sans variable fonts from Google Fonts' `ofl/manrope` and `ofl/dmsans` directories. SIL OFL 1.1 license files included.
- `favicon.svg`: TACIT letterform mark.
