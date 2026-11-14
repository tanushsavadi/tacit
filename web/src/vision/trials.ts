import type { VisionFrame } from './features.ts';
import { MouthGestureRecognizer } from './recognizer.ts';

export type TrialOutcome = 'correct' | 'wrong' | 'abstained' | 'tracking_failure' | 'interrupted';
export interface GestureTrial {
  target: number; selected: number | null; outcome: TrialOutcome;
  startedAt: number; endedAt: number; durationMs: number;
  frames: number; trackedFrames: number; trackingLosses: number;
}
/** In-memory experiment. No socket calls, proposals, confirmation or audio. */
export class GestureTrialSession {
  private recognizer = new MouthGestureRecognizer();
  private started = 0;
  private epoch = 0;
  private target = 0;
  private frames = 0;
  private tracked = 0;
  private losses = 0;
  private wasTracked = false;
  private lastFrame = -1;
  private neutralSince: number | null = null;
  private armed = false;
  private running = false;
  readonly duration = 8000;
  calibrate(frames: VisionFrame[]) { return this.recognizer.calibrate(frames); }
  start(target: number, time: number, epoch: number) {
    this.recognizer.reset(); this.target = target; this.started = time; this.epoch = epoch;
    this.frames = 0; this.tracked = 0; this.losses = 0; this.wasTracked = false;
    this.lastFrame = -1; this.neutralSince = null; this.armed = false; this.running = true;
  }
  get isArmed() { return this.armed; }
  private finish(outcome: TrialOutcome, selected: number | null, time: number, epoch: number): GestureTrial {
    this.running = false;
    return { target: this.target, selected, outcome, startedAt: this.epoch, endedAt: epoch, durationMs: Math.max(0, time - this.started), frames: this.frames, trackedFrames: this.tracked, trackingLosses: this.losses };
  }
  update(frame: VisionFrame, time: number, epoch: number): GestureTrial | null {
    if (!this.running) return null;
    if (frame.t >= this.started && frame.t !== this.lastFrame && time - frame.t < 600) {
      const previous = this.lastFrame;
      this.lastFrame = frame.t; this.frames++;
      const gap = previous >= 0 && frame.t - previous > 250;
      if ((this.wasTracked && !frame.tracked) || (gap && this.wasTracked)) this.losses++;
      this.wasTracked = frame.tracked;
      if (frame.tracked) this.tracked++;
      const ranking = this.recognizer.update(frame, { candidateSetId: `experiment-${this.epoch}`, enabled: true });
      if (!this.armed) {
        if (frame.tracked && !gap && Math.max(...ranking.scores, 0) < 0.22) {
          this.neutralSince ??= frame.t;
          if (frame.t - this.neutralSince >= 350) { this.armed = true; this.recognizer.reset(); }
        } else this.neutralSince = null;
      } else if (ranking.selectedIndex !== null) {
        return this.finish(ranking.selectedIndex === this.target ? 'correct' : 'wrong', ranking.selectedIndex, time, epoch);
      }
    }
    if (time - this.started >= this.duration) return this.finish(this.tracked < 10 || !this.wasTracked || (this.lastFrame >= 0 && time - this.lastFrame > 600) ? 'tracking_failure' : 'abstained', null, time, epoch);
    return null;
  }
  interrupt(time: number, epoch: number) { return this.running ? this.finish('interrupted', null, time, epoch) : null; }
}
