import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export interface VisionFrame {
  t: number; tracked: boolean; jaw: number; smile: number; pucker: number;
  mouthAspect: number; yaw: number; pitch: number; inferenceMs: number;
  faceCount?: number;
  /** Present only for explicitly recorded-input evaluation; source PTS, not delivery time. */
  mediaTimeMs?: number;
}
export const emptyFrame = (t = 0): VisionFrame => ({ t, tracked: false, jaw: 0, smile: 0, pucker: 0, mouthAspect: 0, yaw: 0, pitch: 0, inferenceMs: 0 });

/** Blendshape coefficients are expression signals, never word probabilities. */
export function extractFeatures(result: FaceLandmarkerResult, t: number, inferenceMs: number): VisionFrame {
  const pts = result.faceLandmarks[0];
  if (!pts?.[291] || !pts[61] || !pts[13] || !pts[14] || !pts[1] || !pts[33] || !pts[263]) return { ...emptyFrame(t), inferenceMs, faceCount: result.faceLandmarks.length };
  const coeff = new Map(result.faceBlendshapes[0]?.categories.map(c => [c.categoryName, c.score]) ?? []);
  const width = Math.hypot(pts[291].x - pts[61].x, pts[291].y - pts[61].y);
  const eyeWidth = Math.abs(pts[263].x - pts[33].x);
  const eyeX = (pts[263].x + pts[33].x) / 2;
  const eyeY = (pts[263].y + pts[33].y) / 2;
  return {
    t, tracked: true, inferenceMs, faceCount: result.faceLandmarks.length,
    jaw: coeff.get('jawOpen') ?? 0,
    smile: ((coeff.get('mouthSmileLeft') ?? 0) + (coeff.get('mouthSmileRight') ?? 0)) / 2,
    pucker: coeff.get('mouthPucker') ?? 0,
    mouthAspect: Math.hypot(pts[14].x - pts[13].x, pts[14].y - pts[13].y) / Math.max(width, 0.001),
    yaw: (pts[1].x - eyeX) / Math.max(eyeWidth, 0.001),
    pitch: (pts[1].y - eyeY) / Math.max(eyeWidth, 0.001),
  };
}
