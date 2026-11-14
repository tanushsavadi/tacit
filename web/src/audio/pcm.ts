/** Streaming area resampler. Emits 20ms mono signed PCM16 little-endian at 16kHz. */
export class PcmEncoder {
  private remaining: number;
  private weighted = 0;
  private position = 0;
  private output = new ArrayBuffer(640);
  private energy = 0;
  private readonly ratio: number;
  constructor(inputRate: number, private emit: (pcm: ArrayBuffer, rms: number) => void) {
    if (!Number.isFinite(inputRate) || inputRate < 8000) throw new Error('Invalid microphone sample rate');
    this.ratio = inputRate / 16000;
    this.remaining = this.ratio;
  }
  push(channels: Float32Array[]) {
    const length = channels[0]?.length ?? 0;
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (const channel of channels) sample += Number.isFinite(channel[i]) ? channel[i]! : 0;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      let available = 1;
      while (available > 1e-8) {
        const take = Math.min(available, this.remaining);
        this.weighted += sample * take;
        available -= take;
        this.remaining -= take;
        if (this.remaining < 1e-8) {
          const value = this.weighted / this.ratio;
          new DataView(this.output).setInt16(this.position * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
          this.energy += value * value;
          this.position++;
          this.remaining = this.ratio; this.weighted = 0;
          if (this.position === 320) {
            this.emit(this.output, Math.sqrt(this.energy / 320));
            this.output = new ArrayBuffer(640); this.position = 0; this.energy = 0;
          }
        }
      }
    }
  }
}
