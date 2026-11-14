// Virtual-microphone check (no server needed): device present → no echo-risk warnings → calibrate route gain with a
// short tone → user-authored TEST phrase via the system voice → loopback capture proves samples reach the device's
// input side → stop cuts audio. Writes server/data/route-calibration.json (used by the server for gain).
// It plays audio INTO the virtual mic, so it refuses while a calling app is reading it (pass --force to override).
//   npm run route:check [-- --force]
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { CALIBRATION_FILE, listDevices, pickDevice, routeBinary } from '../src/route.ts';
import { macSay } from '../src/tts.ts';

const run = promisify(execFile);
const force = process.argv.includes('--force');
let failed = 0;
const line = (status: 'PASS' | 'FAIL' | 'USER ACTION' | 'INFO', what: string, detail = '') => {
  if (status === 'FAIL') failed++;
  console.log(`${status.padEnd(11)} ${what}${detail ? ` — ${detail}` : ''}`);
};

async function helper(bin: string, args: string[]): Promise<Record<string, any>> {
  try {
    const { stdout } = await run(bin, args, { timeout: 30_000 });
    return JSON.parse(stdout.trim().split('\n').at(-1)!);
  } catch (e: any) {
    const out = String(e.stdout ?? '').trim().split('\n').at(-1);
    if (out) return JSON.parse(out);
    throw e;
  }
}

function tone(path: string, seconds = 0.6, amp = 0.5, rate = 48000): void {
  const n = Math.round(seconds * rate), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

const bin = routeBinary();
if (!bin) { line('USER ACTION', 'tacit-route binary', 'not built: ./scripts/tacit.sh build'); process.exit(1); }
const { devices, defaultOutput } = await listDevices(bin);
const dev = pickDevice(devices);
if (!dev) {
  line('USER ACTION', 'virtual microphone', process.env.TACIT_ROUTE_DEVICE_UID ? 'TACIT_ROUTE_DEVICE_UID not found' : 'install BlackHole: brew install blackhole-2ch (admin password), then rerun');
  process.exit(1);
}
line('PASS', 'virtual microphone present', `${dev.name} (${dev.uid}), ${dev.sampleRate} Hz, ${dev.inputChannels} in / ${dev.outputChannels} out`);
const diag = await helper(bin, ['diagnose', '--device-uid', dev.uid]);
for (const w of diag.warnings ?? []) line('FAIL', 'echo / routing risk', w);
if (!(diag.warnings ?? []).length) line('PASS', 'no echo risk', `system output is ${defaultOutput ?? 'unknown'}, not the virtual mic`);
const readers: string[] = (diag.inputReaders ?? []).map((r: any) => r.bundleID);
if (diag.inputReaders === null) line('INFO', 'apps reading the virtual mic', 'unknown on this macOS');
else line('INFO', 'apps reading the virtual mic', readers.length ? readers.join(', ') : 'none right now');
if (readers.length && !force) {
  line('USER ACTION', 'loopback test skipped', `${readers.join(', ')} is reading the virtual mic — a test tone would be heard in that call. Mute/leave the call or rerun with --force`);
  process.exit(failed ? 1 : 2);
}

const dir = mkdtempSync(join(tmpdir(), 'tacit-routecheck-'));
try {
  tone(join(dir, 'tone.wav'));
  const cal = await helper(bin, ['verify', '--device-uid', dev.uid, '--gain-db', '0', join(dir, 'tone.wav')]);
  if (!cal.loopbackVerified) { line('FAIL', 'loopback (calibration tone)', cal.hint ?? 'no signal'); process.exit(1); }
  const gainDb = Math.min(24, Math.max(0, -Number(cal.routeGainDb)));
  mkdirSync(dirname(CALIBRATION_FILE), { recursive: true });
  writeFileSync(CALIBRATION_FILE, JSON.stringify({ uid: dev.uid, routeGainDb: cal.routeGainDb, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  line('PASS', 'route gain calibrated', `device loss ${cal.routeGainDb} dB → TACIT applies +${gainDb} dB (saved)`);

  const phrase = 'This is a TACIT voice output test, typed by the user.';
  const t0 = Date.now();
  const speech = await macSay().synth(phrase, 'file');
  const ttsMs = Date.now() - t0;
  writeFileSync(join(dir, 'phrase.wav'), speech.audio);
  const v = await helper(bin, ['verify', '--device-uid', dev.uid, '--gain-db', String(gainDb), join(dir, 'phrase.wav')]);
  if (v.loopbackVerified) line('PASS', 'user-authored TTS reaches the virtual mic input', `"${phrase}" via ${speech.voice}; TTS ${ttsMs} ms; schedule→captured onset ${v.scheduleToCaptureOnsetMs} ms; level after gain ${v.routeGainDb + gainDb} dB vs source; ch 3+ silent`);
  else line('FAIL', 'user-authored TTS loopback', v.hint ?? 'no signal');

  const s = await helper(bin, ['verify', '--device-uid', dev.uid, '--gain-db', String(gainDb), '--stop-after-ms', '800', join(dir, 'phrase.wav')]);
  if (s.loopbackVerified && s.loudAfterStopMs !== undefined && s.loudAfterStopMs < 50) line('PASS', 'stop cuts audio', `${s.loudAfterStopMs} ms of audio reached the virtual mic after stop()`);
  else line('FAIL', 'stop cuts audio', JSON.stringify({ loudAfterStopMs: s.loudAfterStopMs, hint: s.hint }));
  line('INFO', 'not verified here', 'that a calling app selected this mic, or that any remote person heard it (needs a human listener)');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
