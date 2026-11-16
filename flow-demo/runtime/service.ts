import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { FlowDemoProvider, type Fixtures } from './provider.ts';
import type { Model } from '../candidate/server/src/flow/semantic.ts';
const command=z.discriminatedUnion('type',[
 z.object({type:z.literal('demo'),action:z.enum(['start','next','pause','resume','restart','reset','clear','disable','enable','check']),scenarioId:z.enum(['A','B','C']).optional(),expectedStep:z.number().int().nonnegative().optional()}).strict(),
 z.object({type:z.literal('demo_mode'),playback:z.enum(['manual','timed']).optional(),analysis:z.enum(['gemini','deterministic']).optional()}).strict(),
 z.object({type:z.literal('select'),turnId:z.string().max(90),revision:z.number().int(),anchorId:z.string().max(160).optional()}).strict(),
 z.object({type:z.literal('edit'),id:z.string().max(90),version:z.number().int(),text:z.string().max(500)}).strict(),
 z.object({type:z.enum(['save','discard']),id:z.string().max(90)}).strict(),
 z.object({type:z.literal('acknowledge'),id:z.string(),change:z.string()}).strict(),
 z.object({type:z.enum(['stop','pause','clear','analyse'])}).strict()
]);
export class DemoService {
 readonly provider:FlowDemoProvider;private owner:WebSocket|null=null;
 private http=createServer((q,r)=>{if(q.url==='/health'){r.setHeader('Content-Type','application/json');r.end(JSON.stringify({demo:true,ownerConnected:!!this.owner}));}else r.writeHead(404).end();});
 private wss=new WebSocketServer({noServer:true,maxPayload:10000,perMessageDeflate:false});
 constructor(token:string,fixtures:Fixtures,model:Model|null,cancelSpeech:()=>void){
  this.provider=new FlowDemoProvider(fixtures,model,()=>this.notify(),cancelSpeech);
  this.http.on('upgrade',(req,socket,head)=>{
   const a=Buffer.from(req.headers.authorization??''),b=Buffer.from(`Bearer ${token}`),port=(this.http.address() as {port:number})?.port;
   if(req.url!=='/flow'||req.headers.host!==`127.0.0.1:${port}`||req.headers.origin||a.length!==b.length||!timingSafeEqual(a,b)){socket.destroy();return;}
   this.wss.handleUpgrade(req,socket,head,ws=>{if(this.owner){ws.close(1008,'Demo owner already connected');return;}this.owner=ws;this.notify();let count=0,at=Date.now();
    ws.on('message',(raw,binary)=>{if(Date.now()-at>1000){at=Date.now();count=0;}if(binary||++count>40){ws.close(1008);return;}
     try{const c=command.parse(JSON.parse(raw.toString())),p=this.provider,s=p.state;
      if(c.type==='demo')switch(c.action){
       case 'start':p.start();break;case 'next':if(c.expectedStep===undefined)throw Error();p.next(c.expectedStep);break;
       case 'pause':p.pause();break;case 'resume':p.resume();break;
       case 'restart':p.reset(c.scenarioId??p.scenarioId);p.start();break;
       case 'reset':p.reset(c.scenarioId??p.scenarioId);break;case 'clear':p.clear();break;
       case 'disable':p.reset();p.enabled=false;break;case 'enable':p.enabled=true;break;case 'check':break;
      }else if(c.type==='demo_mode'){if(c.analysis)p.setAnalysis(c.analysis);if(c.playback)p.setPlayback(c.playback);}
      else switch(c.type){
       case 'select':{const t=s.turns.find(t=>t.id===c.turnId&&t.revision===c.revision&&t.final);if(!t)throw Error();const a=c.anchorId?s.anchors.find(a=>a.id===c.anchorId):null;if(c.anchorId&&!a)throw Error();s.select(a?.source??{turnId:t.id,revision:t.revision,start:0,end:t.text.length,quote:t.text});break;}
       case 'edit':s.edit(c.id,c.version,c.text);break;case 'save':s.save(c.id);break;case 'discard':s.discard(c.id);break;
       case 'acknowledge':s.acknowledge(c.id,c.change);break;case 'stop':p.stop();break;case 'pause':p.pause();break;case 'clear':p.clear();break;
       case 'analyse':break;
      }
      this.notify();
     }catch{this.provider.error('Action refused: invalid state, source, or draft revision');ws.send(JSON.stringify({type:'error',message:'Action unavailable. Your words are kept.'}));}
    });ws.on('close',()=>{if(this.owner===ws){this.provider.close();this.owner=null;}});ws.on('error',()=>ws.terminate());
   });
  });
 }
 notify(){if(this.owner?.readyState===WebSocket.OPEN){if(this.owner.bufferedAmount>128000){this.owner.terminate();return;}this.owner.send(JSON.stringify(this.provider.snapshot()));}}
 async listen(port=19892){await new Promise<void>((r,j)=>{this.http.once('error',j);this.http.listen(port,'127.0.0.1',r);});return (this.http.address() as {port:number}).port;}
 async close(){this.provider.close();for(const ws of this.wss.clients)ws.terminate();this.wss.close();await new Promise<void>(r=>this.http.close(()=>r()));}
}
