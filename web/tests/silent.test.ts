import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFrame, type VisionFrame } from '../src/vision/features.ts';
import { ArticulationSegmenter } from '../src/silent/articulation.ts';
import { VisualFrameBuffer } from '../src/silent/frameBuffer.ts';
import { LiveSpeechSession } from '../src/silent/session.ts';
import { unavailableSilentSpeechPort, activationBlock, type SilentSpeechPort, type VisualHypothesis, type VisualUtterance } from '../src/silent/port.ts';
const makeSession=(port:SilentSpeechPort,changed:ConstructorParameters<typeof LiveSpeechSession>[1])=>new LiveSpeechSession(port,changed,()=>0);
const frame=(t:number,jaw=0):VisionFrame=>({...emptyFrame(t),tracked:true,faceCount:1,jaw,mouthAspect:jaw*0.5});
const utterance=(id='u1'):VisualUtterance=>({id,startMs:0,endMs:800,detectedAtMs:1300,endpointMs:500,trackedFrames:15,frames:Array.from({length:20},(_,i)=>({t:i*50,jpeg:new Blob(['pixels']),width:640,height:480}))});
const result=(id='u1'):VisualHypothesis=>({utteranceId:id,authorizationId:'auth',rawText:'my own words',final:true,stable:true,uncertainty:null,model:'TEST ONLY',source:'visual-model',decision:'accepted',reason:null,recognitionMs:20});
const makePort=():SilentSpeechPort=>({availability:{connected:true,visualModelReady:true,automaticSpeechValidated:true,validationEvidence:'TEST FIXTURE ONLY',model:'TEST ONLY',reason:''},activate:async(callId)=>({id:'auth',callId,generation:'g1'}),submit:async(_auth,u)=>result(u.id),pause(){},interrupt(){},end(){}});

