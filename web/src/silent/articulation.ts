import type { VisionFrame } from '../vision/features.ts';

/** Experimental motion endpointing. It detects windows worth decoding, never words or speech intent. */
export const ARTICULATION_CONFIG = { onsetMs: 160, quietMs: 480, minMs: 320, maxMs: 8000, maxGapMs: 220, preRollMs: 160, velocityThreshold: 0.55 } as const;
export interface ArticulationWindow { startMs: number; endMs: number; detectedAtMs: number; endpointMs: number; trackedFrames: number }
export interface ArticulationUpdate {
  phase: 'idle' | 'moving' | 'capturing' | 'tracking_lost';
  velocity: number;
  window: ArticulationWindow | null;
  dropped: 'tracking_lost' | 'multiple_faces' | 'frame_gap' | 'too_long' | null;
}
export class ArticulationSegmenter {
  private previous: VisionFrame | null = null;
  private onset: number | null = null;
  private start: number | null = null;
  private lastActive = 0;
  private frames = 0;
  private smoothed = 0;
  reset() { this.previous = null; this.onset = null; this.start = null; this.lastActive = 0; this.frames = 0; this.smoothed = 0; }
  update(f: VisionFrame): ArticulationUpdate {
    const out: ArticulationUpdate = { phase: 'idle', velocity: 0, window: null, dropped: null };
    if (!f.tracked || (f.faceCount ?? 1) !== 1) {
      out.dropped = (f.faceCount ?? 0) > 1 ? 'multiple_faces' : 'tracking_lost';
      out.phase = 'tracking_lost'; this.reset(); return out;
    }
    const previous = this.previous;
    if (previous && (f.t <= previous.t || f.t - previous.t > ARTICULATION_CONFIG.maxGapMs)) {
      this.reset(); this.previous = f; return { ...out, dropped: 'frame_gap', phase: 'tracking_lost' };
    }
    this.previous = f;
    if (!previous) return out;
    const dt = (f.t - previous.t) / 1000;
    // Ratios/blendshapes reduce translation effects; rapid head movement is not valid articulation evidence.
    const headMotion = Math.abs(f.yaw - previous.yaw) + Math.abs(f.pitch - previous.pitch);
    if (headMotion > 0.12) { this.reset(); this.previous = f; return { ...out, phase: 'tracking_lost', dropped: 'tracking_lost' }; }
    const velocity = (Math.abs(f.jaw - previous.jaw) * 0.45 + Math.abs(f.mouthAspect - previous.mouthAspect) * 0.4 + Math.abs(f.pucker - previous.pucker) * 0.1 + Math.abs(f.smile - previous.smile) * 0.05) / dt;
    this.smoothed = this.smoothed * 0.4 + velocity * 0.6;
    out.velocity = this.smoothed;
    const active = this.smoothed >= ARTICULATION_CONFIG.velocityThreshold;
    if (active) {
      this.onset ??= previous.t;
      this.lastActive = f.t;
      if (this.start === null && f.t - this.onset >= ARTICULATION_CONFIG.onsetMs) { this.start = Math.max(0, this.onset - ARTICULATION_CONFIG.preRollMs); this.frames = 0; }
    } else if (this.start === null) this.onset = null;
    if (this.start !== null) {
      this.frames++;
      out.phase = 'capturing';
      if (f.t - this.start >= ARTICULATION_CONFIG.maxMs) {
        this.reset(); this.previous = f; return { ...out, phase: 'idle', dropped: 'too_long' };
      }
      if (f.t - this.lastActive >= ARTICULATION_CONFIG.quietMs) {
        if (this.lastActive - this.start >= ARTICULATION_CONFIG.minMs && this.frames >= 5) {
          out.window = { startMs: this.start, endMs: this.lastActive, detectedAtMs: f.t, endpointMs: f.t - this.lastActive, trackedFrames: this.frames };
        }
        this.reset(); this.previous = f; out.phase = 'idle';
      }
    } else out.phase = active ? 'moving' : 'idle';
    return out;
  }
}
