export interface CapturedVisualFrame { t: number; jpeg: Blob; width: number; height: number }
/** Bounded RAM only; timestamps are monotonic performance.now(), never fabricated frame rates. */
export class VisualFrameBuffer {
  private frames: CapturedVisualFrame[] = [];
  private bytes = 0;
  constructor(readonly maxMs = 10000, readonly maxBytes = 12 * 1024 * 1024, readonly maxFrames = 300) {}
  push(frame: CapturedVisualFrame) {
    if (!Number.isFinite(frame.t) || frame.jpeg.size > this.maxBytes || frame.t <= (this.frames.at(-1)?.t ?? -Infinity)) return;
    this.frames.push(frame); this.bytes += frame.jpeg.size;
    while (this.frames.length && (this.frames.length > this.maxFrames || this.bytes > this.maxBytes || frame.t - this.frames[0]!.t > this.maxMs)) this.bytes -= this.frames.shift()!.jpeg.size;
  }
  window(startMs: number, endMs: number) { return this.frames.filter(f => f.t >= startMs && f.t <= endMs); }
  clear() { this.frames = []; this.bytes = 0; }
  get stats() { return { frames: this.frames.length, bytes: this.bytes, spanMs: this.frames.length > 1 ? this.frames.at(-1)!.t - this.frames[0]!.t : 0 }; }
}
