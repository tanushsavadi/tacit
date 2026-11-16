import { afterEach,describe,it,expect } from 'vitest';
import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import { FlowService } from './service.ts';
const services:FlowService[]=[],sockets:WebSocket[]=[];
afterEach(async()=>{for(const w of sockets.splice(0))w.terminate();for(const s of services.splice(0))await s.close();});
async function setup(verified=true){const token=randomBytes(32).toString('hex'),service=new FlowService({token,decode:async()=>'',model:null,policyVerified:verified,port:0});services.push(service);const port=await service.listen();return {service,token,url:`ws://127.0.0.1:${port}/flow`};}
function connect(url:string,options:WebSocket.ClientOptions={}){const w=new WebSocket(url,options);sockets.push(w);w.on('error',()=>{});return w;}
function next(w:WebSocket,predicate:(x:any)=>boolean=()=>true):Promise<any>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{w.off('message',handler);reject(new Error('missing test event'));},1500);const handler=(b:Buffer)=>{const v=JSON.parse(b.toString());if(predicate(v)){clearTimeout(timer);w.off('message',handler);resolve(v);}};w.on('message',handler);});}
async function owner(s:Awaited<ReturnType<typeof setup>>){const w=connect(s.url,{headers:{Authorization:`Bearer ${s.token}`}});await next(w);return w;}
async function send(w:WebSocket,m:object){const p=next(w);w.send(JSON.stringify(m));return p;}
async function pair(s:Awaited<ReturnType<typeof setup>>,w:WebSocket){await send(w,{type:'start',participantsAgreed:true,textConsent:false});return (await send(w,{type:'pair'})).token as string;}
describe('real loopback Flow WebSocket isolation',()=>{
  it('requires native authentication and rejects browser page origins',async()=>{const s=await setup();for(const options of [{},{headers:{Origin:'https://evil.test',Authorization:`Bearer ${s.token}`}}]){const w=connect(s.url,options);await new Promise(r=>w.once('close',r));expect(w.readyState).toBe(WebSocket.CLOSED);}});
  it('rejects host spoofing, unknown paths and tokens in URLs',async()=>{const s=await setup();for(const [url,headers]of [[s.url,{Host:'evil.test',Authorization:`Bearer ${s.token}`}],[s.url+'?token='+s.token,{Authorization:`Bearer ${s.token}`}]] as const){const w=connect(url,{headers});await new Promise(r=>w.once('close',r));expect(w.readyState).toBe(WebSocket.CLOSED);}});
  it('never exposes private snapshot to a second owner',async()=>{const s=await setup();await owner(s);const second=connect(s.url,{headers:{Authorization:`Bearer ${s.token}`}});let count=0;second.on('message',()=>count++);await new Promise(r=>second.once('close',r));expect(count).toBe(0);});
  it('requires participant agreement and verified text policy',async()=>{const s=await setup(false),w=await owner(s);expect((await send(w,{type:'start',participantsAgreed:false,textConsent:false})).type).toBe('error');expect((await send(w,{type:'start',participantsAgreed:true,textConsent:true})).type).toBe('error');expect(s.service.state.state).toBe('off');});
  it('pairs one source using an expiring one-use capture-only capability',async()=>{const s=await setup(),w=await owner(s),token=await pair(s,w);const src=connect(s.url,{origin:`chrome-extension://${'a'.repeat(32)}`});await new Promise(r=>src.once('open',r));const ready=await send(src,{type:'pair',token,source:'Selected Google Meet tab',sampleRate:16000,channels:1,format:'pcm16le'});expect(ready.type).toBe('ready');expect(s.service.state.state).toBe('capturing');src.send(JSON.stringify({type:'stop'}));await new Promise(r=>src.once('close',r));expect(s.service.state.state).toBe('paused');});
  it('rejects replayed pairing and invalid PCM epoch/sequence',async()=>{const s=await setup(),w=await owner(s),token=await pair(s,w);const src=connect(s.url,{origin:`chrome-extension://${'a'.repeat(32)}`});await new Promise(r=>src.once('open',r));await send(src,{type:'pair',token,source:'Selected Google Meet tab',sampleRate:16000,channels:1,format:'pcm16le'});const again=connect(s.url,{origin:`chrome-extension://${'b'.repeat(32)}`});await new Promise(r=>again.once('open',r));again.send(JSON.stringify({type:'pair',token,source:'Selected Google Meet tab',sampleRate:16000,channels:1,format:'pcm16le'}));await new Promise(r=>again.once('close',r));const bad=Buffer.alloc(3208);bad.writeUInt32LE(999);src.send(bad);await new Promise(r=>src.once('close',r));expect(s.service.state.state).toBe('paused');});
  it('native Stop cuts source and clears context synchronously',async()=>{const s=await setup(),w=await owner(s);await pair(s,w);await send(w,{type:'stop'});expect(s.service.state.state).toBe('off');expect(s.service.state.turns).toHaveLength(0);});
  it('owner loss invalidates source and every authorization epoch',async()=>{const s=await setup(),w=await owner(s);await pair(s,w);const epoch=s.service.state.epoch;w.close();await new Promise(r=>w.once('close',r));await new Promise(r=>setTimeout(r,5));expect(s.service.state.state).toBe('off');expect(s.service.state.epoch).toBeGreaterThan(epoch);});
  it('meeting-selected HMR context requires exact current selection and separate text consent',async()=>{
    const s=await setup(),state=s.service.state;state.start(true,true);state.attachSource('Selected Google Meet tab');
    state.transcript('t1',1,'Can we meet Thursday?',true);state.select({turnId:'t1',revision:1,start:0,end:21,quote:'Can we meet Thursday?'});
    expect(s.service.allowsContext('Can we meet Thursday?')).toBe(true);
    expect(s.service.allowsContext('Send other private context')).toBe(false);
    state.pause();expect(s.service.allowsContext('Can we meet Thursday?')).toBe(false);
  });
  it('a transcript revision revokes previously imported context',async()=>{
    const s=await setup(),state=s.service.state;state.start(true,true);state.attachSource('Selected Google Meet tab');
    state.transcript('t1',1,'Earlier question?',true);state.select({turnId:'t1',revision:1,start:0,end:17,quote:'Earlier question?'});
    state.transcript('t1',2,'Revised question?',true);expect(s.service.allowsContext('Earlier question?')).toBe(false);
  });
  it('selects the exact question ID when one turn contains multiple questions',async()=>{
    const s=await setup(),w=await owner(s);await send(w,{type:'start',participantsAgreed:true,textConsent:false});s.service.state.attachSource('Selected Google Meet tab');
    s.service.state.transcript('t1',1,'Tea? Coffee?',true);
    s.service.state.anchors=[{id:'tea',selected:false,source:{turnId:'t1',revision:1,start:0,end:4,quote:'Tea?'}},{id:'coffee',selected:false,source:{turnId:'t1',revision:1,start:5,end:12,quote:'Coffee?'}}];
    await send(w,{type:'select',turnId:'t1',revision:1,anchorId:'coffee'});expect(s.service.state.drafts[0]?.anchor?.quote).toBe('Coffee?');
    expect((await send(w,{type:'select',turnId:'t1',revision:1,anchorId:'unknown'})).type).toBe('error');expect(s.service.state.drafts).toHaveLength(1);
  });
});
