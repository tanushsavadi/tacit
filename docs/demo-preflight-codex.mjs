// Passive wrapper around Claude's preflight; adds build/revision and reviewed-contract checks.
// No WebSocket, camera request, inference, playback, service control or system-setting writes.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const add = (state, check, detail) => rows.push({ state, check, detail });
const read = path => readFileSync(join(root, path), 'utf8');
const command = (bin, args) => execFileSync(bin, args, {
  cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  env: { ...process.env, LC_ALL: 'C', TSX_DISABLE_CACHE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
function sources(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx|swift|py|json|sh|env)$/.test(path) && !/\.test\.ts$/.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true })
    .filter(e => !e.isSymbolicLink() && !['node_modules', '.build', '__pycache__', 'data'].includes(e.name))
    .flatMap(e => sources(join(path, e.name)));
}
function freshness(label, builtAt, paths) {
  const newer = paths.flatMap(p => sources(join(root, p))).filter(p => statSync(p).mtimeMs > builtAt + 1000);
  add(newer.length ? 'USER ACTION' : 'PASS', label,
    newer.length ? `${newer.length} source/config file(s) newer than artifact/process; owner must reconcile while idle`
      : 'no newer inspected source/config; timestamps are not build identity proof');
}

if (process.argv.includes('--help')) {
  console.log('node docs/demo-preflight-codex.mjs\nRead-only demo preflight. Exit 0: no failures/actions; 1: FAIL; 2: USER ACTION remains.\nCamera permission and remote hearing always need a physical check. No private recordings are read.');
  process.exit(0);
}
console.log(`TACIT passive demo preflight — ${new Date().toISOString()}`);
// preflight.ts imports loadSecrets(), which can create/replace credentials. Run it only when
// its effective tokens match the store. Node's filesystem write denial also protects against
// a concurrent credential rotation between this check and the child reading the store.
let stored, token;
try {
  if (existsSync(join(root, 'server/.env'))) process.loadEnvFile(join(root, 'server/.env'));
  stored = JSON.parse(read('server/data/secrets.json'));
  token = process.env.TACIT_USER_TOKEN || stored.userToken;
  const caller = process.env.TACIT_CALLER_TOKEN || stored.callerToken;
  if (!token || !caller || token !== stored.userToken || caller !== stored.callerToken) throw new Error();
  // tsx needs its temporary IPC directory even with its transform cache disabled.
  const ipc = join(tmpdir(), `tsx-${process.getuid()}`);
  const output = command(process.execPath, ['--permission', '--allow-fs-read=*', `--allow-fs-write=${ipc}`, '--allow-child-process', '--allow-worker',
    join(root, 'server/node_modules/tsx/dist/cli.mjs'), join(root, 'server/scripts/preflight.ts')]);
  process.stdout.write(output);
  if (/^USER ACTION/m.test(output)) add('USER ACTION', 'base preflight actions', 'see existing preflight output above');
} catch {
  // Never print child exceptions: they can contain process environment or credential-bearing URLs.
  add('FAIL', 'existing preflight', 'not run or failed; inspect credentials/dependencies privately; no credentials generated');
}

const port = Number(process.env.PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  add('FAIL', 'server port', 'invalid PORT');
} else {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}, redirect: 'error', signal: AbortSignal.timeout(2500),
    });
    const h = await res.json(), r = h.services?.recognition, route = h.services?.voiceRoute;
    add(res.ok && !!h.services ? 'PASS' : 'FAIL', 'authenticated health', `loopback :${port}; credential omitted`);
    add(r?.reachable && r.live?.protocol === 'tacit-live-v1' && Date.now() - r.checkedAt < 45000 ? 'PASS' : 'FAIL',
      'recent Live capability', 'requires reachable recognizer, tacit-live-v1, health age <45 s');
    add(r?.live?.automaticSpeechValidated === false ? 'PASS' : 'FAIL', 'automatic speech gate', 'must report false');
    add(route?.state === 'ready' && route.deviceName === 'BlackHole 16ch' ? 'PASS' : 'FAIL',
      'demo route identity', 'server must use BlackHole 16ch; do not change routing during recording');
    add('USER ACTION', 'loaded reviewed implementation', 'health does not advertise speak_reviewed or a code revision; source/tests alone cannot prove loaded handlers');
  } catch { add('FAIL', 'authenticated health', 'unavailable/invalid response; no restart attempted'); }
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'error', signal: AbortSignal.timeout(2500) });
    add(page.ok && (page.headers.get('content-type') ?? '').includes('text/html') && (await page.text()).includes('<div id="root">') ? 'PASS' : 'FAIL',
      'served camera workspace HTML', 'HTTP only; no browser, permission prompt or camera opened');
  } catch { add('FAIL', 'served camera workspace HTML', 'not reachable; no frontend started'); }
  for (const [label, p, paths] of [
    ['server source freshness', port, ['server/src', 'shared', 'server/.env', 'server/package.json']],
    ['recognizer source freshness (default port)', 8765, ['recognition/tacit_vsr']],
  ]) {
    try {
      const pids = command('/usr/sbin/lsof', ['-nP', `-iTCP:${p}`, '-sTCP:LISTEN', '-t']).trim().split(/\s+/);
      const pid = pids[0];
      if (!/^\d+$/.test(pid)) throw new Error();
      const start = Date.parse(command('/bin/ps', ['-p', pid, '-o', 'lstart=']).trim());
      if (!Number.isFinite(start)) throw new Error();
      freshness(label, start, paths);
    } catch { add('USER ACTION', label, 'listener start time unknown; non-default recognizer port requires owner verification'); }
  }
}

