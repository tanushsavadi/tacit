// TACIT demo preflight: PASS / FAIL / USER ACTION / INFO per dependency. Read-only (plays no audio, opens no camera),
// never prints secrets. Works with or without a running server; with one, also checks its live services.
//   npm run preflight            (or ./scripts/tacit.sh preflight)
//   npm run preflight -- --brief one line (used by ./scripts/tacit.sh status)
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ServiceStatus } from '../../shared/protocol.ts';
import { CALIBRATION_FILE, listDevices, pickDevice, routeBinary } from '../src/route.ts';
import { secrets } from './secrets.ts';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 8790);
const brief = process.argv.includes('--brief');
type S = 'PASS' | 'FAIL' | 'USER ACTION' | 'INFO';
const rows: [S, string, string][] = [];
const add = (s: S, what: string, detail = '') => rows.push([s, what, detail]);
const sh = async (cmd: string, args: string[], timeout = 8000) => (await run(cmd, args, { timeout })).stdout;

// ── static dependencies ──
const nodeMajor = Number(process.versions.node.split('.')[0]);
add(nodeMajor >= 22 ? 'PASS' : 'FAIL', 'Node.js', `v${process.versions.node}${nodeMajor >= 22 ? '' : ' (need ≥ 22)'}`);
add(existsSync(join(root, 'server/node_modules')) ? 'PASS' : 'FAIL', 'server dependencies', existsSync(join(root, 'server/node_modules')) ? '' : 'run ./scripts/tacit.sh build');
add(secrets.userToken ? 'PASS' : 'FAIL', 'access tokens', secrets.userToken ? 'present (not shown)' : 'missing');
add(existsSync(join(root, 'server/models/ggml-base.en.bin')) ? 'PASS' : 'INFO', 'whisper.cpp model (browser-caller STT only)', existsSync(join(root, 'server/models/ggml-base.en.bin')) ? '' : 'missing; only the legacy browser caller needs it');
const py = join(root, 'recognition/.venv/bin/python');
const weightsDir = join(root, 'third_party/visual/weights/LRS3_V_WER19.1');
const weights = existsSync(weightsDir) ? readdirSync(weightsDir) : [];
add(existsSync(py) ? 'PASS' : 'FAIL', 'recognition Python env', existsSync(py) ? 'recognition/.venv' : 'missing recognition/.venv (see recognition/README)');
add(weights.length ? 'PASS' : 'FAIL', 'Auto-AVSR checkpoint', weights.length ? `LRS3_V_WER19.1 (${weights.length} files; research/non-commercial licence)` : `missing ${weightsDir}`);
add(existsSync(join(root, 'web/dist/index.html')) ? 'PASS' : 'USER ACTION', 'web UI build', existsSync(join(root, 'web/dist/index.html')) ? `served at http://127.0.0.1:${PORT}` : 'run ./scripts/tacit.sh build');
const companion = join(root, 'macos/TacitCompanion/.build/TACIT.app');
if (existsSync(join(root, 'macos/TacitCompanion'))) add(existsSync(companion) ? 'PASS' : 'USER ACTION', 'menu-bar companion', existsSync(companion) ? 'open macos/TacitCompanion/.build/TACIT.app' : 'run ./scripts/tacit.sh build');

try {
  const cams = (await sh('system_profiler', ['SPCameraDataType'])).split('\n').filter((l) => /^ {4}\S.*:$/.test(l)).map((l) => l.trim().slice(0, -1));
  add(cams.length ? 'PASS' : 'FAIL', 'camera', cams.length ? cams.join(', ') : 'no camera found');
  add('USER ACTION', 'camera permission', 'allow camera for the browser/companion the first time; a call app using the same camera may block it — FaceTime Audio leaves it free');
} catch { add('INFO', 'camera', 'could not enumerate'); }

try {
  const kb = Number((await sh('df', ['-k', root])).trim().split('\n').at(-1)!.split(/\s+/)[3]);
  const gb = kb / 1024 / 1024;
  add(gb >= 2 ? 'PASS' : gb >= 0.5 ? 'USER ACTION' : 'FAIL', 'free disk space', `${gb.toFixed(1)} GB free${gb < 2 ? ' — free some space: TTS temp audio, logs and builds fail or slow down when the disk is full' : ''}`);
} catch { add('INFO', 'free disk space', 'unknown'); }

