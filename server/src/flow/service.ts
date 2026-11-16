import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { FlowState } from './state.ts';
import { SemanticEngine, type Model } from './semantic.ts';
import { Transcription, type Decode } from './transcription.ts';
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const command=z.discriminatedUnion('type',[
  z.object({type:z.literal('start'),participantsAgreed:z.boolean(),textConsent:z.boolean()}).strict(),
  z.object({type:z.enum(['stop','pause','pair','clear','analyse'])}).strict(),
  z.object({type:z.literal('select'),turnId:z.string().max(90),revision:z.number().int(),anchorId:z.string().max(160).optional()}).strict(),
  z.object({type:z.literal('edit'),id:z.string().max(90),version:z.number().int(),text:z.string().max(500)}).strict(),
  z.object({type:z.enum(['save','discard']),id:z.string().max(90)}).strict(),
  z.object({type:z.literal('acknowledge'),id:z.string().max(90),change:z.string().max(250)}).strict()
]);
export interface FlowOptions { token:string; decode:Decode; model:Model|null; policyVerified:boolean; port?:number; onInvalidate?:()=>void }
/** Single native owner, single one-use paired source. Private data never enters the legacy snapshot. */
export class FlowService {
  readonly state=new FlowState();readonly semantic:SemanticEngine;
  private http=createServer((_,r)=>r.writeHead(404).end());
  private wss=new WebSocketServer({noServer:true,maxPayload:10000,perMessageDeflate:false});
  private owner:WebSocket|null=null;private source:WebSocket|null=null;private transcriber:Transcription|null=null;
  private pairing:{token:string;expires:number;epoch:number}|null=null;
  private sequence=0;private audioStart=0;private audioBytes=0;private timer:ReturnType<typeof setTimeout>|null=null;
  private sourceLease:ReturnType<typeof setTimeout>|null=null;
  private pending=new Set<WebSocket>();private heartbeat:ReturnType<typeof setInterval>;
  constructor(private o:FlowOptions){
    if(o.token.length<24)throw new Error('Flow requires authentication');
    this.semantic=new SemanticEngine(o.model);
    this.http.on('upgrade',(req,socket,head)=>{
      const host=req.headers.host;
      const localPort=(this.http.address() as {port:number}|null)?.port;
      const origin=req.headers.origin;
      if(req.url!=='/flow' || host!==`127.0.0.1:${localPort}` || this.wss.clients.size>=6){socket.destroy();return;}
      const native=!origin&&equal(req.headers.authorization??'',`Bearer ${o.token}`);
      const extension=!!origin&&/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      if(!native&&!extension){socket.destroy();return;}
      this.wss.handleUpgrade(req,socket,head,ws=>{
        if(native){
          if(this.owner){ws.close(1008,'Owner already connected');return;}
          this.owner=ws;this.notify();this.bindOwner(ws);
        }else this.bindSource(ws);
      });
    });
    const alive=new WeakMap<WebSocket,boolean>();
    this.wss.on('connection',()=>{});
    this.heartbeat=setInterval(()=>{
      for(const ws of this.wss.clients){if(alive.get(ws)===false){ws.terminate();continue;}alive.set(ws,false);ws.ping();ws.once('pong',()=>alive.set(ws,true));}
    },3000);
    this.heartbeat.unref();
  }
  async listen(){await new Promise<void>((resolve,reject)=>{this.http.once('error',reject);this.http.listen(this.o.port??18892,'127.0.0.1',resolve);});return (this.http.address() as {port:number}).port;}
  private send(ws:WebSocket|null,obj:unknown){if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>128000){ws.terminate();return;}ws.send(JSON.stringify(obj));}}
  private notify=()=>this.send(this.owner,{type:'state',snapshot:this.state.snapshot(),providerPolicyVerified:this.o.policyVerified});
  private bindOwner(ws:WebSocket){
    let messages=0,at=Date.now();
    ws.on('message',(data,binary)=>{
      if(Date.now()-at>=1000){at=Date.now();messages=0;}
      if(binary || ++messages>30){ws.close(1008,'Invalid control traffic');return;}
      try{
        const c=command.parse(JSON.parse(data.toString()));
        switch(c.type){
          case 'start':
            if(c.textConsent&&!this.o.policyVerified)throw new Error('Gemini text processing needs verified provider terms for this project. Local Flow is available.');
            if(!c.participantsAgreed || !['off','paused'].includes(this.state.state))throw new Error('Confirm consent after stopping the previous source.');
            this.releaseCapture();this.state.start(c.participantsAgreed,c.textConsent);break;
          case 'stop':this.stop();break;
          case 'pause':this.releaseCapture();this.state.pause();break;
          case 'clear':this.semantic.cancel();this.o.onInvalidate?.();this.state.clearContext();break;
          case 'analyse':void this.semantic.run(this.state,this.notify);break;
          case 'pair':{
            if(this.state.state!=='armed')throw new Error('Enable Flow and confirm participants first.');
            const token=randomBytes(24).toString('hex');this.pairing={token,expires:Date.now()+60000,epoch:this.state.epoch};
            this.send(ws,{type:'pairing',token,expires:this.pairing.expires});break;
          }
          case 'select':{
            this.semantic.cancel();this.o.onInvalidate?.();const t=this.state.turns.find(t=>t.id===c.turnId&&t.revision===c.revision&&t.final);
            if(!t)throw new Error('Question changed. Select current context.');
            const a=c.anchorId?this.state.anchors.find(a=>a.id===c.anchorId&&a.source.turnId===t.id&&a.source.revision===t.revision):null;
            if(c.anchorId&&!a)throw new Error('That question is no longer current.');
            this.state.select(a?.source??{turnId:t.id,revision:t.revision,start:0,end:Math.min(t.text.length,500),quote:t.text.slice(0,500)});
            break;
          }
          case 'edit':this.state.edit(c.id,c.version,c.text);break;
          case 'save':this.state.save(c.id);break;
          case 'discard':this.state.discard(c.id);break;
          case 'acknowledge':this.state.acknowledge(c.id,c.change);break;
        }
        this.notify();
      }catch{this.send(ws,{type:'error',message:'Flow action unavailable. Check consent, source or draft revision. Your words are kept.'});}
    });
    ws.on('close',()=>{if(this.owner===ws){this.stop();this.owner=null;}});
    ws.on('error',()=>{if(this.owner===ws)this.stop();ws.terminate();});
  }
  private bindSource(ws:WebSocket){
    this.pending.add(ws);let authenticated=false;
    const authTimer=setTimeout(()=>ws.close(1008,'Pairing required'),3000);
    ws.on('message',(data,binary)=>{
      try{
        if(!authenticated){
          if(binary)throw 0;
          const m=z.object({type:z.literal('pair'),token:z.string().length(48),source:z.literal('Selected Google Meet tab'),sampleRate:z.literal(16000),channels:z.literal(1),format:z.literal('pcm16le')}).strict().parse(JSON.parse(data.toString()));
          const p=this.pairing;
          if(!p||p.expires<Date.now()||p.epoch!==this.state.epoch||!equal(p.token,m.token)||this.source||!this.owner)throw 0;
          this.pairing=null;this.state.attachSource(m.source);authenticated=true;clearTimeout(authTimer);this.pending.delete(ws);this.source=ws;
          this.sequence=0;this.audioStart=Date.now();this.audioBytes=0;
          this.sourceLease=setTimeout(()=>{this.pause();this.state.status='Flow listening expired. Confirm and choose the source again.';this.notify();},20*60*1000);
          this.transcriber=new Transcription(this.o.decode,(id,revision,text,final)=>{
            if(this.source!==ws)return;
            this.state.transcript(id,revision,text,final);this.notify();if(final&&worthInterpreting(text,this.state.drafts.length>0))this.queueSemantic();
          },()=>{this.semantic.cancel();this.state.status='Audio/transcription gap · inspect context before relying on it';this.notify();});
          this.send(ws,{type:'ready',epoch:this.state.epoch});this.notify();return;
        }
        if(!binary || this.source!==ws || this.state.state!=='capturing')throw 0;
        const b=Buffer.from(data as Buffer);
        // Explicit frame: epoch u32, sequence u32, exactly 100 ms mono PCM16LE.
        if(b.length!==3208||b.readUInt32LE(0)!==this.state.epoch||b.readUInt32LE(4)!==this.sequence++)throw 0;
        this.audioBytes+=3200;
        if(this.audioBytes>32000*((Date.now()-this.audioStart)/1000+1))throw 0;
        const pcm=new Int16Array(1600);for(let i=0;i<1600;i++)pcm[i]=b.readInt16LE(8+i*2);
        this.transcriber?.feed(pcm);pcm.fill(0);
      }catch{
        // Invalid framing stops processing immediately, without waiting for a peer's close handshake.
        if(this.source===ws){this.releaseCapture();this.state.pause();this.state.status='Capture stopped: invalid or interrupted audio source.';this.notify();}
        ws.close(1008,'Capture stopped');
      }
    });
    ws.on('close',()=>{clearTimeout(authTimer);this.pending.delete(ws);if(this.source===ws){this.releaseCapture();this.state.pause();this.state.status='Capture disconnected. Drafts kept; choose the source again.';this.notify();}});
    ws.on('error',()=>{if(this.source===ws)this.pause();ws.terminate();});
  }
  private queueSemantic(){
    // Any source revision immediately invalidates current work. Coalesce final turns, max 8/min, not PCM chunks.
    this.semantic.cancel();if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;void this.semantic.run(this.state,this.notify);},700);
  }
  private releaseCapture(){
    this.o.onInvalidate?.();
    this.semantic.cancel();if(this.timer)clearTimeout(this.timer);this.timer=null;this.pairing=null;
    if(this.sourceLease)clearTimeout(this.sourceLease);this.sourceLease=null;
    this.transcriber?.stop();this.transcriber=null;
    const old=this.source;this.source=null;this.send(old,{type:'stop'});old?.close(1000,'Capture stopped');
    for(const ws of this.pending)ws.close(1008,'Pairing ended');this.pending.clear();
  }
  stop(){this.releaseCapture();this.state.stop();this.notify();}
  pause(){this.releaseCapture();this.state.pause();this.notify();}
  async close(){this.stop();clearInterval(this.heartbeat);for(const w of this.wss.clients)w.terminate();this.wss.close();await new Promise<void>(r=>this.http.close(()=>r()));}
  allowsContext(text:unknown){
    if(typeof text!=='string'||!this.o.policyVerified||!this.state.textConsent||this.state.state!=='capturing')return false;
    return this.state.drafts.some(d=>{
      if(!d.anchor||!this.state.valid(d.anchor))return false;
      const update=this.state.relevant(d).at(-1);
      return text===d.anchor.quote+(update?'\nLater: '+update.after.quote:'');
    });
  }
}
/** Inference is never driven by audio chunks. Explicit Inspect/Analyse remains available for missed cues. */
export function worthInterpreting(text:string,hasDraft:boolean){
  return /\?|\b(could|would|can|wonder|actually|correction|instead|make that|meant|only if|moved|increased|decreased|no longer|rather|changed|deadline|budget|proposal|moving on|different topic)\b/i.test(text)
    || (hasDraft&&/\b(now|later|earlier|unless|provided|but|however|not|\d+)\b/i.test(text));
}
