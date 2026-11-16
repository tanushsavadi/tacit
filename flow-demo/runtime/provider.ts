import { z } from 'zod';
import { FlowState, same, type Citation } from '../candidate/server/src/flow/state.ts';
import { SemanticEngine, validate, type Model } from '../candidate/server/src/flow/semantic.ts';
const eventSchema = z.object({ scenarioId:z.string().regex(/^[A-C]$/),eventId:z.string().regex(/^[\w-]{1,90}$/),turnId:z.string().regex(/^[\w-]{1,90}$/),revision:z.number().int().positive(),source:z.literal('Demo conversation'),text:z.string().min(1).max(500),sequence:z.number().int().positive(),relativeTimeMs:z.number().int().nonnegative().max(300000),simulated:z.literal(true) }).strict();
export const fixturesSchema=z.object({version:z.literal(1),scenarios:z.array(z.object({id:z.enum(['A','B','C']),title:z.string(),events:z.array(eventSchema).min(1).max(20)}).strict()).length(3)}).strict().superRefine((v,ctx)=>{
 if(new Set(v.scenarios.map(s=>s.id)).size!==3)ctx.addIssue({code:'custom',message:'Unique scenarios required'});
 for(const s of v.scenarios){const ids=new Set<string>();let time=-1;const revisions=new Map<string,number>();for(const [i,e] of s.events.entries()){
  if(e.scenarioId!==s.id||e.sequence!==i+1||ids.has(e.eventId)||e.relativeTimeMs<time||e.revision<=(revisions.get(e.turnId)??0))ctx.addIssue({code:'custom',message:'Invalid event ordering or revision'});
  ids.add(e.eventId);time=e.relativeTimeMs;revisions.set(e.turnId,e.revision);
 }}
});
export type Fixtures=z.infer<typeof fixturesSchema>;
export interface Operation { at:string; model:string; status:string; elapsedMs:number; validation:string }
/** No TTS capability. The adapter supplies transcripts, never answer labels or draft words. */
export class FlowDemoProvider {
 readonly state=new FlowState(); readonly engine:SemanticEngine;
 scenarioId:'A'|'B'|'C'='A'; step=0; running=false; paused=false; enabled=true; playback:'manual'|'timed'='manual'; analysis:'gemini'|'deterministic';
 readonly operations:Operation[]=[]; readonly errors:{at:string;code:string}[]=[];
 private timer:ReturnType<typeof setTimeout>|null=null; private serial=0; private elapsed=0; private clockAt=0; private seen=new Set<string>(); private provenance='Deterministic analysis';
 audioMode='off';
 lastOutgoing:{text:string;requestId:string;state:string}|null=null;
 constructor(readonly fixtures:Fixtures,model:Model|null,private notify:()=>void,private cancelSpeech:()=>void=()=>{},private clock=()=>performance.now()){
  this.analysis=model?'gemini':'deterministic';this.provenance=model?'Gemini ready · awaiting event':'Deterministic analysis';this.engine=new SemanticEngine(model);this.hasGemini=!!model;
 }
 readonly hasGemini:boolean;
 get scenario(){return this.fixtures.scenarios.find(s=>s.id===this.scenarioId)!;}
 snapshot(){return {type:'state',snapshot:this.state.snapshot(),providerPolicyVerified:false,demo:{audioMode:this.audioMode,scenarioId:this.scenarioId,title:this.scenario.title,step:this.step,total:this.scenario.events.length,running:this.running,paused:this.paused,enabled:this.enabled,playback:this.playback,analysis:this.analysis,providerAvailable:this.hasGemini,provenance:this.provenance,inputSource:'Demo conversation · Simulated input',scenarios:this.fixtures.scenarios.map(s=>({id:s.id,title:s.title})),operations:this.operations,errors:this.errors,lastOutgoing:this.lastOutgoing}};}
 private cancel(){this.serial++;this.engine.cancel();if(this.timer)clearTimeout(this.timer);this.timer=null;}
 reset(id=this.scenarioId){this.cancel();this.cancelSpeech();this.state.stop();this.scenarioId=id;this.step=0;this.running=false;this.paused=false;this.elapsed=0;this.seen.clear();this.lastOutgoing=null;this.notify();}
 start(){if(!this.enabled)throw Error('demo-disabled');if(this.running){if(this.paused)this.resume();return;}
  this.state.start(true,this.analysis==='gemini');this.state.state='capturing';this.state.source='Demo conversation';this.state.status='Demo conversation · Simulated input · Review First';this.running=true;this.paused=false;this.clockAt=this.clock();this.notify();this.schedule();}
 next(expectedStep:number){if(!this.enabled||!this.running||this.paused||expectedStep!==this.step)return false;const e=this.scenario.events[this.step];if(!e)return false;
  if(!this.deliver(e))return false;this.step++;this.elapsed=Math.max(this.elapsed,e.relativeTimeMs);this.clockAt=this.clock();this.notify();this.schedule();return true;}
 deliver(input:unknown){const e=eventSchema.parse(input);if(e.scenarioId!==this.scenarioId||!this.running||this.paused||this.seen.has(e.eventId))return false;
  this.cancel();if(!this.state.transcript(e.turnId,e.revision,e.text,true))return false;this.seen.add(e.eventId);
  this.local(false);this.notify();const serial=this.serial,revision=this.state.revision;
  if(this.analysis==='gemini'&&this.hasGemini){this.state.textConsent=true;void this.engine.run(this.state,this.notify).then(()=>{
   if(serial!==this.serial||revision!==this.state.revision||!this.running)return;
   const valid=this.state.semantic==='Gemini · source-checked interpretation';
   this.provenance=valid?'Gemini live analysis':this.state.semantic==='Gemini uncertain · inspect source'?'Gemini uncertain · deterministic analysis':'Deterministic analysis · Gemini unavailable';
   this.operations.push({at:new Date().toISOString(),model:this.engine.metrics.model||'configured Gemini',status:this.state.semantic,elapsedMs:this.engine.metrics.latencies.at(-1)??0,validation:valid?'source references accepted':'abstained or unavailable'});this.operations.splice(0,Math.max(0,this.operations.length-12));
   if(!valid)this.local(true);this.notify();
  });}else{this.local(true);this.provenance='Deterministic analysis';this.notify();}return true;}
 private local(includeChanges:boolean){const turns=this.state.turns.filter(t=>t.final);const citation=(id:string):Citation=>{const t=turns.find(t=>t.id===id)!;return {turnId:t.id,revision:t.revision,start:0,end:t.text.length,quote:t.text};};
  const questions=turns.filter(t=>/\?/.test(t.text)).map(t=>citation(t.id));const relationships=[];
  // Narrow transparent lexical comparator. No scenario IDs, annotations, or expected answers are consulted.
  if(includeChanges){const after=turns.at(-1);if(after&&/\b(actually|instead|meant)\b/i.test(after.text)&&!/\b(not|don't|hypothetical|if we)\b/i.test(after.text)){
   const earlier=turns.slice(0,-1).filter(t=>/\bmeet\b/i.test(t.text));
   const before=earlier.length===1?earlier[0]:null;
   const time=/\b(?:at|that)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2}(?::\d{2})?)\b/i;
   const b=before?.text.match(time),a=after.text.match(time);
   if(before&&b?.[1]&&a?.[1]&&a[1].toLowerCase()!==b[1].toLowerCase())relationships.push({relation:'correction',before:citation(before.id),after:citation(after.id),detailBefore:b[1],detailAfter:a[1]});
  }}
  const result=validate(JSON.stringify({questions,relationships,abstain:false}),this.state);
  for(const c of result.questions)if(!this.state.anchors.some(a=>same(a.source,c)))this.state.anchors.push({id:`local-${c.turnId}-${c.revision}`,source:c,selected:false});
  for(const r of result.relationships){const id=`local-${r.before.turnId}-${r.after.turnId}`;if(!this.state.changes.some(c=>same(c.before,r.before)&&same(c.after,r.after)))this.state.changes.push({id,...r});}
  this.state.anchors=this.state.anchors.slice(-6);this.state.changes=this.state.changes.slice(-12);
  if(this.analysis==='deterministic')this.state.semantic='Deterministic analysis · narrow lexical rules';
 }
 pause(){if(!this.running||this.paused)return;this.elapsed+=this.clock()-this.clockAt;this.cancel();this.paused=true;this.state.epoch++;this.state.status='Demo events paused · your words are kept';this.cancelSpeech();this.notify();}
 resume(){if(!this.running||!this.paused)return;this.paused=false;this.clockAt=this.clock();this.state.status='Demo conversation · Simulated input · Review First';this.notify();this.schedule();}
 setPlayback(mode:'manual'|'timed'){if(!this.paused&&this.running)this.elapsed+=this.clock()-this.clockAt;this.clockAt=this.clock();this.playback=mode;if(this.timer)clearTimeout(this.timer);this.timer=null;this.notify();this.schedule();}
 setAnalysis(mode:'gemini'|'deterministic'){this.cancel();this.analysis=mode;this.state.textConsent=mode==='gemini';this.provenance=mode==='gemini'?'Gemini ready · awaiting next event':'Deterministic analysis';this.state.semantic=this.provenance;this.notify();this.schedule();}
 clear(){this.cancel();this.state.clearContext();this.cancelSpeech();this.notify();}
 stop(){this.reset();}
 private schedule(){if(this.timer)clearTimeout(this.timer);this.timer=null;if(this.playback!=='timed'||!this.running||this.paused)return;const e=this.scenario.events[this.step];if(!e)return;const elapsed=this.elapsed+this.clock()-this.clockAt,step=this.step,serial=this.serial;
  this.timer=setTimeout(()=>{this.timer=null;if(serial===this.serial)this.next(step);},Math.max(0,e.relativeTimeMs-elapsed));}
 error(code:string){this.errors.push({at:new Date().toISOString(),code});this.errors.splice(0,Math.max(0,this.errors.length-8));this.notify();}
 close(){this.cancel();this.cancelSpeech();this.state.stop();this.running=false;this.seen.clear();this.lastOutgoing=null;}
}
