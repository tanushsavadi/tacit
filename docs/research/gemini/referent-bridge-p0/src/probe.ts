import { GoogleGenAI,ThinkingLevel } from '@google/genai';
import { mkdirSync,readFileSync,writeFileSync,existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { priority } from './cases.ts';
import { BRIDGE_SYSTEM,RESOLUTION_JSON_SCHEMA } from './contracts.ts';
import { SYSTEM as HMR_SYSTEM,SCHEMA as HMR_SCHEMA,buildPrompt } from '../vendor/hmr-pure.ts';
import { allowEndpoint,inJudgingWindow,reserveCall } from './budget.ts';
import { hash } from './references.ts';

const root=dirname(dirname(fileURLToPath(import.meta.url)));const evidence=join(root,'evidence');mkdirSync(evidence,{recursive:true});
if(!process.argv.includes('--run-two-synthetic-calls')) throw new Error('Explicit --run-two-synthetic-calls flag required. Offline commands never make requests.');
if(inJudgingWindow(new Date())) throw new Error('Calls disabled during scheduled judging/rehearsal protection window.');
if(['bridge','hmr'].some(label=>existsSync(join(evidence,`real-${label}.json`)))) throw new Error('Initial probe evidence already exists; replay it. No additional calls or evidence overwrite permitted.');
const key=process.env.GEMINI_API_KEY || (process.env.TACIT_ENV_FILE?parseEnv(readFileSync(process.env.TACIT_ENV_FILE,'utf8')).GEMINI_API_KEY:undefined);
if(!key) throw new Error('GEMINI_API_KEY not available. Set an environment reference; never paste keys into files.');
const payloads = [
  { label:'bridge',system:BRIDGE_SYSTEM, schema:{ type:'object',additionalProperties:false,properties:{cases:{type:'array',minItems:6,maxItems:6,items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},result:RESOLUTION_JSON_SCHEMA},required:['id','result']}}},required:['cases'] },
    contents:JSON.stringify({instruction:'Resolve each independent transcript; preserve IDs. No user position supplied. Do not use one case as evidence for another.',cases:priority.map(c=>({id:c.id,context:c.context}))}) },
  { label:'hmr',system:HMR_SYSTEM+'\nBatch transport only: process each independent case using its prompt. Return the normal focus/drafts object under result, preserving IDs. Cases are not one conversation.',
    schema:{type:'object',additionalProperties:false,properties:{cases:{type:'array',minItems:6,maxItems:6,items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},result:HMR_SCHEMA},required:['id','result']}}},required:['cases']},
    contents:JSON.stringify({cases:priority.map(c=>({id:c.id,prompt:buildPrompt({intent:c.position.intent,context:c.context.turns.map(t=>`[${t.id}] ${t.text}`).join('\n'),contextSource:'sample',userPoint:c.position.point,tone:'brief'})}))}) },
];
writeFileSync(join(evidence,'frozen-inputs.json'),JSON.stringify({createdAt:new Date().toISOString(),cases:priority,hash:hash(JSON.stringify(priority)),note:'Gold labels in this local evidence file are never included in model prompts.'},null,2)+'\n');
for(const p of payloads) {
  const path=join(evidence,`real-${p.label}.json`);
  if(existsSync(path)) throw new Error('Saved call exists; use evaluate for replay, not another API call');
  let networkRequests=0;
  const client=new GoogleGenAI({apiKey:key,httpOptions:{apiVersion:'v1beta',timeout:5000,retryOptions:{attempts:1},fetch:async(input,init)=>{
    allowEndpoint(input);
    if(++networkRequests>1) throw new Error('No network retries permitted');
    reserveCall(join(evidence,'call-budget.json'),p.label);
    return fetch(input,init);
  }}});
  const startedAt=new Date().toISOString();const start=performance.now();
  const record:Record<string,unknown>={kind:'REAL_GEMINI_SYNTHETIC_BATCH',label:p.label,startedAt,modelRequested:'gemini-3.5-flash-lite',request:{system:p.system,contents:p.contents,schema:p.schema},settings:{sdk:'3.3.0',temperature:p.label==='hmr'?0.6:0,maxOutputTokens:2500,thinkingLevel:'MINIMAL',deadlineMs:5000,retries:0}};
  try {
    const response=await client.models.generateContent({model:'gemini-3.5-flash-lite',contents:p.contents,config:{systemInstruction:p.system,responseMimeType:'application/json',responseJsonSchema:p.schema,temperature:p.label==='hmr'?0.6:0,maxOutputTokens:2500,thinkingConfig:{thinkingLevel:ThinkingLevel.MINIMAL},abortSignal:AbortSignal.timeout(5000)}});
    record.response={text:response.text??'',modelVersion:response.modelVersion,usage:response.usageMetadata,finishReasons:response.candidates?.map(c=>c.finishReason)};
    record.status='received';
  } catch(e) {
    const status=typeof e==='object'&&e!==null&&'status'in e?e.status:undefined;
    record.status='failed';record.error={category:'API error or deadline; raw error suppressed to avoid credential/URL disclosure',...(typeof status==='number'?{status}: {})};
  }
  record.endedAt=new Date().toISOString();record.wallMs=Math.round(performance.now()-start);record.networkRequests=networkRequests;
  writeFileSync(path,JSON.stringify(record,null,2)+'\n',{mode:0o600});
  console.log(`${p.label}: ${record.status}; ${record.wallMs} ms batch wall time; ${networkRequests} network request(s). Saved synthetic request/response.`);
}
