/** Caller audio capture regression. Synthetic microphone; Mode 2 remains gated. No Gemini-as-user-speech fallback. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFile,mkdir,rm,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base=process.env.TACIT_WEB_URL??'http://localhost:5173';const folder=new URL('./.silent-mic/',import.meta.url);const artifacts=new URL('../artifacts/silent-speech/',import.meta.url);
await mkdir(folder,{recursive:true});await mkdir(artifacts,{recursive:true});
const aiff=fileURLToPath(new URL('input.aiff',folder));const wav=fileURLToPath(new URL('input.wav',folder));
execFileSync('say',['-o',aiff,'Hey, it is Sam. Are we still on for dinner tonight?']);execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',aiff,'-ac','1','-ar','48000','-c:a','pcm_s16le',wav]);
const secrets=JSON.parse(await readFile(new URL('../../server/data/secrets.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${wav}%noloop`]});
const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['microphone']});await context.addInitScript(({user,caller})=>{sessionStorage.setItem('tacit-access-user',user);sessionStorage.setItem('tacit-access-caller',caller);},{user:secrets.userToken,caller:secrets.callerToken});
const user=await context.newPage();let binaryAudio=0;const errors=[];user.on('pageerror',e=>errors.push(e.message));let caller;
try{
 await user.goto(base);await user.getByText('System connected',{exact:true}).waitFor();assert.equal(await user.locator('.call-status').count(),0,'another call is active; do not interrupt');
 caller=await context.newPage();caller.on('pageerror',e=>errors.push(e.message));caller.on('websocket',s=>s.on('framereceived',e=>{if(typeof e.payload!=='string')binaryAudio++;}));
 await caller.goto(`${base}/#caller`);await caller.getByRole('button',{name:'Call TACIT',exact:true}).click();await caller.getByText('Call connected',{exact:true}).waitFor();await caller.getByRole('button',{name:'Enable microphone',exact:true}).click();await caller.getByRole('button',{name:'Pause microphone',exact:true}).waitFor();
 await user.locator('.caller-quote').filter({hasText:/dinner|tonight/i}).waitFor({timeout:45000});await caller.getByRole('button',{name:'Pause microphone',exact:true}).click();
 const transcript=await user.locator('.caller-quote').innerText();
 assert.equal(await user.locator('.reply-card').count(),0);assert.equal(await user.locator('.recognized-words.placeholder').count(),1);
 assert.equal(await user.locator('.output-summary').innerText().then(t=>t.includes('Live output gated')),true);
 await user.screenshot({path:fileURLToPath(new URL('caller-transcript-real-whisper.png',artifacts)),fullPage:true});await caller.screenshot({path:fileURLToPath(new URL('caller-connected.png',artifacts)),fullPage:true});
 await user.waitForTimeout(1500);assert.equal(binaryAudio,0,'no audio without validated live authorization');assert.deepEqual(errors,[]);
 const result={source:'synthetic microphone → actual AudioWorklet → server Whisper; not human microphone testing',transcript,unsolicitedAudioFrames:binaryAudio,automaticSpeech:'blocked; display-only recognition never authorizes speech',applicationExceptions:errors};
 await writeFile(new URL('caller-audio-results.json',artifacts),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));await caller.getByRole('button',{name:'End call',exact:true}).click();
}finally{await browser.close();await rm(folder,{recursive:true,force:true});}
