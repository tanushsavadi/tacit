import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { extractFeatures } from './features.ts';

let model: FaceLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      // Module workers need the SDK's ESM WASM loader (classic loaders do not register ModuleFactory).
      const vision = await FilesetResolver.forVisionTasks(msg.wasmPath, true);
      model = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: msg.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'frame' && model) {
      const started = performance.now();
      try {
        const result = model.detectForVideo(msg.bitmap, msg.t);
        const frame = extractFeatures(result, msg.t, performance.now() - started);
        const mouth = result.faceLandmarks[0]?.filter((_, i) => [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91].includes(i)).map(p => ({ x: p.x, y: p.y })) ?? [];
        self.postMessage({ type: 'result', frame, mouth });
      } finally { msg.bitmap.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
