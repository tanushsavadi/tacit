import test from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.ts';
import { cases, priority, mockFor } from '../src/cases.ts';
import { chips, reference, validateResolution } from '../src/references.ts';
import type { Resolution } from '../src/contracts.ts';

for (const c of cases) test(`MOCK contract and exact user point: ${c.id}`, async () => {
  const b = new Bridge(c.context); const out = await b.resolve(mockFor(c));
  assert.equal(out.state, 'ready'); assert.equal(b.snapshot.selected, null);
  assert.throws(() => b.compose(), /Select/);
  const ref = b.snapshot.resolution!.references.find(r => r.turnId === c.selected!.turnId && r.quote === c.selected!.quote)!;
  const turn = c.context.turns.find(t => t.id === ref.turnId)!;
  assert.equal(turn.text.slice(ref.start, ref.end), ref.quote);
  b.select(ref.id); assert.throws(() => b.compose(), /author/);
  b.author(c.position); const d = b.compose();
  assert.ok(d.text.endsWith(c.position.point)); assert.equal(d.userPoint, c.position.point);
  const artifact = b.approve(d.hash); assert.equal(artifact.kind, 'approved-research-text-only'); assert.equal(artifact.text,d.text);
  assert.throws(() => b.approve(d.hash), /Already/);
});

const base = priority[0]!;
for (const [name, mutate] of [
  ['invented quote', (r: Resolution) => { r.references[0]!.quote = 'Sunday at 9'; }],
  ['unknown turn', (r: Resolution) => { r.references[0]!.turnId = 'missing'; }],
  ['duplicate references', (r: Resolution) => { r.state='ambiguous'; r.references.push({...r.references[0]!}); }],
  ['singleton ambiguity', (r: Resolution) => { r.state='ambiguous'; }],
  ['multiple resolved', (r: Resolution) => { r.references.push({turnId:'t1',quote:'Friday at 2'}); }],
  ['unresolved references', (r: Resolution) => { r.state='unresolved'; }],
  ['empty resolved', (r: Resolution) => { r.references=[]; }],
] as const) test(`reject ${name}`, () => { const r=structuredClone(base.expected); mutate(r); assert.throws(() => validateResolution(r,base.context)); });

