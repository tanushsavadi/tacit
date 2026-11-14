import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSelect, canConfirm, validProposal } from '../src/candidateState.ts';
import { previewSnapshot, reducePreview } from '../src/dev/previewAdapter.ts';
const base=previewSnapshot(1000);
const selected=()=>reducePreview(base,{type:'tap_select',candidateSetId:'preview-1',index:1},1100);
test('candidate selection requires a connected active call and selectable phase',()=>{
  assert.equal(canSelect(base,true),true);assert.equal(canSelect(base,false),false);
  assert.equal(canSelect({...base,sessionId:null},true),false);
  assert.equal(canSelect({...base,phase:'SPEAKING'},true),false);
  assert.equal(canSelect({...base,candidateSet:null},true),false);
});
test('confirmation checks current set, current phase, guard time, expiry, connection and session',()=>{
  const s=selected();assert.equal(validProposal(s,true,1200),true);assert.equal(canConfirm(s,true,1200),false);assert.equal(canConfirm(s,true,1700),true);
  assert.equal(canConfirm(s,true,16100),false);assert.equal(canConfirm(s,false,1700),false);
  assert.equal(canConfirm({...s,sessionId:null},true,1700),false);assert.equal(canConfirm({...s,phase:'CANCELLED'},true,1700),false);
  assert.equal(canConfirm({...s,candidateSet:{...s.candidateSet!,id:'new-set'}},true,1700),false);
});
test('fixture rejects stale candidate IDs, invalid indices, and repeated selection',()=>{
  assert.equal(reducePreview(base,{type:'tap_select',candidateSetId:'stale',index:0}),base);
  assert.equal(reducePreview(base,{type:'tap_select',candidateSetId:'preview-1',index:8}),base);
  const s=selected();assert.equal(reducePreview(s,{type:'tap_select',candidateSetId:'preview-1',index:0}),s);
});
test('fixture confirmation never generates speech, and requires matching proposal ID',()=>{
  const s=selected();assert.equal(reducePreview(s,{type:'confirm',proposalId:'stale',source:'tap'},1700),s);
  assert.equal(reducePreview(s,{type:'confirm',proposalId:s.proposal!.id,source:'tap'},1200),s);
  const out=reducePreview(s,{type:'confirm',proposalId:s.proposal!.id,source:'tap'},1700);
  assert.equal(out.proposal,null);assert.equal(out.speech,null);assert.match(out.notice!.message,/No audio/);
});
test('cancel and hangup invalidate the current proposal',()=>{
  const s=selected();assert.equal(reducePreview(s,{type:'cancel',source:'key'},1700).proposal,null);
  const ended=reducePreview(s,{type:'hangup'},1700);assert.equal(ended.sessionId,null);assert.equal(ended.proposal,null);assert.equal(ended.candidateSet,null);
});