for (const path of [
  'third_party/visual/weights/LRS3_V_WER19.1/model.pth',
  'third_party/visual/weights/LRS3_V_WER19.1/model.json',
  'third_party/visual/auto_avsr/spm/unigram/unigram5000.model',
  'third_party/visual/chaplin/pipelines/tokens/unigram5000_units.txt',
  'third_party/visual/chaplin/pipelines/detectors/mediapipe/20words_mean_face.npy',
  'web/dist/models/face_landmarker.task',
  'web/dist/mediapipe/vision_wasm_internal.js',
  'web/dist/mediapipe/vision_wasm_internal.wasm',
  'web/dist/mediapipe/vision_wasm_module_internal.js',
  'web/dist/mediapipe/vision_wasm_module_internal.wasm',
]) {
  const absolute = join(root, path);
  add(existsSync(absolute) && statSync(absolute).size > 0 ? 'PASS' : 'FAIL', 'required runtime asset', path);
}
try {
  const protocol = read('shared/protocol.ts'), handler = read('server/src/index.ts');
  add(protocol.includes("type: 'speak_reviewed'") && handler.includes("case 'speak_reviewed'") ? 'PASS' : 'FAIL',
    'reviewed protocol in source', 'source declaration + handler present; run safe unit tests for behavior');
  const app = join(root, 'macos/TacitCompanion/.build/TACIT.app');
  command('/usr/bin/codesign', ['--verify', '--strict', app]);
  add('PASS', 'packaged companion signature', 'existing app verified; not launched or rebuilt');
  freshness('companion build freshness', statSync(join(app, 'Contents/MacOS/TacitCompanion')).mtimeMs,
    ['macos/TacitCompanion/Sources', 'macos/TacitCompanion/Package.swift', 'macos/TacitCompanion/build-app.sh']);
  freshness('served web build freshness', statSync(join(root, 'web/dist/index.html')).mtimeMs,
    ['web/src', 'web/package.json', 'web/vite.config.ts', 'shared']);
} catch { add('FAIL', 'source/app/build inspection', 'missing artifact, invalid signature or unreadable source; owner rebuild only when idle'); }
try {
  const count = command('/usr/bin/pgrep', ['-x', 'TacitCompanion']).trim().split(/\s+/).length;
  add(count === 1 ? 'PASS' : 'FAIL', 'companion instances', `${count}; keep exactly one to avoid competing UI/hotkey owners`);
} catch { add('USER ACTION', 'companion instances', 'not running or unavailable; launch once after recording, without --selftest'); }
add('USER ACTION', 'camera permissions / capture', 'not requested: use original visible workspace after recording; hardware enumeration is not browser permission');
add('USER ACTION', 'remote listener / physical Stop', 'not exercised: confirm reviewed + corrected words and silence after Pause/Stop on the other device');
console.log('\nSupplemental demo checks:');
for (const r of rows) console.log(`${r.state.padEnd(11)} ${r.check} — ${r.detail}`);
const fail = rows.filter(r => r.state === 'FAIL').length, action = rows.filter(r => r.state === 'USER ACTION').length;
console.log(`\n${fail} supplemental FAIL; ${action} unresolved action(s). PASS never proves remote hearing.`);
process.exitCode = fail ? 1 : action ? 2 : 0;