for (const extra of ['speak','toolCall','userPoint','opinion','text','commitment','confidence']) test(`reject unexpected model field ${extra}`, () => {
  assert.throws(() => validateResolution({...base.expected,[extra]:'yes'},base.context));
});
test('reject nested tool injection', () => assert.throws(() => validateResolution({...base.expected,references:[{...base.expected.references[0],speak:true}]},base.context)));
test('source correction revokes old Friday', () => assert.throws(() => validateResolution(base.expected,priority[1]!.context),/correction/));
test('exact quotations are case sensitive', () => assert.throws(() => reference(base.context,'t1','friday at 4'),/exact/));
test('duplicate quotation requires larger span', () => assert.throws(() => reference({revision:1,turns:[{id:'t1',text:'Friday at 4 or Friday at 4'}]},'t1','Friday at 4'),/more than once/));
test('duplicate source IDs rejected', () => assert.throws(() => new Bridge({revision:1,turns:[{id:'x',text:'a'},{id:'x',text:'b'}]})));
test('empty context rejected', () => assert.throws(() => new Bridge({revision:1,turns:[]})));
test('unknown reference selection refused', async () => {const b=new Bridge(base.context);await b.resolve(mockFor(base));assert.throws(()=>b.select('fake'),/Explicit/);});
test('ambiguous choices stay unselected', async () => {const b=new Bridge(priority[2]!.context);await b.resolve(mockFor(priority[2]!));assert.equal(b.snapshot.resolution!.references.length,2);assert.equal(b.snapshot.selected,null);});
for (const state of ['unresolved','abstain'] as const) test(`${state} cannot compose`, async () => {
  const b=new Bridge(base.context); const o=await b.resolve(async()=>({state,references:[],layout:'reference-first'}));
  assert.equal(o.state,'ready');b.author(base.position);assert.throws(()=>b.compose());
});
test('empty and control-character points refused', () => {const b=new Bridge(base.context);for(const point of ['', ' ', '\nhello','x'.repeat(501)]) assert.throws(()=>b.author({intent:'share_view',point}));});
test('snapshot cannot mutate state', async()=>{const b=new Bridge(base.context);await b.resolve(mockFor(base));b.snapshot.resolution!.references[0]!.quote='wrong';assert.equal(b.snapshot.resolution!.references[0]!.quote,'Friday at 4');});
test('model adapter cannot mutate authoritative source text',async()=>{
  const b=new Bridge(base.context);const out=await b.resolve(async input=>{
    input.context.turns[0]!.text='Sunday at 9';return {...base.expected,references:[{turnId:'t1',quote:'Sunday at 9'}]};
  });assert.equal(out.state,'failed');assert.equal(b.snapshot.context.turns[0]!.text,base.context.turns[0]!.text);
});
async function composed() { const b=new Bridge(base.context);await b.resolve(mockFor(base));b.select(b.snapshot.resolution!.references[0]!.id);b.author(base.position);return {b,d:b.compose()}; }
test('hash mismatch refused', async()=>{const {b}=await composed();assert.throws(()=>b.approve('bad'),/Stale/);});
test('caller mutation of draft cannot affect approval', async()=>{const {b,d}=await composed();const h=d.hash;d.text='I agree';assert.notEqual(b.approve(h).text,d.text);});
test('changed user position invalidates approval', async()=>{const {b,d}=await composed();b.author({intent:'disagree',point:'no'});assert.throws(()=>b.approve(d.hash));});
test('changed selected reference invalidates approval', async()=>{const c=priority[2]!;const b=new Bridge(c.context);await b.resolve(mockFor(c));b.select(b.snapshot.resolution!.references[0]!.id);b.author(c.position);const d=b.compose();b.select(b.snapshot.resolution!.references[1]!.id);assert.throws(()=>b.approve(d.hash));});
test('new context invalidates every old approval', async()=>{const {b,d}=await composed();b.setContext({...base.context,revision:2});assert.throws(()=>b.approve(d.hash));assert.equal(b.snapshot.selected,null);});
test('nonincreasing context revision rejected',()=>{const b=new Bridge(base.context);assert.throws(()=>b.setContext(base.context),/increase/);});
test('cancel clears ready draft and choices',async()=>{const {b,d}=await composed();b.cancel();assert.throws(()=>b.approve(d.hash));assert.equal(b.snapshot.resolution,null);});
test('model returning prose fails closed',async()=>{const b=new Bridge(base.context);assert.equal((await b.resolve(async()=> 'Yes!')).state,'failed');});
test('model failure has no draft',async()=>{const b=new Bridge(base.context);assert.equal((await b.resolve(async()=>{throw Error('failure');})).state,'failed');assert.equal(b.snapshot.draft,null);});
test('late ignoring-abort model cannot resurrect cancelled state',async()=>{
  const b=new Bridge(base.context);let deliver!:(x:unknown)=>void;
  const p=b.resolve(async()=>new Promise(r=>{deliver=r;}));b.cancel();
  assert.equal((await p).state,'cancelled');deliver(base.expected);await Promise.resolve();assert.equal(b.snapshot.resolution,null);
});
test('newer request wins when old response arrives last',async()=>{
  const b=new Bridge(base.context);let deliver!:(x:unknown)=>void;
  const first=b.resolve(async()=>new Promise(r=>{deliver=r;}));const second=await b.resolve(mockFor(base));
  deliver({state:'unresolved',references:[],layout:'point-first'});assert.equal((await first).state,'cancelled');assert.equal(second.state,'ready');assert.equal(b.snapshot.resolution!.state,'resolved');
});
test('context change during inference cancels result',async()=>{
  const b=new Bridge(base.context);let deliver!:(x:unknown)=>void;
  const p=b.resolve(async()=>new Promise(r=>{deliver=r;}));b.setContext({...priority[1]!.context,revision:2});deliver(base.expected);
  assert.equal((await p).state,'cancelled');assert.equal(b.snapshot.resolution,null);
});
test('deadline also works when provider ignores AbortSignal',async()=>{
  const b=new Bridge(base.context);const p=b.resolve(async()=>new Promise(()=>{}),5);assert.equal((await p).state,'failed');assert.equal(b.snapshot.resolution,null);
});
test('instruction quotation rejected',()=>{
  const c=priority[5]!;assert.throws(()=>validateResolution({state:'resolved',references:[{turnId:'t2',quote:c.context.turns[1]!.text}],layout:'reference-first'},c.context),/Instruction/);
});
test('semantic incompleteness is NOT proved by citation validation',()=>{
  const c=priority[2]!;const singleton={...c.expected,state:'resolved',references:[c.expected.references[0]]};
  const r=validateResolution(singleton,c.context);assert.equal(r.state,'resolved');assert.ok(r.warnings[0]!.includes('not guaranteed'));
});
test('wrong but literal earlier referent passes grounding; must be counted as semantic error',()=>{
  const r=validateResolution({...base.expected,references:[{turnId:'t1',quote:'Friday at 2'}]},base.context);
  assert.equal(r.references[0]!.quote,'Friday at 2');
});
test('point-first preserves disagreement and condition exactly',async()=>{
  const c=priority[3]!;const b=new Bridge(c.context);await b.resolve(async()=>({...c.expected,layout:'point-first'}));b.select(b.snapshot.resolution!.references[0]!.id);b.author(c.position);assert.ok(b.compose().text.startsWith(c.position.point));
});
test('baseline resolves later without assuming availability',()=>{assert.deepEqual(chips(base.context).references.map(r=>r.quote),['Friday at 4']);});
test('baseline preserves two-topic ambiguity',()=>assert.equal(chips(priority[2]!.context).references.length,2));
test('baseline correction barrier selects Thursday instead of reusing Friday',()=>assert.deepEqual(chips(priority[1]!.context).references.map(r=>r.quote),['Thursday']));
test('baseline handles explicit am/pm',()=>{
  const c={revision:1,turns:[{id:'t1',text:'Friday at 11am or Friday at 1pm.'},{id:'t2',text:'The later one?'}]};assert.equal(chips(c).references[0]!.quote,'Friday at 1pm');
});