test('motion endpointing emits actual timing for repeated movement then quiet, not words',()=>{
 const segmenter=new ArticulationSegmenter(); let found=null;
 for(let t=0;t<=1000;t+=50) segmenter.update(frame(t,t%100===0?0.7:0));
 for(let t=1050;t<=1750;t+=50){const out=segmenter.update(frame(t,0));if(out.window)found=out.window;}
 assert.ok(found);assert.ok(found.endpointMs>=480);assert.ok(found.endMs<found.detectedAtMs);assert.equal('text' in found,false);
});
test('static relaxed mouth and a static held smile do not produce repeated windows',()=>{
 const segmenter=new ArticulationSegmenter();
 for(let t=0;t<3000;t+=50) assert.equal(segmenter.update({...frame(t),smile:0.7}).window,null);
});
test('face loss, multiple faces and temporal gaps discard incomplete windows',()=>{
 for(const invalid of [emptyFrame(450),{...frame(450),faceCount:2},frame(1500)]){
  const segmenter=new ArticulationSegmenter();for(let t=0;t<=400;t+=50)segmenter.update(frame(t,t%100===0?0.8:0));
  assert.ok(segmenter.update(invalid).dropped);
  for(let t=1550;t<2300;t+=50)assert.equal(segmenter.update(frame(t)).window,null);
 }
});
test('RAM buffer bounds time, bytes and frames; clears and rejects stale timestamp samples',()=>{
 const buffer=new VisualFrameBuffer(100,20,3);
 for(let t=0;t<=250;t+=50)buffer.push({t,jpeg:new Blob(['12345']),width:10,height:10});
 assert.equal(buffer.stats.frames,3);assert.equal(buffer.stats.bytes,15);assert.equal(buffer.window(150,250).length,3);
 buffer.push({t:200,jpeg:new Blob(['12345']),width:10,height:10});assert.equal(buffer.stats.frames,3);
 buffer.clear();assert.equal(buffer.stats.bytes,0);
});
test('unvalidated/missing backend never activates or submits; explicit start is required',async()=>{
 const blocked=unavailableSilentSpeechPort(true);assert.match(activationBlock(blocked,'call')!,/not been connected/);
 const session=makeSession(blocked,()=>{});assert.equal(await session.start('call'),false);assert.equal(session.active,false);
 const port=makePort();let calls=0;port.submit=async()=>{calls++;return result();};
 const valid=makeSession(port,()=>{});await valid.submit(utterance());assert.equal(calls,0);
 port.availability.automaticSpeechValidated=false;assert.equal(await valid.start('call'),false);assert.equal(calls,0);
});
test('eligible consecutive utterances do not require confirmation and duplicate IDs are suppressed',async()=>{
 const port=makePort();let calls=0;port.submit=async(_a,u)=>{calls++;return result(u.id);};
 const session=makeSession(port,()=>{});assert.equal(await session.start('call'),true);
 await session.submit(utterance());await session.submit(utterance());await session.submit(utterance('u2'));
 assert.equal(calls,2);assert.equal(session.state.phase,'listening');assert.equal(session.state.hypothesis?.rawText,'my own words');
});
test('pause cancels in-flight recognition and prevents late hypotheses',async()=>{
 const port=makePort();let resolve!:(r:VisualHypothesis)=>void;let paused=0;port.pause=()=>paused++;
 port.submit=(_a,_u,signal)=>new Promise(r=>{resolve=r;assert.equal(signal.aborted,false);});
 const session=makeSession(port,()=>{});await session.start('call');const pending=session.submit(utterance());
 session.pause();resolve(result());await pending;
 assert.equal(session.active,false);assert.equal(session.state.phase,'paused');assert.equal(session.state.hypothesis,null);assert.equal(paused,1);
});
test('disconnect/end during activation invalidates and releases late authorization',async()=>{
 const port=makePort();let resolve!:(r:{id:string;callId:string;generation:string})=>void;let ended=0;
 port.activate=()=>new Promise(r=>resolve=r);port.end=()=>ended++;
 const session=makeSession(port,()=>{});const pending=session.start('call');session.stop();resolve({id:'auth',callId:'call',generation:'g1'});
 assert.equal(await pending,false);assert.equal(session.active,false);assert.equal(ended,1);
});
test('unstable or mismatched accepted output is rejected; uncertain raw words remain available for recovery',async()=>{
 const port=makePort();const session=makeSession(port,()=>{});await session.start('call');
 port.submit=async()=>({...result(),stable:false});await session.submit(utterance());assert.equal(session.state.phase,'uncertain');assert.equal(session.state.hypothesis,null);
 port.submit=async()=>({...result('u2'),decision:'uncertain',rawText:'unclear words',reason:'Not validated'});await session.submit(utterance('u2'));
 assert.equal(session.state.hypothesis?.rawText,'unclear words');assert.equal(session.pendingRetry?.id,'u2');
});
test('tracking loss interrupts and drops pending recognition without ending authorized session',async()=>{
 const port=makePort();let interrupted=0;port.interrupt=()=>interrupted++;
 let resolve!:(r:VisualHypothesis)=>void;port.submit=()=>new Promise(r=>resolve=r);
 const session=makeSession(port,()=>{});await session.start('call');const pending=session.submit(utterance());session.trackingLost();resolve(result());await pending;
 assert.equal(interrupted,1);assert.equal(session.active,true);assert.equal(session.state.hypothesis,null);
});
test('successive windows queue in order while recognition is running, and pause clears that queue',async()=>{
 const port=makePort();const calls:string[]=[];const resolvers:Array<(r:VisualHypothesis)=>void>=[];
 port.submit=(_a,u)=>{calls.push(u.id);return new Promise(r=>resolvers.push(r));};
 const session=makeSession(port,()=>{});await session.start('call');
 const first=session.submit(utterance('u1'));await session.submit(utterance('u2'));await session.submit(utterance('u2'));await session.submit(utterance('u3'));
 assert.deepEqual(calls,['u1']);resolvers[0]!(result('u1'));await first;assert.deepEqual(calls,['u1','u2']);
 session.pause();resolvers[1]!(result('u2'));await Promise.resolve();assert.deepEqual(calls,['u1','u2']);
});
test('motion longer than the bounded window is dropped without creating a recognized utterance',()=>{
 const segmenter=new ArticulationSegmenter();let dropped=false;
 for(let t=0;t<=9000;t+=50){const out=segmenter.update(frame(t,t%100===0?.8:0));assert.equal(out.window,null);if(out.dropped==='too_long')dropped=true;}
 assert.equal(dropped,true);
});

test('articulation captured before live authorization can never be submitted',async()=>{
 const port=makePort();let calls=0;port.submit=async()=>{calls++;return result();};
 const session=new LiveSpeechSession(port,()=>{},()=>500);await session.start('call');await session.submit(utterance());
 assert.equal(calls,0);assert.match(session.state.reason!,/before live activation/);
});
test('interruption does not allow a previously submitted utterance ID to be replayed',async()=>{
 const port=makePort();let calls=0;port.submit=async(_a,u)=>{calls++;return result(u.id);};const session=makeSession(port,()=>{});
 await session.start('call');await session.submit(utterance());session.interrupt();await session.submit(utterance());assert.equal(calls,1);
});
