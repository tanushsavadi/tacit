/** Local bounded PCM -> persistent whisper-server. No cloud/file fallback. */
import { randomUUID } from 'node:crypto';
import { Segmenter, type Segment } from '../stt.ts';
import { writeWav } from '../../../voice/src/audio/wav.ts';
export type Decode = (pcm:Int16Array,signal:AbortSignal)=>Promise<string>;
export function localWhisper(url:string):Decode {
  const u=new URL(url);
  if(u.protocol!=='http:' || u.hostname!=='127.0.0.1' || u.username || u.password || u.search || u.pathname!=='/')throw new Error('Flow STT must use the local loopback whisper-server.');
  return async(pcm,signal)=>{
    const form=new FormData();
    form.append('file',new Blob([new Uint8Array(writeWav(pcm,16000))],{type:'audio/wav'}),'audio.wav');
    form.append('response_format','json');form.append('temperature','0');
    const r=await fetch(`${u.origin}/inference`,{method:'POST',body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
    if(!r.ok)throw new Error('Local transcription unavailable');
    const b=await r.json() as {text?:unknown};
    if(typeof b.text!=='string' || b.text.length>2000)throw new Error('Invalid transcription');
    // Preserve disfluencies/corrections. Strip only known non-speech markers and surrounding whitespace.
    const text=b.text.trim();return /^\s*(\[.*\]|\(.*\)|\.+)?\s*$/.test(text)?'':text;
  };
}
export class Transcription {
  private seg:Segmenter; private id='';private version=0;private buffer:Int16Array[]=[];private samples=0;
  private ac:AbortController|null=null;private generation=0;private nextPartial=24000;
  private pending:{id:string;pcm:Int16Array;final:boolean;version:number}|null=null;private busy=false;
  metrics={segments:0,gaps:0,latencies:[] as number[]};
  constructor(private decode:Decode,private result:(id:string,revision:number,text:string,final:boolean)=>void,private gap:()=>void){
    this.seg=new Segmenter({sampleRate:16000,hangoverMs:550,maxSpeechMs:10000,minThreshold:150});
    this.seg.on('start',()=>{this.id=randomUUID();this.version=0;this.buffer=[];this.samples=0;this.nextPartial=24000;});
    this.seg.on('segment',(s:Segment)=>{
      this.schedule({id:this.id,pcm:s.pcm,final:true,version:++this.version});this.id='';this.buffer=[];this.samples=0;
    });
  }
  feed(pcm:Int16Array){
    this.seg.feed(pcm);
    if(this.id){
      this.buffer.push(pcm.slice());this.samples+=pcm.length;
      if(this.samples>=this.nextPartial && this.samples<=160000){
        this.nextPartial+=24000;
        const all=new Int16Array(this.samples);let offset=0;for(const b of this.buffer){all.set(b,offset);offset+=b.length;}
        this.schedule({id:this.id,pcm:all,final:false,version:++this.version});
      }
    }
  }
  private schedule(job:NonNullable<Transcription['pending']>){
    if(this.busy){
      if(this.pending?.final){this.metrics.gaps++;this.gap();return;}
      this.pending=job;return;
    }
    void this.run(job);
  }
  private async run(job:NonNullable<Transcription['pending']>){
    this.busy=true;const generation=this.generation,ac=this.ac=new AbortController(),start=Date.now();
    try{
      const text=await this.decode(job.pcm,ac.signal);
      if(!ac.signal.aborted && generation===this.generation && text)this.result(job.id,job.version,text,job.final);
      if(job.final)this.metrics.segments++;
    }catch{if(!ac.signal.aborted && generation===this.generation){this.metrics.gaps++;this.gap();}}
    finally{
      job.pcm.fill(0);
      if(generation===this.generation){
        this.busy=false;this.ac=null;this.metrics.latencies.push(Date.now()-start);this.metrics.latencies=this.metrics.latencies.slice(-100);
        const next=this.pending;this.pending=null;if(next)void this.run(next);
      }
    }
  }
  stop(){
    this.generation++;this.ac?.abort();this.ac=null;this.pending?.pcm.fill(0);this.pending=null;
    this.buffer.forEach(b=>b.fill(0));this.buffer=[];this.samples=0;this.id='';this.busy=false;
    this.seg.setEnabled(false);this.seg.removeAllListeners();
  }
}
