import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

const entry = z.object({ label:z.string(), reservedAt:z.string() }).strict();
const ledgerSchema = z.object({ maximum:z.literal(2), attempts:z.array(entry).max(2) }).strict();
export function reserveCall(path:string,label:string): void {
  const lock=`${path}.lock`;const fd=openSync(lock,'wx',0o600);
  try {
    const ledger=existsSync(path)?ledgerSchema.parse(JSON.parse(readFileSync(path,'utf8'))):{maximum:2 as const,attempts:[] as z.infer<typeof entry>[]};
    if(ledger.attempts.length>=2) throw new Error('Initial two-call budget exhausted; replay saved evidence instead');
    if(ledger.attempts.some(a=>a.label===label)) throw new Error('This initial call was already reserved; no retry');
    ledger.attempts.push({label,reservedAt:new Date().toISOString()});
    writeFileSync(path,JSON.stringify(ledger,null,2)+'\n',{mode:0o600});
  } finally {closeSync(fd);unlinkSync(lock);}
}
export function allowEndpoint(input: string|URL|Request): void {
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.protocol!=='https:'||url.hostname!=='generativelanguage.googleapis.com'||!/^\/v1(?:beta)?\/models\/gemini-3\.5-flash-lite:generateContent$/.test(url.pathname)||url.username||url.password||url.search) throw new Error('Only the pinned Gemini text endpoint without URL credentials/query is permitted');
}
export function inJudgingWindow(now:Date): boolean {
  // Official event schedule: 12:30–16:30 EST on 2026-11-15; conservatively protect 30 min before and after.
  return now.getTime()>=Date.parse('2026-11-15T17:00:00Z')&&now.getTime()<=Date.parse('2026-11-15T22:00:00Z');
}
