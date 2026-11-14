/** Recorded-face UI/model test. No physical gesture accuracy claim. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base='http://localhost:5173';
const fixture=new URL('./.vision-smoke/',import.meta.url);
const artifacts=new URL('../artifacts/ui-review/',import.meta.url);
await mkdir(fixture,{recursive:true});await mkdir(artifacts,{recursive:true});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',fileURLToPath(new URL('../../recognition/eval/clips/cremad/1030_ITS_NEU_XX.flv',import.meta.url)),'-an','-c:v','libx264','-pix_fmt','yuv420p',fileURLToPath(new URL('reference.mp4',fixture))]);
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${base}/?preview=1`);
  // Choose real recorded images by their measured MediaPipe signals, never injected coefficients.
  const scan=await page.evaluate(async()=>{
    const video=document.createElement('video');video.muted=true;video.src='/tests/.vision-smoke/reference.mp4';
    await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;video.load();});
    const worker=new Worker('/src/vision/landmarker.worker.ts',{type:'module'});
    const next=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('model timeout')),15000);worker.onmessage=e=>{clearTimeout(timeout);e.data.type==='error'?reject(Error(e.data.message)):resolve(e.data);};});
    let pending=next();worker.postMessage({type:'init',wasmPath:location.origin+'/mediapipe',modelPath:location.origin+'/models/face_landmarker.task'});await pending;
    const rows=[];
    try{
      for(let i=0;i<20;i++){
        const time=0.05+i*(Math.min(video.duration-0.1,2)/20);
        await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
        const bitmap=await createImageBitmap(video);pending=next();worker.postMessage({type:'frame',bitmap,t:100+i*100},[bitmap]);const out=await pending;
        if(out.frame.tracked)rows.push({time,values:[out.frame.jaw,out.frame.smile,out.frame.pucker]});
      }
    }finally{worker.terminate();video.remove();}
    let pair=null;
    for(const neutral of rows)for(const gesture of rows){
      const scores=gesture.values.map((x,i)=>Math.max(0,Math.min(1,(x-neutral.values[i])/Math.max(0.15,1-neutral.values[i]))));
      const rank=scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
      if(rank[0].v>=0.55&&rank[0].v-rank[1].v>=0.18&&(!pair||rank[0].v>pair.strength))pair={neutral:neutral.time,gesture:gesture.time,index:rank[0].i,strength:rank[0].v};
    }
    return {sampled:rows.length,pair};
  });
  assert.ok(scan.pair,'recorded clip must contain a distinguishable gesture for this test');
  await page.evaluate(async({neutral})=>{
    const video=document.createElement('video');video.muted=true;video.src='/tests/.vision-smoke/reference.mp4';
    await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;video.load();});
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const ctx=canvas.getContext('2d');
    window.setRecordedVisionTime=async time=>{await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});ctx.drawImage(video,0,0);};
    await window.setRecordedVisionTime(neutral);
    window.recordedVisionTimer=setInterval(()=>ctx.drawImage(video,0,0),40);
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>constraints.video?canvas.captureStream(20):original(constraints);
    const label=document.createElement('div');label.textContent='AUTOMATED RECORDED-FACE TEST · scripted conversation fixtures · not physical webcam or gesture accuracy evidence';
    label.style.cssText='padding:16px;background:#463a22;color:#fff1cd;text-align:center;font:14px sans-serif';document.body.prepend(label);
  },scan.pair);
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.camera-state')?.textContent==='Face tracked',{},{timeout:20000});
  await page.getByRole('button',{name:'Calibrate your relaxed expression',exact:true}).click();
  await page.getByRole('button',{name:/Neutral calibrated/}).waitFor({timeout:10000});
  const capture=name=>page.screenshot({path:fileURLToPath(new URL(name,artifacts)),fullPage:true,animations:'disabled',mask:[page.locator('video'),page.locator('canvas')],maskColor:'#1b221d'});
  await capture('12-calibration-recorded-input.png');
  await page.evaluate(async({gesture})=>window.setRecordedVisionTime(gesture),scan.pair);
  await page.getByRole('button',{name:/Review selection/}).waitFor({timeout:10000});
  const selectedIndex=await page.locator('.reply-card').evaluateAll(cards=>cards.findIndex(card=>card.classList.contains('is-visual')));
  assert.equal(selectedIndex,scan.pair.index);
  await capture('13-gesture-selection-recorded-input.png');
  await page.getByRole('button',{name:/Review selection/}).click();
  await page.getByRole('button',{name:'Confirm & speak'}).waitFor();
  await capture('14-gesture-review-proposal-recorded-input.png');
  assert.equal(await page.locator('audio').count(),0,'UI preview must not produce audio');
  await page.getByRole('button',{name:/Cancel/}).click();
  await page.getByRole('button',{name:'Turn camera off',exact:true}).click();
  assert.deepEqual(errors,[]);
  const result={source:'recorded CREMA-D image frames through real MediaPipe + frontend preview fixtures; not physical gestures',sampledFaceFrames:scan.sampled,selectedIndex,calibrationUI:'completed',gestureSelection:'matched measured dominant gesture',proposal:'separate explicit review; cancelled; no audio',applicationExceptions:errors};
  await writeFile(new URL('vision-recorded-result.json',artifacts),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await rm(fixture,{recursive:true,force:true});}
