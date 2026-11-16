/** Fixed lexical comparator. Agent-authored, not an optimal baseline or a user-effort study. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../../evidence/quote-contract-v2/',import.meta.url);
const labels=JSON.parse(await readFile(new URL('gemini-holdout-preregistration.json',root),'utf8'));
const model=JSON.parse(await readFile(new URL('gemini-holdout.json',root),'utf8'));
const tokens=(s:string)=>new Set((s.toLowerCase().match(/\b[a-z0-9]+\b/g)??[]).filter(w=>w.length>3&&!['could','would','should','actually','which','there','their','about','please','meant','correction'].includes(w)));
export function baseline(turns:string[]){
  const a=turns[0]??'',b=turns.at(-1)??'';
  if(turns.length<2||/separate|different|do not change|ignore.*instructions/i.test(b))return false;
  if((a.match(/\bat\b/g)??[]).length>1&&/make that/i.test(b))return false;
  const x=tokens(a),shared=[...tokens(b)].filter(t=>x.has(t));
  const value=/\b(?:one|two|three|four|five|six|forty|sixty|monday|tuesday|wednesday|thursday|friday|\d+)\b/gi;
  const numbersA=(a.match(value)??[]).map(w=>w.toLowerCase()),numbersB=(b.match(value)??[]).map(w=>w.toLowerCase());
  const changed=numbersB.some(w=>!numbersA.includes(w));
  return shared.length>0&&/actually|correction|moved|increased|gone up|only if|no,|back to/i.test(b)&&(changed||/only if/i.test(b));
}
const results=labels.cases.map((c:any)=>{const prediction=baseline(c.turns);const r=model.results.find((r:any)=>r.id===c.id);return {id:c.id,expected:c.change,baseline:prediction,baselineMatches:prediction===c.change,geminiMatches:r?.semanticMatches??false};});
const output={scope:'Replay of frozen synthetic cases; semantic binary-change score only, not effort or clinical effectiveness',results,baselineMatches:results.filter((r:any)=>r.baselineMatches).length,geminiMatches:results.filter((r:any)=>r.geminiMatches).length,total:results.length};
await writeFile(fileURLToPath(new URL('../baseline-comparison.json',root)),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
