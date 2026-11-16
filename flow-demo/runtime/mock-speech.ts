/** AUTOMATED TEST ONLY. Actual SpeechOutput guards; no audio is emitted. */
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { WebSocketServer,WebSocket } from 'ws';
import { SpeechOutput } from '../candidate/server/src/speech.ts';
export async function mockSpeechServer(token:string){
 const routeStatus={state:'ready' as const,deviceName:'AUTOMATED TEST ONLY · Mock route',deviceUid:'mock',sampleRate:48000,gainDb:0,calibrated:true,readers:[],warnings:['No real audio'],reason:null};
 const pending=new Map<string,(v:any)=>void>();
 const route=Object.assign(new EventEmitter(),{status:()=>routeStatus,play:async(id:string,_a:Buffer,_m:string,onStarted?: (t:number)=>void)=>{onStarted?.(Date.now());return new Promise<any>(r=>{pending.set(id,r);setTimeout(()=>{if(pending.delete(id))r({state:'rendered',startedAt:Date.now(),renderedAt:Date.now()});},80);});},stop:()=>{for(const r of pending.values())r({state:'interrupted',reason:'Test stop'});pending.clear();}});
 const synth={label:'AUTOMATED TEST ONLY · Mock TTS',synth:async()=>({audio:Buffer.alloc(32),mime:'audio/wav',voice:'MOCK',durationMs:1,requestTs:Date.now(),firstByteTs:Date.now()})};
 const speech=new SpeechOutput(synth,()=>route,()=>routeStatus);
 const http=createServer((q,r)=>q.url==='/api/health'?r.end('{"testOnly":true}'):r.writeHead(404).end());
 const wss=new WebSocketServer({noServer:true});
 const broadcast=(m:unknown)=>{for(const w of wss.clients)if(w.readyState===WebSocket.OPEN)w.send(JSON.stringify(m));};
 speech.on('status',status=>broadcast({type:'output_status',status}));speech.on('delivery',delivery=>broadcast({type:'speech_delivery',delivery}));
 http.on('upgrade',(q,s,h)=>{const url=new URL(q.url??'','http://localhost');if(url.pathname!=='/ws'||url.searchParams.get('token')!==token){s.destroy();return;}wss.handleUpgrade(q,s,h,ws=>{
  ws.send(JSON.stringify({type:'output_status',status:speech.status()}));ws.send(JSON.stringify({type:'snapshot',snapshot:{now:Date.now(),services:{voiceRoute:routeStatus}}}));
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='output_control')speech.control(m.action);if(m.type==='speak_typed')speech.speakTyped(m);});
 });});
 await new Promise<void>((r,j)=>{http.once('error',j);http.listen(19890,'127.0.0.1',r);});
 return {close:async()=>{speech.control('stop');for(const w of wss.clients)w.terminate();wss.close();await new Promise<void>(r=>http.close(()=>r()));}};
}
