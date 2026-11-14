import type { VisionFrame } from './features.ts';

export const GESTURES = ['Open mouth', 'Smile', 'Pucker'] as const;
export interface RecognitionContext { candidateSetId: string | null; enabled: boolean }
export interface VisualRanking {
  scores: number[]; bestIndex: number | null; progress: number;
  selectedIndex: number | null; candidateSetId: string | null;
}
export const emptyRanking = (): VisualRanking => ({ scores: [], bestIndex: null, progress: 0, selectedIndex: null, candidateSetId: null });
/** Replace this interface with a personalized temporal model without changing UI/call control. */
export interface VisualRecognizer {
  readonly method: string;
  update(frame: VisionFrame, context: RecognitionContext): VisualRanking;
  calibrate(frames: VisionFrame[]): boolean;
  reset(): void;
}

/** Experimental gesture strength + 900 ms hold. Does not recognize phrases. */
export class MouthGestureRecognizer implements VisualRecognizer {
  readonly method = 'neutral-calibrated mouth gestures · heuristic';
  private baseline = [0, 0, 0];
  private setId: string | null = null;
  private held: number | null = null;
  private since = 0;
  private last = 0;
  private locked = false;
  private neutralSince: number | null = null;

  calibrate(frames: VisionFrame[]) {
    const valid = frames.filter(f => f.tracked);
    if (valid.length < 10 || valid.at(-1)!.t - valid[0]!.t < 600) return false;
    this.baseline = ['jaw', 'smile', 'pucker'].map(k => valid.reduce((sum, f) => sum + f[k as 'jaw' | 'smile' | 'pucker'], 0) / valid.length);
    this.reset();
    return true;
  }
  reset() { this.held = null; this.since = 0; this.last = 0; this.locked = false; this.neutralSince = null; }
  update(f: VisionFrame, ctx: RecognitionContext): VisualRanking {
    if (ctx.candidateSetId !== this.setId) { this.reset(); this.setId = ctx.candidateSetId; }
    if (!ctx.enabled || !ctx.candidateSetId || !f.tracked) { this.reset(); return emptyRanking(); }
    if (this.last && (f.t - this.last > 250 || f.t <= this.last)) this.reset();
    this.last = f.t;
    const scores = [f.jaw, f.smile, f.pucker].map((x, i) => Math.max(0, Math.min(1, (x - this.baseline[i]!) / Math.max(0.15, 1 - this.baseline[i]!))));
    const sorted = scores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const best = sorted[0]!;
    const accepted = best.v >= 0.55 && best.v - sorted[1]!.v >= 0.18;
    if (best.v < 0.22) {
      this.neutralSince ??= f.t;
      if (f.t - this.neutralSince >= 350) this.locked = false;
    } else this.neutralSince = null;
    if (!accepted || this.locked) { this.held = null; return { ...emptyRanking(), scores, candidateSetId: ctx.candidateSetId }; }
    if (this.held !== best.i) { this.held = best.i; this.since = f.t; }
    const progress = Math.min(1, (f.t - this.since) / 900);
    if (progress === 1) this.locked = true;
    return { scores, bestIndex: best.i, progress, selectedIndex: progress === 1 ? best.i : null, candidateSetId: ctx.candidateSetId };
  }
}
