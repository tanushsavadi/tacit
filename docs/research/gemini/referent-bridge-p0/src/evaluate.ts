import { existsSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Bridge } from './bridge.ts';
import { cases,priority,mockFor,contextText,type Case } from './cases.ts';
import { chips,hash,validateResolution } from './references.ts';
import { effort,matches,scoreReferences,scoreWording } from './evaluation.ts';
import { validate as hmrValidate } from '../vendor/hmr-pure.ts';
import type { CheckedResolution } from './contracts.ts';

const root=dirname(dirname(fileURLToPath(import.meta.url)));const dir=join(root,'evidence');mkdirSync(dir,{recursive:true});
function readBatch(label:string):Map<string,unknown>|null {
  const path=join(dir,`real-${label}.json`);if(!existsSync(path))return null;
  const saved=JSON.parse(readFileSync(path,'utf8')) as {status:string;response?:{text:string}};
  if(saved.status!=='received'||!saved.response)return null;
  const envelope=z.object({cases:z.array(z.object({id:z.string(),result:z.unknown()}).strict()).length(6)}).strict().parse(JSON.parse(saved.response.text));
  if(new Set(envelope.cases.map(c=>c.id)).size!==6||envelope.cases.some(c=>!priority.some(p=>p.id===c.id)))throw Error('Unexpected/duplicate real batch IDs');
  return new Map(envelope.cases.map(c=>[c.id,c.result]));
}
async function trace(c:Case, modelOutput:unknown, label:string) {
  const b=new Bridge(c.context);const outcome=await b.resolve(async()=>modelOutput);
  const events:Record<string,unknown>[]=[{event:'context',value:c.context},{event:'model_result',kind:label,value:modelOutput},{event:'validation',value:outcome}];
  if(outcome.state!=='ready')return {case:c.id,events,approved:null,reason:'Validation failed'};
  const score=scoreReferences(c,outcome.resolution);
  const selected=outcome.resolution.references.find(r=>c.selected&&matches(r,c.selected,c));
  if(!selected)return {case:c.id,events,score,approved:null,reason:'Intended reference absent; manual fallback required'};
  events.push({event:'SCRIPTED_USER_selection',value:{...selected,warning:'Oracle scripted choice for a mechanics test; not a measured human choice.'}});
  b.select(selected.id);b.author(c.position);events.push({event:'SCRIPTED_USER_position',value:c.position});
  const draft=b.compose();events.push({event:'review',value:draft});
  const approved=b.approve(draft.hash);events.push({event:'SCRIPTED_USER_approve_text_only',value:approved});
  return {case:c.id,events,score,approved};
}

const mockRows=[];const mockTraces=[];
for(const c of cases) {
  const b=new Bridge(c.context);await b.resolve(mockFor(c));const r=b.snapshot.resolution!;const simple=chips(c.context);
  mockRows.push({id:c.id,family:c.family,bridgeOracleMock:scoreReferences(c,r),chips:scoreReferences(c,simple),
    effort:{hmr:effort(c,'hmr',true),chips:effort(c,'chips',!!simple.references.find(r=>c.selected&&matches(r,c.selected,c))),bridgeOracleMock:effort(c,'bridge',true)}});
  mockTraces.push(await trace(c,c.expected,'MOCK_ORACLE_NOT_MODEL_EVIDENCE'));
}
writeFileSync(join(dir,'mock-traces.json'),JSON.stringify(mockTraces,null,2)+'\n');
const summary:Record<string,unknown>={generatedAt:new Date().toISOString(),fixtureHash:hash(JSON.stringify(cases)),cases:cases.length,
  mockOnly:{bridgeOracleCorrect:mockRows.filter(r=>r.bridgeOracleMock.correct).length,warning:'Gold mock responses are supplied by the test author. This is NOT Gemini accuracy.'},
  deterministicChips:{correct:mockRows.filter(r=>r.chips.correct).length,total:cases.length,priorityCorrect:mockRows.slice(0,6).filter(r=>r.chips.correct).length,abstentions:mockRows.filter(r=>r.chips.abstained).length},
  mechanicalEffort:{hmrActionsPerTask:6,chipsActionsPerTask:7,bridgeActionsPerTask:8,warning:'Modeled minimum actions only; no human trial, no time/effort measurement. HMR given zero edits.'},rows:mockRows};

let bridgeBatch:Map<string,unknown>|null=null;let hmrBatch:Map<string,unknown>|null=null;
try{bridgeBatch=readBatch('bridge');}catch(e){summary.bridgeEnvelopeError=e instanceof Error?e.message:'Invalid envelope';}
try{hmrBatch=readBatch('hmr');}catch(e){summary.hmrEnvelopeError=e instanceof Error?e.message:'Invalid envelope';}
const real=[];const realTraces=[];
for(const c of priority) {
  const row:Record<string,unknown>={id:c.id};
  if(bridgeBatch?.has(c.id)) {
    const raw=bridgeBatch.get(c.id);let checked:CheckedResolution|null=null;
    try{checked=validateResolution(raw,c.context);row.bridge={contract:'accepted',score:scoreReferences(c,checked),references:checked.references};}
    catch(e){row.bridge={contract:'rejected',reason:e instanceof Error?e.message:'Invalid output'};}
    row.bridgeEffort=effort(c,'bridge',!!checked?.references.find(r=>c.selected&&matches(r,c.selected,c)));
    realTraces.push(await trace(c,raw,'REAL_GEMINI_RESPONSE_REPLAY_WITH_SCRIPTED_USER'));
  }
  if(hmrBatch?.has(c.id)) {
    const raw=hmrBatch.get(c.id);const checked=hmrValidate(JSON.stringify(raw),{intent:c.position.intent,context:contextText(c),contextSource:'sample',userPoint:c.position.point,tone:'brief'});
    row.hmr={raw,accepted:checked,diagnostics:checked.drafts.map(d=>({text:d.text,checks:scoreWording(c,d.text)})),
      warning:'Same pure production prompt/validator, batched transport. Narrow diagnostics are not full semantic judgments.'};
    row.hmrEffort=effort(c,'hmr',true);
  }
  real.push(row);
}
summary.real={bridgeAvailable:!!bridgeBatch,hmrAvailable:!!hmrBatch,rows:real};
writeFileSync(join(dir,'real-traces.json'),JSON.stringify(realTraces,null,2)+'\n');
writeFileSync(join(dir,'evaluation.json'),JSON.stringify(summary,null,2)+'\n');
writeFileSync(join(dir,'fixtures.json'),JSON.stringify({kind:'SYNTHETIC_AUTHOR_LABELED_NOT_HUMAN_REVIEWED',cases},null,2)+'\n');
console.log(JSON.stringify({cases:summary.cases,mockOnly:summary.mockOnly,deterministicChips:summary.deterministicChips,mechanicalEffort:summary.mechanicalEffort,
  real:{bridgeAvailable:!!bridgeBatch,hmrAvailable:!!hmrBatch,caseIds:real.map(r=>r.id)},
  evidence:'Full per-case scores, actual responses, action inventories and traces are in evidence/evaluation.json and evidence/real-*.json.'},null,2));
