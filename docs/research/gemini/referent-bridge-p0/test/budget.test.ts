import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowEndpoint,inJudgingWindow,reserveCall } from '../src/budget.ts';
test('persistent budget permits two unique reservations and rejects third',()=>{
  const d=mkdtempSync(join(tmpdir(),'bridge-budget-'));try{const p=join(d,'ledger.json');reserveCall(p,'bridge');reserveCall(p,'hmr');assert.throws(()=>reserveCall(p,'third'),/exhausted/);assert.equal(JSON.parse(readFileSync(p,'utf8')).attempts.length,2);}finally{rmSync(d,{recursive:true});}
});
test('failed call reservation cannot be retried',()=>{
  const d=mkdtempSync(join(tmpdir(),'bridge-budget-'));try{const p=join(d,'ledger.json');reserveCall(p,'bridge');assert.throws(()=>reserveCall(p,'bridge'),/already/);}finally{rmSync(d,{recursive:true});}
});
test('malformed ledger fails closed',()=>{
  const d=mkdtempSync(join(tmpdir(),'bridge-budget-'));try{const p=join(d,'ledger.json');writeFileSync(p,'{}');assert.throws(()=>reserveCall(p,'bridge'));}finally{rmSync(d,{recursive:true});}
});
test('budget lock prevents concurrent writes',()=>{
  const d=mkdtempSync(join(tmpdir(),'bridge-budget-'));try{const p=join(d,'ledger.json');writeFileSync(`${p}.lock`,'');assert.throws(()=>reserveCall(p,'bridge'));}finally{rmSync(d,{recursive:true});}
});
test('only pinned text endpoint allowed',()=>{
  allowEndpoint('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  for(const url of ['http://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent','https://evil.example/v1/models/gemini-3.5-flash-lite:generateContent','https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=secret','https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent','http://localhost:8790/ws'])assert.throws(()=>allowEndpoint(url));
});
test('scheduled judging guard includes rehearsal margin',()=>{
  assert.equal(inJudgingWindow(new Date('2026-11-15T11:55:00Z')),false);
  for(const t of ['17:00:00','17:30:00','21:59:59','22:00:00'])assert.equal(inJudgingWindow(new Date(`2026-11-15T${t}Z`)),true);
});
