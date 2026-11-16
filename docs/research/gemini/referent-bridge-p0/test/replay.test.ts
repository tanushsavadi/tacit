import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priority } from '../src/cases.ts';
import { Bridge } from '../src/bridge.ts';
import { scoreReferences } from '../src/evaluation.ts';

const saved=JSON.parse(readFileSync(new URL('../evidence/real-bridge.json',import.meta.url),'utf8')) as {status:string;networkRequests:number;response:{text:string}};
const batch=JSON.parse(saved.response.text) as {cases:{id:string;result:unknown}[]};
for(const c of priority)test(`RECORDED real-response replay with scripted user: ${c.id}`,async()=>{
  assert.equal(saved.status,'received');assert.equal(saved.networkRequests,1);
  const b=new Bridge(c.context);const raw=batch.cases.find(r=>r.id===c.id)!.result;const out=await b.resolve(async()=>raw);
  assert.equal(out.state,'ready');if(out.state!=='ready')return;
  assert.equal(scoreReferences(c,out.resolution).correct,true);
  assert.equal(b.snapshot.selected,null);assert.throws(()=>b.compose());
  const ref=out.resolution.references.find(r=>r.turnId===c.selected!.turnId&&r.quote===c.selected!.quote)!;
  b.select(ref.id);b.author(c.position);const draft=b.compose();assert.equal(draft.userPoint,c.position.point);
  assert.equal(b.approve(draft.hash).text,`Regarding ${ref.quote}: ${c.position.point}`);
});
