// End-to-end check of the PRODUCTION web build served by the TACIT server (what ./scripts/tacit.sh start serves):
//  A. Live: a previously recorded VOICED CREMA-D clip replaces the camera (canvas stream; audio never read) → the real
//     browser MediaPipe/JPEG pipeline → authenticated socket → real Auto-AVSR → raw text visible on the page.
//  B. Typed speech: enable voice output and send a user-typed TEST message through the real UI; `tacit-route listen`
//     captures the virtual mic's input side to prove sound arrived there. Refuses if a call app reads the virtual mic.
// Not silent speech; never claims remote audibility. Opens a Chrome window.
//   cd server && npm run ui:check
import { createRequire } from 'node:module';
import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const tmp = mkdtempSync(join(tmpdir(), 'tacit-uicheck-'));
const mp4 = join(tmp, 'recorded.mp4');
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', root + '/recognition/eval/clips/cremad/1040_IEO_NEU_XX.flv', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4]);
const routeBin = root + '/macos/TacitRoute/.build/release/tacit-route';
const require = createRequire(root + '/web/package.json');
const { chromium } = require('playwright');
const token = JSON.parse(readFileSync(root + '/server/data/secrets.json', 'utf8')).userToken;
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript((u) => sessionStorage.setItem('tacit-access-user', u), token);
await ctx.route('**/__test/recorded.mp4', (r) => r.fulfill({ body: readFileSync(mp4), contentType: 'video/mp4' }));
const page = await ctx.newPage();
const hyps = [], errors = [], deliveries = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('websocket', (s) => s.on('framereceived', (e) => { if (typeof e.payload === 'string') { const m = JSON.parse(e.payload); if (m.type === 'recognition_hypothesis') hyps.push({ ...m.hypothesis, at: Date.now() }); if (m.type === 'speech_delivery') deliveries.push(m.delivery); } }));
try {
  await page.goto('http://127.0.0.1:8790/');
  await page.getByRole('button', { name: 'Start Live preview', exact: true }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.instrument-controls .button-primary')?.disabled, null, { timeout: 20000 });
  await page.evaluate(async () => {
    const video = document.createElement('video'); video.muted = true; video.src = '/__test/recorded.mp4';
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; video.load(); });
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const c = canvas.getContext('2d'); await new Promise((res) => { video.onseeked = res; video.currentTime = 0.1; }); c.drawImage(video, 0, 0);
    let track = null;
    navigator.mediaDevices.getUserMedia = async (k) => { if (!k.video || k.audio) throw new Error('video only'); const s = canvas.captureStream(0); track = s.getVideoTracks()[0]; return s; };
    window.refVideo = video; setInterval(() => { c.drawImage(video, 0, 0); track?.requestFrame(); }, 1000 / 30);
  });
  await page.getByRole('button', { name: 'Start Live preview', exact: true }).click();
  await page.getByText('Live preview', { exact: true }).waitFor({ timeout: 30000 });
  for (let i = 0; i < 2; i++) {
    const n = hyps.length;
    await page.evaluate(async () => { window.refVideo.currentTime = 0; await window.refVideo.play(); });
    const t0 = Date.now();
    while (hyps.length === n && Date.now() - t0 < 45000) await page.waitForTimeout(200);
    await page.waitForTimeout(1200);
  }
  const shown = hyps.filter((h) => h.decision === 'shown');
  const onPage = await page.locator('main').innerText();
  for (const h of hyps) console.log(`      hypothesis: ${h.decision} ${JSON.stringify(h.rawText)} ${h.recognitionMs} ms transmitted=${h.transmitted}${h.reason ? ` (${h.reason})` : ''}`);
  const liveOk = shown.length > 0 && shown.some((h) => onPage.includes(h.rawText)) && hyps.every((h) => h.transmitted === false);
  console.log(`${liveOk ? 'PASS' : 'FAIL'}  A. Live in the production UI: ${shown.length}/${hyps.length} shown, text on page ${shown.some((h) => onPage.includes(h.rawText))}`);

  // B. typed speech through the UI
  const status = await page.evaluate(() => fetch('/api/health', { headers: { authorization: 'Bearer ' + sessionStorage.getItem('tacit-access-user') } }).then((r) => r.json()));
  const route = status.services?.voiceRoute;
  let typedOk = false;
  if (!route || route.state !== 'ready') console.log(`SKIP  B. typed speech: virtual mic ${route?.state ?? 'not reported'} (${route?.reason ?? ''})`);
  else if (route.readers?.length) console.log(`SKIP  B. typed speech: ${route.readers.join(', ')} is reading the virtual mic; a test phrase would be heard in that call`);
  else {
    await page.getByRole('button', { name: /^Typed speech/ }).first().click().catch(() => {});
    await page.getByRole('button', { name: 'Enable typed voice output' }).click({ timeout: 10000 });
    await page.getByRole('button', { name: 'Send typed message' }).waitFor({ timeout: 10000 });
    const listen = new Promise((res) => execFile(routeBin, ['listen', '--device-uid', route.deviceUid, '--seconds', '9'], (e, out) => res(e ? null : JSON.parse(out.trim().split('\n').at(-1)))));
    await page.waitForTimeout(500);
    const phrase = 'This is a TACIT typed speech test.';
    await page.getByLabel('Your message').fill(phrase);
    const sentAt = Date.now();
    await page.getByRole('button', { name: 'Send typed message' }).click();
    const t0 = Date.now();
    while (!deliveries.some((d) => ['rendered', 'refused', 'interrupted', 'failed'].includes(d.state)) && Date.now() - t0 < 15000) await page.waitForTimeout(100);
    const term = deliveries.find((d) => ['rendered', 'refused', 'interrupted', 'failed'].includes(d.state));
    const cap = await listen;
    typedOk = term?.state === 'rendered' && term.source === 'typed' && !!cap?.firstLoudAt;
    console.log(`${typedOk ? 'PASS' : 'FAIL'}  B. typed speech via the UI: delivery ${term?.state ?? 'none'}${term?.reason ? ` (${term.reason})` : ''}, voice ${term?.voice}; sound at ${route.deviceName} input ${cap?.firstLoudAt ? Math.round(cap.firstLoudAt - sentAt) + ' ms after click' : 'NOT captured'} (${cap?.loudMs ?? 0} ms of sound)`);
    await page.getByRole('button', { name: 'Stop voice output' }).click().catch(() => {});
  }
  await page.getByRole('button', { name: /^Stop/ }).first().click().catch(() => {});
  console.log('remote audibility: NOT verified (needs a human listener)');
  process.exitCode = liveOk && (typedOk || !route || route.state !== 'ready' || route.readers?.length) && !errors.length ? 0 : 1;
} finally { await browser.close(); rmSync(tmp, { recursive: true, force: true }); }
