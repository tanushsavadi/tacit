import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFrame, type VisionFrame } from '../src/vision/features.ts';
import { GestureTrialSession } from '../src/vision/trials.ts';
const frame=(t:number,jaw=0.05,smile=0.05,pucker=0.05):VisionFrame=>({...emptyFrame(t),tracked:true,jaw,smile,pucker});
function start(target=0) {
  const session=new GestureTrialSession();
  session.calibrate(Array.from({length:13},(_,i)=>frame(i*100)));
  session.start(target,2000,100000);
  for(let t=2000;t<=2400;t+=100)session.update(frame(t),t,100000+t-2000);
  return session;
}
test('experiment measures a correct gesture without any call/proposal path',()=>{
  const s=start();assert.equal(s.isArmed,true);
  let result=null;
  for(let t=2500;t<=3400;t+=100)result=s.update(frame(t,0.9),t,100000+t-2000)??result;
  assert.equal(result?.outcome,'correct');assert.equal(result?.selected,0);assert.equal(result?.durationMs,1400);
});
test('wrong selections and abstentions remain in the results',()=>{
  const s=start(1);let result=null;
  for(let t=2500;t<=3400;t+=100)result=s.update(frame(t,0.9),t,100000+t-2000)??result;
  assert.equal(result?.outcome,'wrong');
  const other=start();
  for(let t=2500;t<10000;t+=100)other.update(frame(t),t,100000+t-2000);
  assert.equal(other.update(frame(10000),10000,108000)?.outcome,'abstained');
});
test('missing/stalled tracking and interruptions do not count as correct',()=>{
  const s=start();assert.equal(s.update(emptyFrame(10000),10000,108000)?.outcome,'tracking_failure');
  const t=start();assert.equal(t.interrupt(2600,100600)?.outcome,'interrupted');assert.equal(t.interrupt(2700,100700),null);
});
test('holding an expression before neutral does not preselect a trial',()=>{
  const s=new GestureTrialSession();s.start(0,2000,100000);
  for(let t=2000;t<=4000;t+=100)assert.equal(s.update(frame(t,0.9),t,100000+t-2000),null);
  assert.equal(s.isArmed,false);
});
