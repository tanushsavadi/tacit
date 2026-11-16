import {fileURLToPath} from 'node:url';
/** REAL Chrome tabCapture mechanics on a clearly labeled synthetic page. NOT Google Meet verification. */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdtemp,rm,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { FlowService } from '../../src/flow/service.ts';
import WebSocket from 'ws';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const { chromium }=require('playwright');
const extension=resolve('../web/flow-capture'),profile=await mkdtemp(resolve(tmpdir(),'tacit-flow-browser-'));
const token=randomBytes(32).toString('hex');
const service=new FlowService({token,decode:async()=>'',model:null,policyVerified:false,port:18892});
await service.listen();
const owner=new WebSocket('ws://127.0.0.1:18892/flow',{headers:{Authorization:`Bearer ${token}`}});
const next=()=>new Promise<any>(r=>owner.once('message',b=>r(JSON.parse(b.toString()))));await next();
const send=async(m:object)=>{const p=next();owner.send(JSON.stringify(m));return p;};
await send({type:'start',participantsAgreed:true,textConsent:false});const code=(await send({type:'pair'})).token;
let context:any;const evidence:Record<string,unknown>={scope:'Synthetic audio tabCapture laboratory. NOT Meet, human hearing or remote-call proof.',at:new Date().toISOString()};
try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--autoplay-policy=no-user-gesture-required','--mute-audio']});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();
  await page.route('https://meet.google.com/abc-defg-hij',async(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>SYNTHETIC TACIT FLOW CAPTURE TEST</title><h1>SYNTHETIC AUDIO LAB — NOT A MEETING</h1><button id="play">Play synthetic 440 Hz</button><script>document.querySelector("button").onclick=async()=>{window.audio=new AudioContext();await audio.resume();const o=audio.createOscillator();o.frequency.value=440;o.connect(audio.destination);o.start();};</script>'}));
  await page.goto('https://meet.google.com/abc-defg-hij');await page.click('#play');
  const tabs=await worker.evaluate(()=>new Promise(r=>(globalThis as any).chrome.tabs.query({},r)));
  const tab=tabs.find((t:any)=>t.active);
  await page.keyboard.press('Control+Shift+Y');
  await new Promise(r=>setTimeout(r,400));
  evidence.tabFound=!!tab;
  // Opening the extension popup directly does not manufacture an activeTab grant. If Chrome refuses, report BLOCKED.
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const result=await popup.evaluate(async({tabId,token}:any)=>(globalThis as any).chrome.runtime.sendMessage({target:'worker',type:'start',tabId,token}),{tabId:tab.id,token:code});
  evidence.start=result;
  if(result.ok){
    await new Promise(r=>setTimeout(r,1800));evidence.state=service.state.state;
    const offscreen=await worker.evaluate(()=>(globalThis as any).chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));
    evidence.offscreen=offscreen.length;evidence.captureScope='Selected synthetic tab';
    await send({type:'stop'});evidence.afterStop=service.state.state;
  }else evidence.blocked='Chrome requires a genuine extension invocation for the selected tab. Human toolbar click is required.';
}catch(e){evidence.error=(e as Error).name; evidence.stageError=(e as Error).message.split('\n')[0]?.slice(0,180);evidence.blocked='Capture laboratory did not complete. No live capture claim.';}
finally{
  await context?.close();owner.terminate();await service.close();await rm(profile,{recursive:true,force:true});
  const out=fileURLToPath(new URL('../../../../evidence/',import.meta.url));await mkdir(out,{recursive:true});await writeFile(resolve(out,'capture-lab.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
