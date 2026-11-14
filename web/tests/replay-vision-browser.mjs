/** Actual recorded pixels → production useVision worker → production silent capture. No model predictions. */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base = process.env.TACIT_WEB_URL ?? 'http://localhost:5173';
const artifacts = new URL('../artifacts/replay/', import.meta.url); await mkdir(artifacts, { recursive: true });
const reference = new URL('input.mp4', artifacts);
const source = process.env.TACIT_REPLAY_VIDEO ?? fileURLToPath(new URL('../../recognition/eval/clips/cremad/1030_ITS_NEU_XX.flv', import.meta.url));
const ownReference = !process.env.TACIT_REPLAY_VIDEO;
if (ownReference) execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-filter_complex', '[0:v]fps=25,tpad=start_mode=clone:start_duration=0.8:stop_mode=clone:stop_duration=1.2,split=2[a][b];[a][b]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fileURLToPath(reference)]);
const input = ownReference ? fileURLToPath(reference) : source;
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { encoding: 'utf8' }).trim());
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], unexpected = [], reports = []; let sockets = 0;
page.on('pageerror', e => errors.push(e.message)); page.on('websocket', socket => { if (/^\/ws(?:\/caller)?$/.test(new URL(socket.url()).pathname)) sockets++; });
page.on('request', r => { if (r.method() !== 'GET' || /\/api\//.test(r.url())) unexpected.push({ method: r.method(), path: new URL(r.url()).pathname }); });
const report = async () => JSON.parse(await page.locator('#replay-report').innerText());
try {
  for (const scenario of [
    { name: 'recorded-normal', rate: '1', drop: '0', interrupt: false },
    { name: 'recorded-slow', rate: '0.5', drop: '0', interrupt: false },
    { name: 'recorded-fast', rate: '2', drop: '0', interrupt: false },
    { name: 'recorded-drops', rate: '1', drop: '3', interrupt: false },
    { name: 'recorded-tracking-loss', rate: '1', drop: '0', interrupt: true },
  ]) {
    await page.goto(`${base}/?replay=1`);
    await page.getByLabel('Recorded video', { exact: true }).setInputFiles(input);
    if (process.env.TACIT_REPLAY_LABELS) await page.getByLabel('Boundary labels (optional JSON)', { exact: true }).setInputFiles(process.env.TACIT_REPLAY_LABELS);
    await page.getByLabel('Delivery speed', { exact: true }).selectOption(scenario.rate);
    await page.getByLabel('Drop frames', { exact: true }).selectOption(scenario.drop);
    await page.getByLabel('Inject tracking loss', { exact: false }).setChecked(scenario.interrupt);
    await page.getByRole('button', { name: 'Replay from start', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.ended, null, { timeout: Math.max(30000, duration / Number(scenario.rate) * 1000 + 20000) });
    const r = await report(); assert.ok(r.processed > 10); assert.ok(r.capture.captured > 10); assert.ok(r.buffer.bytes <= 12 * 1024 * 1024);
    assert.equal(r.actualPlaybackRate, Number(scenario.rate));
    assert.ok(r.sourceTimeMs > duration * 1000 - 200);
    assert.ok(Math.abs(r.capture.deliveryFps / r.capture.fps - Number(scenario.rate)) < .3, 'delivery rate and source-time sampling must be reported independently');
    if (scenario.interrupt) assert.ok(r.trackingDiscards > 0);
    if (scenario.drop !== '0') assert.ok(r.capture.injectedDrops > 0);
    if (ownReference && scenario.name === 'recorded-normal') assert.ok(r.windows.length >= 2, 'both recorded articulations should produce motion windows');
    reports.push({ scenario: scenario.name, durationMs: duration * 1000, ...r });
    console.log(JSON.stringify({ scenario: scenario.name, processed: r.processed, fps: r.capture.fps, jitterMs: r.capture.jitterMs, windows: r.windows, trackingDiscards: r.trackingDiscards }));
    if (scenario.name === 'recorded-normal') {
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); assert.deepEqual(audit.violations.map(v => v.id), []);
      await page.screenshot({ path: fileURLToPath(new URL('recorded-pipeline.png', artifacts)), fullPage: true, mask: [page.locator('.camera-preview')], animations: 'disabled' });
    }
    await page.getByRole('button', { name: 'Pause replay and clear capture', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#replay-report').textContent).buffer.frames === 0);
    await page.getByRole('button', { name: 'Replay from start', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#replay-report').textContent).buffer.frames > 3);
    // Lifecycle fault is explicitly injected. This is not a physical iOS lock test.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.waitForFunction(() => JSON.parse(document.querySelector('#replay-report').textContent).buffer.frames === 0);
    assert.equal(await page.getByRole('button', { name: 'Replay from start', exact: true }).isEnabled(), true);
  }
  assert.equal(sockets, 0); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', artifacts), JSON.stringify({ provenance: ownReference ? 'Previously recorded VOICED CREMA-D actor; repeated with frozen lead/trail frames; NOT silent-speech validation. Labels omitted because true utterance boundaries were not supplied.' : 'User-selected recorded video; provenance/labels supplied by operator', reports, applicationExceptions: errors, sockets, unexpected }, null, 2));
} finally { await browser.close(); if (ownReference) await rm(reference, { force: true }); }
