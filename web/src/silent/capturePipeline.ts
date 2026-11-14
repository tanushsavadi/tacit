import type { VisionFrame } from '../vision/features.ts';
import { ArticulationSegmenter } from './articulation.ts';
import { VisualFrameBuffer, type CapturedVisualFrame } from './frameBuffer.ts';
import { CaptureTelemetry } from './captureTelemetry.ts';

/** Shared by live capture and recorded-input evaluation. Epoch invalidates asynchronous JPEG work. */
export class SilentCapturePipeline {
  readonly buffer = new VisualFrameBuffer();
  readonly telemetry = new CaptureTelemetry();
  private segmenter = new ArticulationSegmenter();
  private epoch = 0;
  get ticket() { return this.epoch; }
  clear() { this.epoch++; this.buffer.clear(); this.segmenter.reset(); }
  capture(frame: CapturedVisualFrame, ticket: number) {
    if (ticket !== this.epoch) { this.telemetry.rejected++; return false; }
    const accepted = this.buffer.push(frame);
    if (accepted) this.telemetry.sample(frame.t, frame.deliveredAtMs); else this.telemetry.rejected++;
    return accepted;
  }
  observe(frame: VisionFrame) {
    const update = this.segmenter.update(frame);
    if (update.dropped) { this.epoch++; this.buffer.clear(); }
    return update;
  }
}
