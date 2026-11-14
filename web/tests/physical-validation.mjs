/** Headed browser for a human test. No fake media devices, synthetic audio, automatic selections or confirmations. */
import { chromium } from 'playwright';
import { readFile,mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
const base=process.env.TACIT_WEB_URL??'http://localhost:5173';
await mkdir(new URL('../artifacts/silent-speech/',import.meta.url),{recursive:true});
const secrets=JSON.parse(await readFile(new URL('../../server/data/secrets.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(({user,caller})=>{sessionStorage.setItem('tacit-access-user',user);sessionStorage.setItem('tacit-access-caller',caller);},{user:secrets.userToken,caller:secrets.callerToken});
const user=await context.newPage();await user.goto(base);await user.getByText('System connected',{exact:true}).waitFor();
const caller=await context.newPage();await caller.goto(`${base}/#caller`);
await user.bringToFront();
console.log('Human-validation Chrome window ready: TACIT workspace and Caller companion tabs. No microphone or camera has been enabled.');
console.log('Commands: status, capture, workspace, caller, close. No automated selections or confirmations.');
const rl=createInterface({input:process.stdin,output:process.stdout,terminal:false});
for await (const line of rl) {
 try {
  if(line.trim()==='close')break;
  if(line.trim()==='workspace'){await user.bringToFront();continue;}
  if(line.trim()==='caller'){await caller.bringToFront();continue;}
  if(line.trim()==='status'){
   console.log(JSON.stringify({workspace:await user.evaluate(()=>({connection:document.querySelector('.connection-status')?.textContent,phase:document.querySelector('.live-state')?.textContent,camera:document.querySelector('.camera-state')?.textContent,feedback:document.querySelector('.instrument-feedback')?.textContent,recognition:document.querySelector('.recognition-origin')?.textContent,gate:document.querySelector('.activation-reason')?.textContent,playback:document.querySelector('.silent-delivery')?.textContent})),caller:await caller.evaluate(()=>({connection:document.querySelector('.connection-status')?.textContent,mic:document.querySelector('.caller-mic')?.textContent,error:document.querySelector('.notice.error')?.textContent}))},null,2));
  }
  if(line.trim()==='capture'){
   const state='silent-workspace';
   await user.screenshot({path:fileURLToPath(new URL(`../artifacts/silent-speech/physical-${state}.png`,import.meta.url)),fullPage:true,mask:[user.locator('.camera-preview')],maskColor:'#1b221d'});
   console.log(`Saved local physical-${state}.png; camera preview masked.`);
  }
 }catch(error){console.log('Validation command could not complete:',error.message.split('\n')[0]);}
}
await browser.close();
