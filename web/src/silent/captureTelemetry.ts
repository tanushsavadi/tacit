/** Rolling source-time statistics. No estimate of JS heap or model confidence. */
export class CaptureTelemetry {
  private times: number[] = [];
  private deliveryTimes: number[] = [];
  captured = 0;
  rejected = 0;
  busySkips = 0;
  sourceDrops = 0;
  injectedDrops = 0;
  browserDrops: number | null = null;
  sample(t: number, deliveredAt = t) {
    if (!Number.isFinite(t) || t <= (this.times.at(-1) ?? -Infinity)) { this.rejected++; return; }
    this.captured++; this.times.push(t);
    this.deliveryTimes.push(deliveredAt);
    if (this.times.length > 250) this.times.shift();
    if (this.deliveryTimes.length > 250) this.deliveryTimes.shift();
  }
  get stats() {
    const intervals = this.times.slice(1).map((t, i) => t - this.times[i]!);
    const mean = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
    const jitter = intervals.length ? Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length) : 0;
    const deliverySpan = this.deliveryTimes.length > 1 ? this.deliveryTimes.at(-1)! - this.deliveryTimes[0]! : 0;
    return { captured: this.captured, rejected: this.rejected, busySkips: this.busySkips, sourceDrops: this.sourceDrops, injectedDrops: this.injectedDrops, browserDrops: this.browserDrops,
      deliveryFps: deliverySpan > 0 ? (this.deliveryTimes.length - 1) * 1000 / deliverySpan : null,
      fps: mean ? 1000 / mean : null, jitterMs: intervals.length ? jitter : null, maxGapMs: intervals.length ? Math.max(...intervals) : null };
  }
}
/** Deadline accumulation avoids reducing a 30 fps camera to 15 fps when targeting 25. */
export class SampleClock {
  private next = -Infinity;
  constructor(readonly intervalMs = 40) {}
  due(t: number) {
    if (t + 0.001 < this.next) return false;
    this.next = this.next === -Infinity ? t + this.intervalMs : this.next + (Math.floor(Math.max(0, t - this.next) / this.intervalMs) + 1) * this.intervalMs;
    return true;
  }
}
