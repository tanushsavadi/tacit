/** Real MediaPipe on recorded-face frames; no word/gesture accuracy or physical silent-speech claim. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir,rm,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base=process.env.TACIT_WEB_URL??'http://localhost:5173';const fixture=new URL('./.silent-vision/',import.meta.url);const artifacts=new URL('../artifacts/silent-speech/',import.meta.url);
await mkdir(fixture,{recursive:true});await mkdir(artifacts,{recursive:true});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',fileURLToPath(new URL('../../recognition/eval/clips/cremad/1030_ITS_NEU_XX.flv',import.meta.url)),'-an','-c:v','libx264','-pix_fmt','yuv420p',fileURLToPath(new URL('reference.mp4',fixture))]);
const browser=await chromium.launch({channel:'chrome',headless:false});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${base}/?preview=1`);
 await page.evaluate(async()=>{
  const video=document.createElement('video');video.muted=true;video.src='/tests/.silent-vision/reference.mp4';
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;video.load();});
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');
  await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=.1;});ctx.drawImage(video,0,0);
  const stream=canvas.captureStream(25);const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async c=>c.video?stream:original(c);
  window.referencePlayback=video;window.drawReference=setInterval(()=>ctx.drawImage(video,0,0),40);
  const banner=document.createElement('div');banner.textContent='RECORDED-FACE TEST · real MediaPipe · preview conversation · not live silent-speech recognition';banner.style.cssText='padding:15px;background:#463a22;color:#fff1cd;text-align:center;font:14px sans-serif';document.body.prepend(banner);
 });
 await page.getByRole('button',{name:'Set up camera',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.camera-state')?.textContent==='Face tracked',null,{timeout:25000});
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();
 await page.evaluate(async()=>{window.referencePlayback.loop=false;await window.referencePlayback.play();});
 await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('dl>div')];return Number(rows.find(r=>r.querySelector('dt')?.textContent==='Captured frames in RAM')?.querySelector('dd')?.textContent)>8;},null,{timeout:15000});
 await page.waitForTimeout(5000);
 const read=async name=>page.locator('dl>div').filter({has:page.locator('dt',{hasText:name})}).locator('dd').innerText();
 const evidence={source:'recorded face video through real MediaPipe and local JPEG buffering; preview conversation only',tracking:await page.locator('.camera-state').innerText(),bufferFrames:await read('Captured frames in RAM'),detectedWindows:await read('Detected windows'),endpointMs:await read('Last motion → endpoint'),automaticSpeech:'gated, no recognized words or audio',applicationExceptions:errors};
 await page.screenshot({path:fileURLToPath(new URL('recorded-camera-diagnostics.png',artifacts)),fullPage:true,animations:'disabled',mask:[page.locator('.camera-preview')],maskColor:'#1b221d'});
 assert.equal(await page.getByRole('button',{name:'Start live speech',exact:true}).isDisabled(),true);assert.equal(await page.locator('.recognized-words.placeholder').count(),1);assert.equal(await page.locator('audio').count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'camera-enabled mobile header must not overflow');
 await page.screenshot({path:fileURLToPath(new URL('recorded-camera-mobile.png',artifacts)),fullPage:true,animations:'disabled',mask:[page.locator('.camera-preview')],maskColor:'#1b221d'});
 await page.getByRole('button',{name:'Pause live speech and stop audio',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('dl>div')].find(r=>r.querySelector('dt')?.textContent==='Captured frames in RAM')?.querySelector('dd')?.textContent==='0');
 await page.getByRole('button',{name:'Resume local camera check',exact:true}).click();await page.waitForFunction(()=>Number([...document.querySelectorAll('dl>div')].find(r=>r.querySelector('dt')?.textContent==='Captured frames in RAM')?.querySelector('dd')?.textContent)>0);
 await page.getByRole('button',{name:'Turn camera off',exact:true}).click();assert.deepEqual(errors,[]);
 await writeFile(new URL('recorded-camera-results.json',artifacts),JSON.stringify({...evidence,pause:'buffer cleared',resume:'local capture recovered',cameraOff:'released'},null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();await rm(fixture,{recursive:true,force:true});}
