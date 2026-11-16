class TacitPCM extends AudioWorkletProcessor {
  constructor(){super();this.samples=new Int16Array(1600);this.offset=0;}
  process(inputs){
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){
      let v=0;for(const c of channels)v+=c[i];v/=channels.length;
      this.samples[this.offset++]=Math.round(Math.max(-1,Math.min(1,v))*(v<0?32768:32767));
      if(this.offset===1600){this.port.postMessage(this.samples.buffer,[this.samples.buffer]);this.samples=new Int16Array(1600);this.offset=0;}
    }return true;
  }
}
registerProcessor('tacit-pcm',TacitPCM);
