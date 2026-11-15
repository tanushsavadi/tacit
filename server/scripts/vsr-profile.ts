// Switch the recognizer model profile (recognition/tacit_vsr/profiles.py) and restart ONLY the recognition sidecar.
//   npx tsx scripts/vsr-profile.ts status
//   npx tsx scripts/vsr-profile.ts personal-demo [--force]   # EXPERIMENTAL personal overlay, Review First enforced
//   npx tsx scripts/vsr-profile.ts base [--force]            # rollback to the unchanged base model
// Refuses while Live is on or a call is connected (unless --force). The server keeps running and respawns the sidecar,
// which reads the profile at start; this script then waits until /health reports the requested profile.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { secrets } from './secrets.ts';

const PORT = process.env.PORT ?? '8790';
const REC = process.env.RECOGNITION_URL ?? 'http://127.0.0.1:8765';
const RECOGNITION_DIR = fileURLToPath(new URL('../../recognition/', import.meta.url));
const PY = `${RECOGNITION_DIR}.venv/bin/python`;
const [cmd = 'status', ...rest] = process.argv.slice(2);
const force = rest.includes('--force');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(url: string, auth = false): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(url, { headers: auth ? { authorization: `Bearer ${secrets.userToken}` } : {}, signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as Record<string, any>) : null;
  } catch { return null; }
}
const selector = (...args: string[]) => JSON.parse(execFileSync(PY, ['-m', 'tacit_vsr.profiles', ...args], { cwd: RECOGNITION_DIR, encoding: 'utf8' }).trim().split('\n').at(-1)!);
const running = async () => { const b = await json(`${REC}/health`); return b ? (b.profile ?? { id: 'base', note: 'sidecar predates profile reporting' }) : null; };
const show = (p: Record<string, any> | null) => (p ? `${p.id}${p.reviewRequired ? ' (EXPERIMENTAL, Review First)' : ''}${p.error ? ` — ERROR: ${p.error}` : ''}` : 'not reachable');

if (cmd === 'status') {
  console.log(`selected: ${JSON.stringify(selector('status'))}`);
  console.log(`running recognizer: ${show(await running())}`);
  const h = await json(`http://127.0.0.1:${PORT}/api/health`, true);
  console.log(`server: ${h ? `phase ${h.phase}, live ${h.live?.state ?? '?'}/${h.live?.mode ?? '?'}, reviewRequired ${h.live?.reviewRequired ?? '?'}` : 'not running'}`);
  process.exit(0);
}
if (!['base', 'personal-demo'].includes(cmd)) { console.error('usage: vsr-profile.ts status | base | personal-demo [--force]'); process.exit(2); }

const h = await json(`http://127.0.0.1:${PORT}/api/health`, true);
if (h && !force) {
  if (h.live?.state && h.live.state !== 'off') { console.error(`REFUSED: Live is ${h.live.state}. End Live first (or --force).`); process.exit(1); }
  if (h.phase && h.phase !== 'DISCONNECTED') { console.error(`REFUSED: a call is active (phase ${h.phase}). Hang up first (or --force).`); process.exit(1); }
}
console.log(`selector: ${JSON.stringify(selector('set', cmd))}`); // verifies pinned hashes before writing
if (!h) { console.log('TACIT server not running: the profile applies at the next ./scripts/tacit.sh start.'); process.exit(0); }

const pid = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${new URL(REC).port || 8765}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n')[0];
const command = pid ? execFileSync('/bin/ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }) : '';
if (!pid || !command.includes('tacit_vsr.service')) { console.error('FAIL: no tacit_vsr.service sidecar found to restart'); process.exit(1); }
const before = await running();
console.log(`restarting recognition sidecar (pid ${pid}; was ${show(before)}); the server respawns it…`);
process.kill(Number(pid), 'SIGTERM');
for (let i = 0; i < 120; i++) {
  await sleep(500);
  const p = await running();
  if (!p) continue;
  console.log(`running recognizer: ${show(p)}`);
  process.exit(p.id === cmd && !p.error ? 0 : 1);
}
console.error('FAIL: recognizer did not come back within 60 s — check ./scripts/tacit.sh logs');
process.exit(1);
