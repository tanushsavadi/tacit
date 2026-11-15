#!/usr/bin/env node
// Independent, silent acceptance orchestrator. Never runs live:* / reviewed:check / speech:check / route:check.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
const option=name=> { const i=args.indexOf(name); return i<0?null:args[i+1]; };
if(args.includes('--help')) {
  console.log('node docs/qa/acceptance.mjs --native-root REPO [--runtime-root REPO] [--output NEW_DIRECTORY]\n'+
    'Copies native source into private QA output, adds independent tests, runs existing backend/native tests and native-wire replay.\n'+
    '--runtime-root composes existing passive preflight ONLY; no sockets/camera/audio/server control.\n'+
    'Exit 1 = failed gate; 2 = automated gates passed with human checks pending. Use project Node 22 for the passive wrapper; server npm ci first.');
  process.exit(0);
}
const nativeRoot=resolve(option('--native-root')??root);
const runtimeRoot=option('--runtime-root');
const output=resolve(option('--output')??join(root,'server/data/independent-qa',new Date().toISOString().replace(/[:.]/g,'-')));
if(existsSync(output)) throw new Error('Use a new output directory; previous evidence is preserved.');
mkdirSync(output,{recursive:true,mode:0o700});
const report={startedAt:new Date().toISOString(),nodeVersion:process.versions.node,root,nativeRoot,output,mode:'SYNTHETIC / NO PHYSICAL OUTPUT',
  sourceCommit:git(root,['rev-parse','HEAD']),nativeCommit:git(nativeRoot,['rev-parse','HEAD']),
  nativeWorkingChanges:git(nativeRoot,['status','--short','--','macos/TacitCompanion']),checks:[],
  humanOnly:['Live camera endpointing and silent recognition accuracy','Remote listener exact words/once and Stop silence',
    'Actual VoiceOver/switch access and AAC-user usability','Integrated selected-voice listening and physical Speak latency',
    'Compositor frame pacing under inference/call load; display/text scaling']};
function git(cwd,a) { const r=spawnSync('git',a,{cwd,encoding:'utf8'}); return r.status===0?r.stdout.trim():'unknown'; }
function manifest(dir) {
  const files={};
  function visit(path,relative='') {
    for(const e of readdirSync(path,{withFileTypes:true})) {
      if(e.isSymbolicLink()||e.name==='.build') continue;
      const key=join(relative,e.name),full=join(path,e.name);
      if(e.isDirectory()) visit(full,key);
      else files[key]=createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
  visit(dir); return files;
}
function run(name,bin,a,cwd=root,extra={}) {
  const started=performance.now();
  const r=spawnSync(bin,a,{cwd,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,
    env:{...process.env,DEVELOPER_DIR:process.env.DEVELOPER_DIR??'/Applications/Xcode.app/Contents/Developer',...extra}});
  // Only offline test tools and the existing credential-redacting passive wrapper are allowed here.
  const log=(r.stdout??'')+(r.stderr??'');
  writeFileSync(join(output,name+'.log'),log,{mode:0o600});
  const state=r.status===0?'PASS':name==='runtime-preflight'&&r.status===2?'HUMAN ACTION':'FAIL';
  const row={name,state,exit:r.status,signal:r.signal,elapsedMs:Math.round(performance.now()-started),log:join(output,name+'.log')};
  report.checks.push(row); console.log(`${state} ${name} (${row.elapsedMs} ms)`); return row;
}
const source=join(nativeRoot,'macos/TacitCompanion');
const snapshot=join(output,'native'); mkdirSync(snapshot);
const before=manifest(join(source,'Sources'));
for(const path of ['Package.swift','Sources','Tests']) cpSync(join(source,path),join(snapshot,path),{recursive:true});
const copied=manifest(join(snapshot,'Sources'));
writeFileSync(join(output,'native-source-manifest.json'),JSON.stringify({root:nativeRoot,commit:report.nativeCommit,files:before},null,2));
cpSync(join(root,'docs/qa/ConversationAuditTests.swift'),join(snapshot,'Tests/TacitCompanionTests/ConversationAuditTests.swift'));
const wire=join(output,'native-wire.json');
run('backend-typecheck','npm',['run','typecheck'],join(root,'server'));
run('qa-typecheck',join(root,'server/node_modules/.bin/tsc'),['--noEmit','--strict','--allowImportingTsExtensions',
  '--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--esModuleInterop','--skipLibCheck','../docs/qa/conversation.test.ts'],join(root,'server'));
run('backend-existing','npm',['test'],join(root,'server'));
run('native-with-audit','swift',['test','--package-path',snapshot],root,{TACIT_QA_WIRE_PATH:wire});
// Keep the existing offline selftest, without launching a production app or reading credentials.
if(existsSync(join(snapshot,'Sources/TacitCompanion/OfflineSelfTest.swift')))
  run('native-offline-selftest',join(snapshot,'.build/debug/TacitCompanion'),['--offline-selftest']);
if(existsSync(wire)) run('conversation-contracts',join(root,'server/node_modules/.bin/vitest'),['run','--config','docs/qa/vitest.config.mjs'],root,{TACIT_QA_WIRE_PATH:wire});
else report.checks.push({name:'native-wire-export',state:'FAIL',reason:'native test did not produce wire fixture'});
run('preflight-helper-tests',process.execPath,['--test','docs/demo-preflight-codex.test.mjs']);
if(runtimeRoot) {
  const release=resolve(runtimeRoot);
  const baseline={src:manifest(join(root,'server/src')),shared:manifest(join(root,'shared')),scripts:manifest(join(root,'server/scripts'))};
  const runningSource={src:manifest(join(release,'server/src')),shared:manifest(join(release,'shared')),scripts:manifest(join(release,'server/scripts'))};
  report.runtimeSourceCommit=git(release,['rev-parse','HEAD']);
  report.checks.push({name:'backend-release-source-equivalence',state:JSON.stringify(baseline)===JSON.stringify(runningSource)?'PASS':'FAIL',
    reason:'Frozen QA backend and release source must agree; this does not prove the running process revision'});
  writeFileSync(join(output,'backend-source-manifest.json'),JSON.stringify(baseline,null,2));
  run('runtime-preflight',process.execPath,[join(resolve(runtimeRoot),'docs/demo-preflight-codex.mjs')],resolve(runtimeRoot));
  run('runtime-status',process.execPath,[join(root,'docs/qa/passive-status.mjs'),resolve(runtimeRoot)]);
}
else report.checks.push({name:'runtime-preflight',state:'UNVERIFIED',reason:'supply --runtime-root for passive actual integration inspection'});
const after=manifest(join(source,'Sources'));
report.checks.push({name:'native-source-stability',state:JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(copied)===JSON.stringify(before)?'PASS':'FAIL'});
report.finishedAt=new Date().toISOString();
report.assessment=report.checks.some(c=>c.state==='FAIL')?'NO-GO for complete integrated acceptance':'CONDITIONAL GO; human checks required';
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(`${report.assessment}\nEvidence: ${output}\nHuman-only checks: ${report.humanOnly.join('; ')}`);
process.exitCode=report.checks.some(c=>c.state==='FAIL')?1:2;