// ── virtual microphone ──
const bin = routeBinary();
if (!bin) add('FAIL', 'tacit-route (virtual-mic helper)', 'not built: ./scripts/tacit.sh build');
else {
  try {
    const { devices } = await listDevices(bin);
    const dev = pickDevice(devices);
    if (!dev) add('USER ACTION', 'virtual microphone (BlackHole)', 'not installed: brew install blackhole-2ch (asks for your admin password), then restart TACIT');
    else {
      add('PASS', 'virtual microphone', `${dev.name}, ${dev.sampleRate} Hz`);
      let cal: { uid?: string; routeGainDb?: number; at?: string } = {};
      try { cal = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf8')); } catch { /* none */ }
      add(cal.uid === dev.uid ? 'PASS' : 'USER ACTION', 'route gain calibration', cal.uid === dev.uid ? `device loss ${cal.routeGainDb} dB, measured ${cal.at}` : 'run: cd server && npm run route:check (plays a short tone into the virtual mic)');
      const diag = JSON.parse((await sh(bin, ['diagnose', '--device-uid', dev.uid])).trim());
      const warns: string[] = diag.warnings ?? [];
      add(warns.length ? 'FAIL' : 'PASS', 'no echo risk', warns.length ? warns.join('; ') : 'system output is not the virtual mic');
      const readers: string[] = (diag.inputReaders ?? []).map((r: { bundleID: string }) => r.bundleID);
      add(readers.length ? 'PASS' : 'USER ACTION', 'calling app using the virtual mic', readers.length ? readers.join(', ')
        : `none right now — in FaceTime/Zoom/Meet choose "${dev.name}" as the microphone (keep AirPods/speakers as output)`);
    }
  } catch (e) { add('FAIL', 'tacit-route', e instanceof Error ? e.message : String(e)); }
}

// ── running server ──
let services: ServiceStatus | null = null;
type MyVoiceHealth = { engine: { state: string; reason: string | null }; effective: { voiceId: string; label: string }; fallback: string | null; disabled: boolean };
let myVoice = null as MyVoiceHealth | null;
try {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { headers: { authorization: `Bearer ${secrets.userToken}` }, signal: AbortSignal.timeout(2000) });
  const health = (await res.json()) as { services?: ServiceStatus; myVoice?: MyVoiceHealth };
  services = health.services ?? null;
  myVoice = health.myVoice ?? null;
  add(services ? 'PASS' : 'FAIL', 'TACIT server', services ? `running on :${PORT}` : 'answered without detail (token mismatch?)');
} catch { add('USER ACTION', 'TACIT server', 'not running: ./scripts/tacit.sh start'); }
if (services) {
  const r = services.recognition;
  add(r.reachable ? 'PASS' : 'FAIL', 'recognition service', r.reachable ? `${r.model} on ${r.device}${r.live ? `, Live ${r.live.protocol}` : ''}` : 'not reachable (model loading, missing weights or crashed — see ./scripts/tacit.sh logs)');
  const v = services.voiceRoute;
  add(v?.state === 'ready' ? 'PASS' : 'FAIL', 'voice output route (server)', v ? `${v.state}${v.deviceName ? ` · ${v.deviceName}` : ''}${v.reason ? ` · ${v.reason}` : ''}` : 'not reported');
  const vp = services.voicePolicy;
  if (!myVoice) add('FAIL', 'My Voice', 'not reported by the server (older build running? restart when idle)');
  else if (myVoice.disabled) add('INFO', 'My Voice', `disabled by TACIT_VOICE=off (rollback): ${myVoice.effective.label}`);
  else add(myVoice.engine.state === 'ready' ? 'PASS' : 'FAIL', 'My Voice engine (tacit-voice)', myVoice.engine.state === 'ready'
    ? `speaking as ${myVoice.effective.label}${myVoice.fallback ? ` — FALLBACK: ${myVoice.fallback}` : ''}`
    : `${myVoice.engine.state}${myVoice.engine.reason ? ` · ${myVoice.engine.reason}` : ''}`);
  if (vp) add('INFO', 'legacy call voice (browser/Twilio replies)', vp.personalConfigured ? `personal voice ${vp.personalAvailable ? 'available' : `UNAVAILABLE (${vp.personalError})`}` : `system voice (${vp.systemVoice}) — labelled, not your personal voice`);
}
add('INFO', 'automatic speaking of recognised words', 'DISABLED: no validated silent-speech reliability gate (display-only + typed speech)');
add('INFO', 'remote audibility', 'only a human on the other end of the call can confirm it');

if (brief) {
  const bad = rows.filter((r) => r[0] === 'FAIL').length, act = rows.filter((r) => r[0] === 'USER ACTION').length;
  console.log(`TACIT: ${bad ? `${bad} FAIL` : 'no failures'}, ${act} user action(s) — ${rows.filter((r) => r[0] !== 'PASS' && r[0] !== 'INFO').map((r) => r[1]).join(', ') || 'ready'}`);
} else {
  for (const [s, w, d] of rows) console.log(`${s.padEnd(11)} ${w}${d ? ` — ${d}` : ''}`);
}
process.exit(rows.some((r) => r[0] === 'FAIL') ? 1 : 0);
