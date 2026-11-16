import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('scope accepts only an explicit Google Meet meeting, without origin lookalikes',async()=>{
  // JS extension module intentionally has no build step.
  const {meetIdentity}=await import('../flow-capture/scope.js');
  for(const raw of ['https://meet.google.com/abc-defg-hij'])assert.equal(meetIdentity(raw),'/abc-defg-hij');
  for(const raw of ['http://meet.google.com/abc-defg-hij','https://meet.google.com.evil/abc-defg-hij','https://meet.google.com/','https://evil.test/abc-defg-hij','file:///etc/passwd'])assert.equal(meetIdentity(raw),null);
});
test('actual AudioWorklet handles stereo, clipping, partial quanta and exact PCM count',()=>{
  let Processor:any;const chunks:ArrayBuffer[]=[];
  class Base {port={postMessage:(b:ArrayBuffer)=>chunks.push(b)}}
  const sandbox={AudioWorkletProcessor:Base,Int16Array,Math,registerProcessor:(_:string,p:any)=>Processor=p};
  vm.runInNewContext(readFileSync(new URL('../flow-capture/pcm-worklet.js',import.meta.url),'utf8'),sandbox);
  const p=new Processor();
  for(let i=0;i<25;i++)p.process([[new Float32Array(128).fill(1),new Float32Array(128).fill(1)]]);
  assert.equal(chunks.length,2);assert.equal(new Int16Array(chunks[0])[0],32767);assert.equal(chunks[0].byteLength,3200);
  for(let i=0;i<25;i++)p.process([[new Float32Array(128).fill(-2),new Float32Array(128).fill(-2)]]);
  assert.equal(new Int16Array(chunks[2])[0],-32768);
});
test('extension contains no microphone/video/content-script or external-message capability',()=>{
  const m=JSON.parse(readFileSync(new URL('../flow-capture/manifest.json',import.meta.url),'utf8'));
  assert.equal(m.manifest_version,3);assert.equal(m.content_scripts,undefined);assert.equal(m.externally_connectable,undefined);
  assert.deepEqual(m.host_permissions,['http://127.0.0.1:18892/*']);
  assert.equal(m.permissions.includes('audioCapture'),false);
});
test('Stop during an unresolved Chrome stream request cannot restart offscreen capture',async()=>{
  const {meetIdentity}=await import('../flow-capture/scope.js');
  let handler:any,resolveStream:any,streamRequested=false,startCount=0,reply:any;
  const event=()=>({addListener:()=>{}});
  const chrome={runtime:{id:'owned-extension',onMessage:{addListener:(fn:any)=>handler=fn},onStartup:event(),onInstalled:event(),
    getContexts:async()=>[],sendMessage:async(m:any)=>{if(m.type==='start')startCount++;return {ok:true};}},
    storage:{session:{remove:async()=>{},set:async()=>{},get:async()=>({})}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},offscreen:{createDocument:async()=>{}},
    tabs:{get:async()=>({id:9,active:true,url:'https://meet.google.com/abc-defg-hij'}),onRemoved:event(),onUpdated:event()},
    tabCapture:{getMediaStreamId:async()=>{streamRequested=true;return new Promise(r=>resolveStream=r);}}};
  const script=readFileSync(new URL('../flow-capture/worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(script,{chrome,meetIdentity,Error});
  handler({target:'worker',type:'start',tabId:9,token:'test-only'},{id:'owned-extension'},(r:any)=>reply=r);
  while(!streamRequested)await new Promise(r=>setImmediate(r));
  handler({target:'worker',type:'stop'},{id:'owned-extension'},()=>{});
  resolveStream('late-stream');await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(startCount,0);assert.equal(reply.ok,false);
});
