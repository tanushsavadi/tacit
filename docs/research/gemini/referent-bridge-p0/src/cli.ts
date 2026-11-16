import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Bridge } from './bridge.ts';
import { priority, mockFor, type Case } from './cases.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const replay=process.argv.includes('--replay-real');
function model(c:Case) {
  if(!replay)return mockFor(c);
  const saved=JSON.parse(readFileSync(fileURLToPath(new URL('../evidence/real-bridge.json',import.meta.url)),'utf8')) as {status:string;response:{text:string}};
  if(saved.status!=='received')throw Error('No successful saved Gemini response');
  const envelope=JSON.parse(saved.response.text) as {cases:{id:string;result:unknown}[]};
  const result=envelope.cases.find(r=>r.id===c.id)?.result;
  if(!result)throw Error('No saved result for this case');
  return async()=>structuredClone(result);
}
function show(c:Case,b:Bridge) {
  for(const t of c.context.turns) console.log(`[${t.id}] ${t.text}`);
  const s=b.snapshot;
  console.log(`\n${replay?'RECORDED GEMINI RESPONSE REPLAY — NOT LIVE':'MOCK MODEL OUTPUT'} — ${s.resolution?.state}. No availability inferred. Nothing selected.`);
  s.resolution?.references.forEach((r,i)=>console.log(`${i+1}. [${r.turnId}:${r.start}-${r.end}] ${r.quote}\n   source: ${c.context.turns.find(t=>t.id===r.turnId)!.text}`));
}
if(process.argv[2]==='interactive') {
  const rl=createInterface({input:stdin,output:stdout});
  try {
    const chosen=await rl.question(`Synthetic case (${priority.map(c=>c.id).join(', ')}): `);
    const c=priority.find(c=>c.id===chosen);
    if(!c)throw Error('Choose one of the listed synthetic case IDs');
    const b=new Bridge(c.context);const out=await b.resolve(model(c));if(out.state!=='ready')throw Error('Invalid saved/model result');show(c,b);
    const pick=await rl.question('Choose reference number; blank cancels: ');
    const ref=b.snapshot.resolution!.references[Number(pick)-1];
    if(!pick||!ref){b.cancel();console.log('Cancelled.');}
    else {
      b.select(ref.id);const point=await rl.question('Your own point (no generated stance): ');
      b.author({intent:'phrase_this',point});const d=b.compose();console.log(`\nREVIEW EXACT TEXT:\n${d.text}`);
      if((await rl.question('Type APPROVE to create a text-only artifact; anything else cancels: '))==='APPROVE') console.log(JSON.stringify(b.approve(d.hash),null,2));
      else { b.cancel();console.log('Cancelled.'); }
    }
  } finally {rl.close();}
} else if(process.argv[2]==='demo') {
  console.log(`${replay?'RECORDED GEMINI RESPONSE REPLAY':'SCRIPTED MOCK TRACE'} — scripted user choices, not a live model or user trial. No audio output.`);
  for(const c of priority) {
    const b=new Bridge(c.context);const out=await b.resolve(model(c));if(out.state!=='ready')throw Error('Invalid saved/model result');console.log(`\n--- ${c.id} ---`);show(c,b);
    const r=b.snapshot.resolution!.references.find(r=>r.turnId===c.selected!.turnId&&r.quote===c.selected!.quote)!;
    console.log(`SCRIPTED USER selects [${r.turnId}] ${r.quote}`);b.select(r.id);b.author(c.position);
    const d=b.compose();console.log(`SCRIPTED USER point: ${c.position.point}\nREVIEW: ${d.text}`);
    console.log('SCRIPTED explicit APPROVE →',JSON.stringify(b.approve(d.hash)));
  }
} else {console.log('Usage: npm run demo | npm run interactive | npm test | npm run evaluate');}
