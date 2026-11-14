/** Recorded VOICED actor pixels → actual browser MediaPipe/JPEGs → actual Auto-AVSR. No model mocks or speech. */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base = process.env.TACIT_WEB_URL ?? 'http://localhost:5173';
const artifacts = new URL('../artifacts/live/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const videoPath = fileURLToPath(new URL('recorded-voiced.mp4', artifacts));
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', fileURLToPath(new URL('../../recognition/eval/clips/cremad/1040_IEO_NEU_XX.flv', import.meta.url)), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath]);
const secrets = JSON.parse(await readFile(new URL('../../server/data/secrets.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(user => {
 sessionStorage.setItem('tacit-access-user',user); window.testWire=[];window.testHypotheses=[];
 const send=WebSocket.prototype.send;
 WebSocket.prototype.send=function(data){
  if(new URL(this.url).pathname==='/ws'){
   if(!this.testObserved){window.testSocket=this;this.testObserved=true;this.addEventListener('message',event=>{if(typeof event.data!=='string')return;const m=JSON.parse(event.data);if(m.type==='live_status')this.testAuthorized=m.status.state==='active';if(m.type==='recognition_hypothesis')window.testHypotheses.push({...m.hypothesis,receivedAt:Date.now()});});}
   if(data instanceof Blob)window.testWire.push({kind:'jpeg',bytes:data.size,authorized:!!this.testAuthorized});
   else {const m=JSON.parse(data);window.testWire.push({kind:m.type,id:m.utteranceId,frameTimes:m.frameTimesMs,action:m.action,sentAt:Date.now()});}
  }
  return send.call(this,data);
 };
}, secrets.userToken);
const page = await context.newPage(); const errors = [], sent = [], hypotheses = [], statuses = [], batches = [];
let binary = 0;
page.on('pageerror', e => errors.push(e.message));
page.on('websocket', socket => {
 if (!new URL(socket.url()).pathname.endsWith('/ws')) return;
 socket.on('framesent',e=>{if(typeof e.payload==='string'){const m=JSON.parse(e.payload);sent.push(m.type);}});
 socket.on('framereceived', e => {
  if (typeof e.payload !== 'string') return;
  const m = JSON.parse(e.payload);
  if (m.type === 'live_status') { statuses.push(m.status); }
  if (m.type === 'recognition_hypothesis') hypotheses.push({ ...m.hypothesis, receivedAt:Date.now() });
 });
});
const audit = async state => { const r = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze(); assert.deepEqual(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})), [], state); };
const capture = async name => page.screenshot({path:fileURLToPath(new URL(name, artifacts)), fullPage:true, animations:'disabled', mask:[page.locator('.camera-preview')], maskColor:'#1b221d'});
try {
 await page.goto(base); await page.getByText('System connected', {exact:true}).waitFor();
 await page.getByRole('button', {name:'Start Live preview', exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.instrument-controls .button-primary')?.disabled);
 assert.equal(await page.locator('.call-status').count(), 0, 'a caller must not be required');
 assert.equal(binary, 0); await capture('everyday-desktop.png'); await audit('everyday inactive');
 await page.evaluate(async () => {
  const video = document.createElement('video'); video.muted = true; video.src = '/artifacts/live/recorded-voiced.mp4';
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;video.load();});
  const canvas=document.createElement('canvas'); canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d'); await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=.1;});ctx.drawImage(video,0,0);
  let stream=null,track=null;
  navigator.mediaDevices.getUserMedia = async constraints => { if (!constraints.video || constraints.audio) throw new Error('This test permits recorded video only'); stream=canvas.captureStream(0);track=stream.getVideoTracks()[0];window.referenceStream=stream;return stream; };
  window.referenceCanvas=canvas;window.referenceVideo=video; window.referenceDraw=setInterval(()=>{ctx.drawImage(video,0,0);track?.requestFrame();},1000/30);
  const banner=document.createElement('div'); banner.id='test-provenance';banner.textContent='RECORDED VOICED ACTOR → REAL AUTO-AVSR · NOT HUMAN SILENT SPEECH · NO OUTPUT';banner.style.cssText='padding:14px;background:#463a22;color:#fff1cd;text-align:center;font:14px sans-serif';document.body.prepend(banner);
 });
 await page.getByRole('button',{name:'Start Live preview',exact:true}).click();
 await page.getByText('Live preview', {exact:true}).waitFor({timeout:30000});
 assert.equal(binary, 0, 'static setup must not upload a phrase');
 // Two independent utterances use the same authorized session, with no routine confirmation.
 for (let i=0;i<2;i++) {
  const before=hypotheses.length;
  await page.evaluate(async()=>{window.referenceVideo.currentTime=0;await window.referenceVideo.play();});
  await page.waitForFunction(count=>window.testHypotheses.length>count,before,{timeout:45000});
  await page.waitForTimeout(900);
  assert.ok(hypotheses.length>before, `utterance ${i+1} produced no real hypothesis`);
 }
 assert.equal(new Set(statuses.filter(s=>s.state==='active').map(s=>s.authorizationId)).size, 1, 'no reset between utterances');
 assert.ok(hypotheses.filter(h=>h.decision==='shown').length>=2);
 for (const h of hypotheses) { assert.equal(h.transmitted,false); assert.equal(h.stable,false); assert.equal(h.uncertainty?.calibrated,false); }
 const last=hypotheses.at(-1); assert.equal(await page.locator('.recognized-words').innerText(),last.rawText);
 await capture('everyday-actual-model.png');
 await page.getByRole('button',{name:'Presenter',exact:true}).click();
 await page.getByLabel('Presenter input declaration').selectOption('recorded');
 await capture('presenter-recorded-real-model.png'); await audit('presenter actual model');
 await page.getByRole('button',{name:'Hide camera preview',exact:true}).click();
 const beforeHide=hypotheses.length; await page.evaluate(async()=>{window.referenceVideo.currentTime=0;await window.referenceVideo.play();});
 await page.waitForFunction(count=>window.testHypotheses.length>count,beforeHide,{timeout:45000}); assert.ok(hypotheses.length>beforeHide,'hiding preview interrupted recognition');
 await capture('actual-output-unavailable.png');
 await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); await audit('presenter mobile'); await capture('presenter-mobile.png');
 await page.getByRole('button',{name:'Presenter',exact:true}).click(); await capture('everyday-compact.png'); await audit('everyday active mobile');
 const beforePause=hypotheses.length;
 await page.evaluate(async()=>{window.referenceVideo.currentTime=0;await window.referenceVideo.play();});
 await page.getByText('Recognizing',{exact:true}).waitFor({timeout:15000});
 await page.getByRole('button',{name:'Pause live speech and stop audio',exact:true}).click();
 await page.getByText('Input paused. Nothing is being transmitted.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('video')?.srcObject===null);
 const atPause=await page.evaluate(()=>window.testWire.filter(w=>w.kind==='jpeg').length); await page.waitForTimeout(900); assert.equal(await page.evaluate(()=>window.testWire.filter(w=>w.kind==='jpeg').length),atPause,'pause did not stop uploads');
 assert.equal(await page.locator('.recognized-words:not(.placeholder)').count(),0);
 await page.waitForFunction(count=>window.testHypotheses.length>count,beforePause,{timeout:30000});
 assert.equal(hypotheses.at(-1)?.decision,'abstained','paused decoder result should be invalidated');
 assert.equal(await page.locator('.recognized-words:not(.placeholder)').count(),0,'late decoder updated paused UI');
 await page.evaluate(()=>{window.referenceVideo.pause();window.referenceVideo.currentTime=.1;});
 await page.getByRole('button',{name:'Resume Live preview',exact:true}).click();
 await page.getByText('Live preview',{exact:true}).waitFor({timeout:30000});
 const resumed=hypotheses.length;await page.evaluate(async()=>{window.referenceVideo.currentTime=0;await window.referenceVideo.play();});
 await page.waitForFunction(count=>window.testHypotheses.length>count,resumed,{timeout:30000});
 assert.equal(hypotheses.at(-1)?.decision,'shown');
 await page.evaluate(()=>window.testSocket.close());
 await page.getByText('Input paused. Nothing is being transmitted.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.connection-status')?.textContent==='System connected',null,{timeout:15000});
 assert.equal(await page.locator('.recognized-words:not(.placeholder)').count(),0,'reconnect retained stale words');
 const reconnectFrames=await page.evaluate(()=>window.testWire.filter(w=>w.kind==='jpeg').length);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.testWire.filter(w=>w.kind==='jpeg').length),reconnectFrames,'reconnect resumed without consent');
 await page.getByRole('button',{name:'Stop session',exact:true}).click(); await page.waitForTimeout(200); assert.equal(statuses.at(-1)?.state,'off');
 assert.equal(sent.some(t=>['confirm','tap_select','mouth_gesture_select'].includes(t)),false); assert.deepEqual(errors,[]);
 const wire=await page.evaluate(()=>window.testWire);const binaryWire=wire.filter(w=>w.kind==='jpeg');assert.ok(binaryWire.length>0);assert.ok(binaryWire.every(w=>w.authorized));
 for(let i=0;i<wire.length;i++){const w=wire[i];if(w.kind!=='visual_utterance')continue;const frames=wire.slice(i+1,i+1+w.frameTimes.length);assert.equal(frames.length,w.frameTimes.length);assert.ok(frames.every(f=>f.kind==='jpeg'),'batch interleaved');assert.ok(w.frameTimes.every((t,k)=>!k||t>w.frameTimes[k-1]));batches.push({id:w.id,sentAt:w.sentAt,frameTimes:w.frameTimes,count:frames.length,bytes:frames.reduce((n,f)=>n+f.bytes,0)});}

 const browserHypotheses=await page.evaluate(()=>window.testHypotheses);
 const result={source:'Previously recorded VOICED CREMA-D actor 1040_IEO_NEU_XX; canvas camera replacement; actual MediaPipe, timestamped JPEG transport, authenticated socket and Auto-AVSR. No human silent accuracy or audibility claim.',reference:"IT'S ELEVEN O'CLOCK", results:browserHypotheses.map(h=>({rawText:h.rawText,decision:h.decision,transmitted:h.transmitted,stable:h.stable,recognitionMs:h.recognitionMs,stages:h.stages,uncertainty:h.uncertainty,roundTripMs:batches.some(b=>b.id===h.utteranceId)?h.receivedAt-batches.find(b=>b.id===h.utteranceId).sentAt:null})), batches:batches.map(b=>({frames:b.count,bytes:b.bytes,captureSpanMs:b.frameTimes.at(-1)-b.frameTimes[0]})), applicationSockets:2, preActivationFrames:0, pausedUploadFrames:0, noCallerRequired:true, hiddenPreviewContinues:true,pauseDuringDecode:'late result abstained and UI cleared',explicitResume:'new authorization and actual shown result',reconnect:'no automatic camera/upload restart', accessibility:'zero axe violations in four states',applicationExceptions:errors, output:'transmitted:false; no TTS or human audibility'};
 await writeFile(new URL('recognition-results.json',artifacts),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
} catch(e) { await capture('failure.png'); console.error(JSON.stringify({debug:await page.evaluate(()=>({muted:window.referenceStream?.getVideoTracks()[0]?.muted,ready:window.referenceStream?.getVideoTracks()[0]?.readyState,videoReady:window.referenceVideo?.readyState,canvas:!!window.referenceCanvas,hidden:document.hidden})),message:e.message,state:await page.locator('main').innerText(),hypotheses:hypotheses.map(h=>({rawText:h.rawText,decision:h.decision})),statuses:statuses.map(s=>({state:s.state,generation:s.generation})),sent,binary,errors})); throw e; } finally { await browser.close(); await rm(videoPath,{force:true}); }
