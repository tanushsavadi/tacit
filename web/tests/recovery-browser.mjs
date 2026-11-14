/** Real backend recovery. No model fixtures are treated as silent speech, and no audio is requested. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.TACIT_WEB_URL ?? 'http://localhost:5173';
const secrets = JSON.parse(await readFile(new URL('../../server/data/secrets.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(user => {
  sessionStorage.setItem('tacit-access-user', user);
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    if (new URL(this.url).pathname === '/ws') {
      window.userSocket = this;
      if (typeof data === 'string') window.sentMessages = [...(window.sentMessages ?? []), JSON.parse(data)];
    }
    return send.call(this, data);
  };
}, secrets.userToken);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const level = (label) => page.locator('.readiness-list li', { hasText: label }).first().locator('.level');
try {
  await page.goto(base);
  await page.getByText('System connected', { exact: true }).waitFor();
  assert.equal(await level('Display-only recognition').innerText(), 'Ready');
  assert.equal(await level('Automatic transmission').innerText(), 'Unavailable');
  assert.equal(await level('Silent-speech reliability').innerText(), 'Experimental');
  assert.equal(await level('Virtual microphone').innerText(), 'Needs setup');
  assert.equal(await level('Remote audibility').innerText(), 'Unknown');
  assert.match(await page.locator('.output-summary').innerText(), /No calling app is reading it/);
  await page.getByRole('button', { name: 'Setup and settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Ready beside your calling app', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Presenter', exact: true }).click();
  await page.getByRole('heading', { name: 'Demo preflight · display only', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Presenter', exact: true }).click();

  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await page.reload();
  await page.getByText('System connected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start Live preview', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Camera access was denied' }).waitFor();
  assert.equal(await level('Camera').innerText(), 'Needs setup');

  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const stream = canvas.captureStream(5);
      window.demoTrack = stream.getVideoTracks()[0];
      return stream;
    };
  });
  await page.reload();
  await page.getByText('System connected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start Live preview', exact: true }).click();
  await page.waitForFunction(() => window.demoTrack?.readyState === 'live');
  await page.evaluate(() => window.demoTrack.stop());
  await page.getByRole('alert').filter({ hasText: 'Camera stream ended' }).waitFor();
  await page.getByText('Input paused. Nothing is being transmitted.', { exact: true }).waitFor({ timeout: 1000 }).catch(() => {});
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByText('Input paused. Nothing is being transmitted.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Stop session', exact: true }).click();
  await page.evaluate(() => window.userSocket.close());
  await page.getByText('System connected', { exact: true }).waitFor();
  assert.equal(await page.locator('.recognized-words:not(.placeholder)').count(), 0);
  const sent = await page.evaluate(() => window.sentMessages ?? []);
  assert.equal(sent.some(message => message.type === 'speak_typed' || message.mode === 'automatic'), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ recovery: 'permission denial, camera ended, background pause, stop, reconnect', automaticSpeech: 'no automatic or typed send', applicationExceptions: errors }));
} finally { await browser.close(); }
