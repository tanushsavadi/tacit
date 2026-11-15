#!/usr/bin/env node
// Silent verification in the isolated QA checkout. Never connects to or controls the demo runtime.
import {spawn, spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,openSync,closeSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
if(existsSync(join(root,'server/.env'))) throw new Error('Use the isolated QA checkout without a server/.env.');
const output=join(root,'server/data/p1-reliability',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(join(output,'tmp'),{recursive:true,mode:0o700});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer',
  TACIT_QA_WIRE_PATH:join(output,'native-wire.json')};
const results=[];
function run(name,bin,args,cwd=root,vars=env) {
  const r=spawnSync(bin,args,{cwd,env:vars,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});
  writeFileSync(join(output,name+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});
  results.push({name,exit:r.status,signal:r.signal,error:r.error?.message});
  console.log(`${r.status===0?'PASS':'FAIL'} ${name}`);
  return r.status===0;
}
run('native','swift',['test','--package-path','macos/TacitCompanion']);
run('native-release','swift',['build','-c','release','--package-path','macos/TacitCompanion']);
run('offline-selftest',join(root,'macos/TacitCompanion/.build/release/TacitCompanion'),['--offline-selftest']);
run('route','swift',['test','--package-path','macos/TacitRoute']);
run('voice','swift',['test','--package-path','macos/TacitVoice']);
run('backend-typecheck','npm',['run','typecheck'],join(root,'server'));
run('backend','npm',['test'],join(root,'server'));
run('integration-typecheck',join(root,'server/node_modules/.bin/tsc'),['--noEmit','--strict','--allowImportingTsExtensions',
 '--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--esModuleInterop','--skipLibCheck','../docs/qa/conversation.test.ts'],join(root,'server'));
run('integration',join(root,'server/node_modules/.bin/vitest'),['run','--config','docs/qa/vitest.config.mjs']);
for(const task of ['typecheck','test','build']) run('web-'+task,'npm',['run',task],join(root,'web'));
run('preflight-helper-tests',process.execPath,['--test','docs/demo-preflight-codex.test.mjs']);
// Independent server: no credentials/config inherited, no recognizer, no voice helper or audio route.
// An unreachable STT endpoint enables the stream-auth path; invalid tokens are rejected before transcription.
// A private TMPDIR also isolates the server's stale-audio sweep from the live runtime.
const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port; await new Promise(r=>probe.close(r));
const securityTmp=mkdtempSync('/tmp/tacit-p1-');
const securityEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:securityTmp,
  PORT:String(port),TACIT_HOST:'127.0.0.1',TACIT_ROUTE:'off',TACIT_VOICE:'off',WHISPER_SERVER:'off',WHISPER_SERVER_URL:'http://127.0.0.1:1',
  RECOGNITION_AUTOSTART:'off',RECOGNITION_URL:'http://127.0.0.1:1',TACIT_HTTP:`http://127.0.0.1:${port}`};
const log=openSync(join(output,'security-server.log'),'w',0o600);
const server=spawn(process.execPath,['--import','tsx',join(root,'server/src/index.ts')],
  {cwd:join(root,'server'),env:securityEnv,stdio:['ignore',log,log]});
try {
  let ready=false;
  for(let i=0;i<100;i++) {
    if(server.exitCode!==null) break;
    try { const r=await fetch(securityEnv.TACIT_HTTP+'/api/health'); if(r.ok) {ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,100));
  }
  if(!ready) {results.push({name:'security',exit:1,error:'Isolated server did not become ready'});console.log('FAIL security startup');}
  else run('security','npm',['run','security:check'],join(root,'server'),securityEnv);
} finally {
  server.kill('SIGTERM');
  await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));
  closeSync(log);
  rmSync(securityTmp,{recursive:true,force:true});
}
writeFileSync(join(output,'report.json'),JSON.stringify({at:new Date().toISOString(),root,output,
 scope:'Offline/synthetic speech and recognition; security uses a separate loopback server with audio disabled',results},null,2));
console.log('Evidence: '+output);
process.exitCode=results.some(r=>r.exit!==0)?1:0;
