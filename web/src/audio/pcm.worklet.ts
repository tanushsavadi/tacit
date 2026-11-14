import { PcmEncoder } from './pcm.ts';
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class MicrophoneProcessor extends AudioWorkletProcessor {
  private enabled = false;
  private encoder = this.createEncoder();
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ enabled: boolean }>) => {
      this.enabled = e.data.enabled;
      this.encoder = this.createEncoder(); // never carry audio from a paused window into a new window
    };
  }
  private createEncoder() {
    return new PcmEncoder(sampleRate, (pcm, rms) => this.port.postMessage({ pcm, rms }, [pcm]));
  }
  process(inputs: Float32Array[][]) {
    if (this.enabled && inputs[0]?.length) this.encoder.push(inputs[0]);
    return true; // outputs remain silent; microphone monitoring is never sent to speakers
  }
}
registerProcessor('tacit-pcm16', MicrophoneProcessor);
