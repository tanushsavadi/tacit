/** Real Chromium checks. No traces or credential-bearing screenshots are saved. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
const base = process.env.TACIT_WEB_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = new URL('../evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, evidence)), fullPage: true });
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const results = [];
try {
  for (const resource of ['../../server/data/secrets.json','../../server/src/index.ts']) {
    const privatePath=fileURLToPath(new URL(resource,import.meta.url));
    const response=await context.request.get(new URL('/@fs'+privatePath,base).href);
    assert.ok([403,404].includes(response.status()),'private backend file must not be served by frontend');
  }
  results.push('frontend file boundary: backend credentials and source blocked');
  await page.goto(`${base}/?preview=1`);
  await page.getByRole('button', { name: /^01 / }).click();
  assert.equal(await page.getByRole('button', { name: 'Confirmation ready shortly' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Confirm & speak' }).waitFor();
  await screenshot('desktop-1440-proposal.png');
  assert.equal(await overflow(), false);
  await page.getByRole('button', { name: /^Cancel/ }).click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('2');
  await page.getByRole('button', { name: 'Confirm & speak' }).waitFor();
  await page.keyboard.press('Enter');
  await page.getByText('Confirmed in UI preview. No audio was generated or sent.').waitFor();
  results.push('preview: tap and keyboard selection, early guard, cancel, explicit confirmation; no audio');

  for (const [width, height, name] of [[1440,900,'desktop'],[1280,800,'laptop'],[390,844,'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/?preview=1`);
    await page.getByRole('button', { name: /^01 / }).waitFor();
    assert.equal(await overflow(), false);
    await screenshot(`${name}-${width}-ready.png`);
    await page.getByRole('button', { name: /^01 / }).click();
    await page.getByRole('button', { name: 'Confirm & speak' }).waitFor();
    await screenshot(`${name}-${width}-proposal.png`);
    const confirm = await page.getByRole('button', { name: 'Confirm & speak' }).boundingBox();
    assert.ok(confirm && confirm.y + confirm.height <= height + 1, 'confirmation scrolled into view');
    await page.goto(`${base}/?preview=1&content=long`);
    await page.getByRole('button', { name: /^01 / }).waitFor();
    assert.equal(await overflow(), false);
    const clipping = await page.locator('.reply-card').evaluateAll(cards => cards.some(c=>c.scrollHeight>c.clientHeight+2));
    assert.equal(clipping,false);
    await screenshot(`${name}-${width}-long.png`);
  }
  results.push('1440×900, 1280×800, 390×844: ready, proposal, long caller/replies; no overflow or clipped cards');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/?preview=1`);
  assert.equal(await page.locator('.reply-card').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Skip to replies');
  results.push('reduced motion and first keyboard focus verified');

  // Explicitly deny camera in this isolated browser context to exercise the fallback.
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError');};});
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Camera access was denied'}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^01 /}).isEnabled(),true);
  results.push('camera denied: actionable error and working tap fallback (injected browser failure)');

  await page.goto(`${base}/`);
  const access = page.getByLabel('User access code');
  await Promise.race([access.waitFor(), page.getByText('System connected',{exact:true}).waitFor()]);
  if (await access.isVisible()) {
    await access.fill('invalid-test-access');
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'not accepted'}).waitFor();
    results.push('invalid access code: recovery form, no socket retry storm');
  }
  const localSecrets = JSON.parse(await readFile(new URL('../../server/data/secrets.json',import.meta.url),'utf8'));
  if (await access.isVisible()) {
    await access.fill(process.env.TACIT_USER_TOKEN ?? localSecrets.userToken);
    await page.getByRole('button',{name:'Connect',exact:true}).click();
  }
  await page.getByText('System connected',{exact:true}).waitFor();
  results.push('authenticated backend connection');
  // Do not displace another participant's active call.
  if (await page.getByRole('button',{name:'End call',exact:true}).count()) {
    results.push('browser-ws call skipped: an existing call is active');
  } else {
    const caller = await context.newPage();
    caller.on('pageerror',error=>errors.push(error.message));
    await caller.goto(`${base}/#caller`);
    await caller.getByText('Caller invite code',{exact:true}).click();
    await caller.getByLabel('Use the invite from your partner’s TACIT workspace').fill(process.env.TACIT_CALLER_TOKEN ?? localSecrets.callerToken);
    await caller.getByRole('button',{name:'Call TACIT',exact:true}).click();
    await caller.getByText('Call connected',{exact:true}).waitFor();
    await caller.getByLabel('Or type your message').fill('Can you come to the appointment on Thursday afternoon?');
    await caller.getByRole('button',{name:'Send message',exact:false}).click();
    await page.getByRole('button',{name:/^01 /}).waitFor();
    await page.getByRole('button',{name:/^01 /}).click();
    await page.getByRole('button',{name:'Confirm & speak'}).waitFor();
    await page.getByRole('button',{name:'Confirm & speak'}).click();
    await page.locator('.speech-status').filter({hasText:'Caller device reported playback complete'}).waitFor({timeout:30000});
    await page.setViewportSize({width:1440,height:900});
    await screenshot('authenticated-browser-playback.png');
    results.push('browser-ws: typed caller → real backend candidates → explicit UI confirmation → actual HTML audio ended acknowledgment; no human audibility claim');
    await caller.getByRole('button',{name:'End call',exact:true}).click();
    await caller.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results,applicationExceptions:errors.length},null,2));
} finally { await browser.close(); }
