/** Real authenticated frontend smoke. Device failures are controlled fixtures; no fake recognition. */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base=process.env.TACIT_WEB_URL??'http://localhost:5173';
const artifacts=new URL('../artifacts/silent-speech/',import.meta.url);await mkdir(artifacts,{recursive:true});
const secrets=JSON.parse(await readFile(new URL('../../server/data/secrets.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(({user,caller})=>{sessionStorage.setItem('tacit-access-user',user);sessionStorage.setItem('tacit-access-caller',caller);},{user:secrets.userToken,caller:secrets.callerToken});
const page=await context.newPage();const errors=[],messages=[],audits=[];let binary=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('websocket',s=>{if(!new URL(s.url()).pathname.endsWith('/ws'))return;s.on('framesent',e=>{if(typeof e.payload==='string'){try{messages.push(JSON.parse(e.payload).type);}catch{}}else binary++;});});
const capture=async(name)=>page.screenshot({path:fileURLToPath(new URL(name,artifacts)),fullPage:true,animations:'disabled'});
const axe=async(state)=>{const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();audits.push({state,violations:r.violations.map(v=>({id:v.id,help:v.help,targets:v.nodes.map(n=>n.target)}))});};
try{
 await page.goto(base);await page.getByText('System connected',{exact:true}).waitFor();
 assert.equal(await page.locator('.reply-card').count(),0);assert.equal(await page.getByRole('button',{name:/Confirm.*speak/i}).count(),0);
 assert.equal(await page.locator('video').evaluate(v=>v.srcObject===null),true,'no camera startup');
 assert.equal(await page.getByRole('button',{name:'Open caller',exact:true}).count(),0,'calling app independence');
 for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['compact',680,760],['mobile',390,844]]){
  await page.setViewportSize({width,height});await capture(`workspace-${name}.png`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow`);
 }
 await axe('everyday mobile inactive'); assert.equal(binary,0);
 await page.getByRole('button',{name:'Presenter',exact:true}).click();await page.getByRole('heading',{name:'Demo preflight · display only',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Start Live preview',exact:true}).isDisabled(),false);
 await axe('presenter mobile');await page.getByRole('button',{name:'Presenter',exact:true}).click();
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Setup and settings',exact:true}).click();
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();await capture('diagnostics-desktop.png');await axe('setup diagnostics');
 assert.equal(await page.getByLabel('Input source',{exact:true}).inputValue(),'camera');
 assert.equal(await page.locator('option[value=airpods]').isDisabled(),true);
 await page.getByRole('button',{name:'Close diagnostics',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Diagnostics');await page.getByRole('button',{name:'Close setup',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Setup and settings');
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{window.deniedRequests=(window.deniedRequests??0)+1;throw new DOMException('Permission denied','NotAllowedError');};});
 await page.reload();await page.getByText('System connected',{exact:true}).waitFor();await page.getByRole('button',{name:'Start Live preview',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Camera access was denied'}).waitFor();await capture('camera-denied.png');await axe('camera denied');assert.equal(binary,0);await page.getByRole('button',{name:'Retry Live preview',exact:true}).click();await page.waitForFunction(()=>window.deniedRequests===2);await page.getByRole('alert').filter({hasText:'Camera access was denied'}).waitFor();
 await page.keyboard.press('Escape');await page.getByText('Input paused. Nothing is being transmitted.',{exact:true}).waitFor();
 const preview=await context.newPage();await preview.goto(`${base}/?preview=1&content=long`);await preview.setViewportSize({width:390,height:844});
 await preview.getByRole('heading',{name:'Live Silent Speech',exact:true}).waitFor();assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await preview.getByRole('button',{name:'Presenter',exact:true}).count(),0);await preview.close();
 const delayed=await context.newPage();await delayed.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.resolveDelayedCamera=()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const stream=canvas.captureStream(25);window.delayedTrack=stream.getVideoTracks()[0];resolve(stream);};});});
 await delayed.goto(base);await delayed.getByText('System connected',{exact:true}).waitFor();await delayed.getByRole('button',{name:'Start Live preview',exact:true}).click();await delayed.waitForFunction(()=>typeof window.resolveDelayedCamera==='function');
 await delayed.getByRole('button',{name:'Pause live speech and stop audio',exact:true}).click();await delayed.getByText('Input paused. Nothing is being transmitted.',{exact:true}).waitFor();await delayed.evaluate(()=>window.resolveDelayedCamera());await delayed.waitForFunction(()=>window.delayedTrack?.readyState==='ended');assert.equal(await delayed.locator('video').evaluate(v=>v.srcObject===null),true);await delayed.close();
 const unsupported=await context.newPage();await unsupported.addInitScript(()=>Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true}));await unsupported.goto(base);await unsupported.getByText("Silent visual recognition isn't available. You can still communicate using typed speech.",{exact:true}).waitFor();await unsupported.close();
 for(const path of ['/server/data/secrets.json','/server/.env','/server/src/index.ts']){const response=await page.request.get(`${base}/@fs${fileURLToPath(new URL('../..',import.meta.url))}${path}`);assert.equal(response.status(),403);}
 const forbidden=['tap_select','confirm','mouth_gesture_select','request_alternatives','candidates_displayed'];assert.equal(messages.some(t=>forbidden.includes(t)),false);assert.equal(binary,0);assert.ok(audits.every(a=>a.violations.length===0),JSON.stringify(audits));assert.deepEqual(errors,[]);
 const result={source:'actual authenticated backend; no recognized output simulated',viewports:['1440x900','1280x800','680x760','390x844'],unauthorizedUploads:binary,automaticTransmission:'gated independently of recognition',legacySelectionMessages:[],accessibility:audits,applicationExceptions:errors};await writeFile(new URL('browser-results.json',artifacts),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
