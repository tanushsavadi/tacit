import workletUrl from './pcm.worklet.ts?worker&url';

export class MicrophoneCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private silence: GainNode | null = null;
  private generation = 0;
  private enabled = false;

  async start(onChunk: (pcm: ArrayBuffer, rms: number) => void, onFailure: (reason: string) => void) {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('Microphone capture requires localhost or HTTPS and Web Audio support.');
    const context = new AudioContext();
    this.context = context;
    await context.resume().catch(error => { this.stop(); throw error; });
    if (generation !== this.generation) return;
    if (!context.audioWorklet) { this.stop(); throw new Error('This browser does not support AudioWorklet. You can type a message instead.'); }
    const pending = navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    // A permission dialog can outlive cancellation or timeout.
    void pending.then(stream => { if (generation !== this.generation) stream.getTracks().forEach(t => t.stop()); }, () => {});
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const stream = await Promise.race([pending, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Microphone permission timed out. Check browser permissions and retry.')), 20000); })]);
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      await context.audioWorklet.addModule(workletUrl);
      if (generation !== this.generation) return;
      this.source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, 'tacit-pcm16', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.node = node;
      this.silence = context.createGain(); this.silence.gain.value = 0;
      node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
        if (generation === this.generation && this.enabled) onChunk(e.data.pcm, e.data.rms);
      };
      node.onprocessorerror = () => { if (generation === this.generation) { this.stop(); onFailure('Audio processing stopped. Enable the microphone to retry.'); } };
      stream.getAudioTracks().forEach(track => { track.onended = () => { if (generation === this.generation) { this.stop(); onFailure('Microphone disconnected. Reconnect it, then retry.'); } }; });
      this.source.connect(node); node.connect(this.silence); this.silence.connect(context.destination);
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    } finally { clearTimeout(timeout); }
  }
  setEnabled(enabled: boolean) { this.enabled = enabled; this.node?.port.postMessage({ enabled }); }
  stop() {
    this.generation++; this.enabled = false;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
    this.source?.disconnect(); this.source = null;
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); this.node = null; }
    this.silence?.disconnect(); this.silence = null;
    if (this.context) { void this.context.close().catch(() => {}); this.context = null; }
  }
}
