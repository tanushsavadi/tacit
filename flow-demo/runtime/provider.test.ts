import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FlowDemoProvider,fixturesSchema } from './provider.ts';
import { DemoService } from './service.ts';
import { WebSocket } from 'ws';
import { SpeechOutput } from '../candidate/server/src/speech.ts';
import { EventEmitter } from 'node:events';
import type { Model } from '../candidate/server/src/flow/semantic.ts';
const fixtures=fixturesSchema.parse(JSON.parse(readFileSync(new URL('../demo/flow/scenarios.json',import.meta.url),'utf8')));
const settle=()=>new Promise(r=>setTimeout(r,15));
function make(model:Model|null=null){return new FlowDemoProvider(fixtures,model,()=>{});}
describe('demo real state machine',()=>{
 it('grounds scenario A and never changes the authored draft',()=>{const p=make();p.start();expect(p.next(0)).toBe(true);const a=p.state.anchors[0]!;const d=p.state.select(a.source);p.state.edit(d.id,1,'Thursday at four works for me.');p.next(1);expect(d.text).toBe('Thursday at four works for me.');expect(p.state.changes[0]?.detailAfter).toBe('five');expect(p.state.valid(p.state.changes[0]!.after)).toBe(true);});
 it('preserves original question and unfinished words across interruption and resume',()=>{const p=make();p.reset('B');p.start();p.next(0);const d=p.state.select(p.state.anchors[0]!.source);p.state.edit(d.id,1,'I think we should wait until testing is done.');p.next(1);p.state.save(d.id);p.pause();p.resume();expect(d.text).toContain('testing is done');expect(d.anchor?.quote).toContain('launching');expect(d.saved).toBe(true);});
 it('C contains no invented outgoing message',()=>{const p=make();p.reset('C');p.start();p.next(0);expect(p.lastOutgoing).toBeNull();});
 it('deduplicates double Next, repeated start and source revisions',()=>{const p=make();p.start();p.start();p.next(0);p.next(0);expect(p.step).toBe(1);expect(p.state.turns.length).toBe(1);expect(p.deliver(fixtures.scenarios[0]!.events[0])).toBe(false);p.next(1);expect(p.step).toBe(2);});
 it('rejects malformed fixtures and hidden answer hints',()=>{const f=structuredClone(fixtures);(f.scenarios[0]!.events[0] as any).expectedType='correction';expect(()=>fixturesSchema.parse(f)).toThrow();f.scenarios[0]!.events[0]!.sequence=9;expect(()=>fixturesSchema.parse(f)).toThrow();});
 it('reset invalidates in-flight model even when it ignores abort',async()=>{let finish!:(v:any)=>void;const model:Model=()=>new Promise(r=>finish=r);const p=make(model);p.start();p.next(0);p.reset('B');finish({text:'{}',inputTokens:0,outputTokens:0,model:'test'});await settle();expect(p.state.turns).toEqual([]);expect(p.state.changes).toEqual([]);expect(p.scenarioId).toBe('B');expect(p.operations).toEqual([]);});
 it('rejects invalid model citations, falls back visibly',async()=>{const model:Model=async()=>({text:JSON.stringify({questions:[{turnId:'missing',revision:1,start:0,end:1,quote:'x'}],relationships:[],abstain:false}),inputTokens:1,outputTokens:1,model:'test'});const p=make(model);p.start();p.next(0);await settle();expect(p.snapshot().demo.provenance).toContain('Deterministic');expect(p.operations[0]?.validation).toContain('unavailable');expect(p.state.anchors.every(a=>p.state.valid(a.source))).toBe(true);});
 it('handles 429 with one request and local communication intact',async()=>{const model=vi.fn(async()=>{throw {status:429};});const p=make(model);p.start();p.next(0);await settle();p.next(1);await settle();expect(model).toHaveBeenCalledTimes(1);expect(p.state.changes[0]?.detailAfter).toBe('five');expect(p.state.turns.length).toBe(2);});
 it('network outage falls back without changing words',async()=>{const p=make(async()=>{throw Error('offline');});p.start();p.next(0);await settle();const d=p.state.select(p.state.anchors[0]!.source);p.state.edit(d.id,1,'My own response');p.next(1);await settle();expect(d.text).toBe('My own response');expect(p.snapshot().demo.provenance).toContain('Deterministic');});
 it('deadline is bounded at five seconds',async()=>{vi.useFakeTimers();const p=make(()=>new Promise(()=>{}));p.start();p.next(0);await vi.advanceTimersByTimeAsync(5001);expect(p.snapshot().demo.provenance).toContain('Deterministic');p.close();vi.useRealTimers();});
 it('timed pause resume and reset discard stale timers',async()=>{vi.useFakeTimers();const p=make();p.setPlayback('timed');p.start();await vi.advanceTimersByTimeAsync(1);expect(p.step).toBe(1);p.pause();await vi.advanceTimersByTimeAsync(40000);expect(p.step).toBe(1);p.resume();p.reset('B');await vi.advanceTimersByTimeAsync(40000);expect(p.step).toBe(0);expect(p.state.turns).toEqual([]);p.close();vi.useRealTimers();});
 it('disabled provider cannot start; teardown clears all session data',()=>{const p=make();p.enabled=false;expect(()=>p.start()).toThrow();p.enabled=true;p.start();p.next(0);p.close();expect(p.state.state).toBe('off');expect(p.state.drafts).toEqual([]);});
 it('five rehearsals of A/B/C maintain reset and speech boundaries',()=>{for(let run=0;run<5;run++){const p=make();for(const id of ['A','B','C'] as const){p.reset(id);p.start();p.next(0);const d=p.state.select(p.state.anchors[0]!.source);p.state.edit(d.id,1,'Words entered by the rehearsal operator');p.next(1);p.state.save(d.id);expect(d.text).toBe('Words entered by the rehearsal operator');p.reset();expect(p.state.drafts).toEqual([]);expect(p.state.turns).toEqual([]);}p.close();}});
});
describe('socket → state → user decision → real speech authorization',()=>{
 it('integrates through genuine interfaces, with TTS/route mocked only here',async()=>{
  const token='test-token-'.repeat(4);const service=new DemoService(token,fixtures,null,()=>{});const port=await service.listen(0);
  const ws=new WebSocket(`ws://127.0.0.1:${port}/flow`,{headers:{Authorization:`Bearer ${token}`}});const messages:any[]=[];ws.on('message',r=>messages.push(JSON.parse(r.toString())));await new Promise(r=>ws.once('open',r));
  const send=async(c:unknown)=>{ws.send(JSON.stringify(c));await settle();};
  try{
   await send({type:'demo',action:'start'});await send({type:'demo',action:'next',expectedStep:0});const snapshot=messages.at(-1).snapshot;const a=snapshot.anchors[0];expect(a.source.quote).toContain('Thursday');
   await send({type:'select',turnId:a.source.turnId,revision:1,anchorId:a.id});const d=messages.at(-1).snapshot.drafts[0];await send({type:'edit',id:d.id,version:1,text:'Five works better for me.'});await send({type:'demo',action:'next',expectedStep:1});expect(messages.at(-1).snapshot.drafts[0].text).toBe('Five works better for me.');
   const status={state:'ready',deviceName:'TEST ONLY',deviceUid:'test',sampleRate:48000,gainDb:0,calibrated:true,readers:[],warnings:[],reason:null} as const;
   const route=Object.assign(new EventEmitter(),{status:()=>({...status,warnings:[],readers:[]}),play:vi.fn(async()=>({state:'rendered' as const,startedAt:1,renderedAt:2})),stop:vi.fn()});
   const synth=vi.fn(async(text:string)=>({audio:Buffer.alloc(2),mime:'audio/wav',durationMs:1,voice:'TEST ONLY'}));const output=new SpeechOutput({label:'TEST ONLY',synth:synth as any},()=>route,()=>({...status,warnings:[],readers:[]}));
   output.speakTyped({requestId:'unauthorized',outputAuthorizationId:'none',text:d.text});expect(synth).not.toHaveBeenCalled();output.control('enable');const authorized=output.status();
   output.speakTyped({requestId:'user-click',outputAuthorizationId:authorized.authorizationId,outputGeneration:authorized.generation,text:messages.at(-1).snapshot.drafts[0].text});await settle();expect(synth).toHaveBeenCalledTimes(1);expect(synth.mock.calls[0]?.[0]).toBe('Five works better for me.');output.control('stop');expect(output.status().state).toBe('off');
  }finally{ws.close();await service.close();}
 });
 it('refuses competing owners and unauthenticated clients',async()=>{const service=new DemoService('x'.repeat(32),fixtures,null,()=>{});const port=await service.listen(0);const one=new WebSocket(`ws://127.0.0.1:${port}/flow`,{headers:{Authorization:'Bearer '+'x'.repeat(32)}});await new Promise(r=>one.once('open',r));const two=new WebSocket(`ws://127.0.0.1:${port}/flow`,{headers:{Authorization:'Bearer '+'x'.repeat(32)}});const code=await new Promise(r=>two.on('close',r));expect(code).toBe(1008);one.close();await service.close();});
 it('owner disconnect clears session and revokes audio',async()=>{const stop=vi.fn();const service=new DemoService('z'.repeat(32),fixtures,null,stop);const port=await service.listen(0);const ws=new WebSocket(`ws://127.0.0.1:${port}/flow`,{headers:{Authorization:'Bearer '+'z'.repeat(32)}});await new Promise(r=>ws.once('open',r));ws.send(JSON.stringify({type:'demo',action:'start'}));await settle();ws.send(JSON.stringify({type:'demo',action:'next',expectedStep:0}));await settle();expect(service.provider.state.turns).toHaveLength(1);ws.terminate();await settle();expect(service.provider.state.turns).toEqual([]);expect(stop).toHaveBeenCalled();await service.close();});

});
