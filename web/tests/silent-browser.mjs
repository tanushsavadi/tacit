/** Current Mode 2 UI against the real backend. No fake recognition or automatic speech. */
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
const page=await context.newPage();const errors=[];const messages=[];const audits=[];page.on('pageerror',e=>errors.push(e.message));
page.on('websocket',s=>s.on('framesent',e=>{if(typeof e.payload==='string'){try{messages.push(JSON.parse(e.payload).type);}catch{}}}));
const capture=async(name)=>page.screenshot({path:fileURLToPath(new URL(name,artifacts)),fullPage:true,animations:'disabled'});
const axe=async(state)=>{const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();audits.push({state,violations:r.violations.map(v=>({id:v.id,help:v.help,targets:v.nodes.map(n=>n.target)}))});};
try{
 await page.goto(base);await page.getByText('System connected',{exact:true}).waitFor();
 assert.equal(await page.locator('.reply-card').count(),0);assert.equal(await page.getByRole('button',{name:/Confirm.*speak/i}).count(),0);
 await page.getByRole('button',{name:'Start live speech',exact:true}).isDisabled().then(v=>assert.equal(v,true));
 for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['mobile',390,844]]){
  await page.setViewportSize({width,height});await capture(`workspace-${name}.png`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow`);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();await capture('diagnostics-desktop.png');await axe('authenticated inactive workspace and diagnostics');
 await page.getByRole('button',{name:'Close diagnostics',exact:true}).click();
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError');};});
 await page.reload();await page.getByText('System connected',{exact:true}).waitFor();await page.getByRole('button',{name:'Set up camera',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Camera access was denied'}).waitFor();await capture('camera-denied.png');
 await page.getByRole('button',{name:'Turn camera off',exact:true}).click();
 await page.keyboard.press('Escape');await page.getByText('Live speech paused. No articulation is being transmitted.',{exact:true}).waitFor();
 const preview=await context.newPage();await preview.goto(`${base}/?preview=1&content=long`);await preview.setViewportSize({width:390,height:844});
 await preview.getByRole('heading',{name:'Live Silent Speech',exact:true}).waitFor();assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await preview.screenshot({path:fileURLToPath(new URL('mobile-long-preview.png',artifacts)),fullPage:true,animations:'disabled'});await preview.close();
 for(const path of ['/server/data/secrets.json','/server/.env','/server/src/index.ts']){const response=await page.request.get(`${base}/@fs${fileURLToPath(new URL('../..',import.meta.url))}${path}`);assert.equal(response.status(),403);}
 const forbidden=['tap_select','confirm','mouth_gesture_select','request_alternatives','candidates_displayed'];assert.equal(messages.some(t=>forbidden.includes(t)),false);
 assert.ok(audits.every(a=>a.violations.length===0),JSON.stringify(audits));assert.deepEqual(errors,[]);
 const result={source:'actual authenticated backend, no recognition simulated',viewports:['1440x900','1280x800','390x844'],automaticTransmission:'gated: backend live-speech protocol and validation not available',legacySelectionMessages:messages.filter(t=>forbidden.includes(t)),accessibility:audits,applicationExceptions:errors};
 await writeFile(new URL('browser-results.json',artifacts),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
