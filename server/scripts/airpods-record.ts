// Cue-driven AirPods motion recorder for the silent-command feasibility experiment.
//   npm run airpods:record -- --protocol jaw  --name s1
//   npm run airpods:record -- --protocol cmd  --name s1 --reps 10
// Cues are spoken (macOS `say`) and printed; a "Tink" marks the start of each action window.
// Output: airpods/data/<timestamp>-<protocol>-<name>/{motion.csv,events.json}. Motion only; no audio.
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const protocol = arg('protocol', 'cmd');
const name = arg('name', 'run');
const reps = Number(arg('reps', '10'));
// The probe must run as an app launched by LaunchServices (macOS attributes Motion permission to the responsible
// process; as a terminal child it is never prompted). AIRPODS_PROBE=<binary> runs a bare binary instead (tests only).
const APP = join(ROOT, 'airpods/.build/TacitAirPods.app');
const probe = process.env.AIRPODS_PROBE;
const outDir = join(ROOT, 'airpods/data', `${new Date().toISOString().replace(/[:.]/g, '-')}-${protocol}-${name}`);
mkdirSync(outDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SILENT = process.env.AIRPODS_SILENT === '1'; // test runs only
const say = (text: string) => { if (!SILENT) spawn('say', ['-r', '230', text], { stdio: 'ignore' }); };
const tink = () => { if (!SILENT) spawn('afplay', ['/System/Library/Sounds/Tink.aiff'], { stdio: 'ignore' }); };
const big = (s: string) => console.log(`\n   >>>  ${s.toUpperCase()}  <<<`);

// Clock alignment: probe timestamps are seconds since boot; offset = min(arrival - t).
let offset = Infinity, n = 0;
const csv = createWriteStream(join(outDir, 'motion.csv'));
const onLine = (l: string) => {
  csv.write(l + '\n');
  if (l.startsWith('t,')) return;
  const t = Number(l.slice(0, l.indexOf(',')));
  offset = Math.min(offset, Date.now() / 1000 - t);
  n++;
};
let lastStatus = '';
const onStatus = (l: string) => { lastStatus = l; console.log(`[probe] ${l}`); };
let p: ReturnType<typeof spawn>;
let probeTmp = '';
if (probe) {
  p = spawn(probe, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  createInterface({ input: p.stderr! }).on('line', onStatus);
  createInterface({ input: p.stdout! }).on('line', onLine);
} else {
  if (!existsSync(APP)) { console.error(`Missing ${APP}. Build it: airpods/tools/build-app.sh`); process.exit(2); }
  // The app's stdout/stderr go to a private temp dir: LaunchServices cannot open files in ~/Documents for the
  // app (it has no Documents-folder access, and we don't ask for any). The recorder copies lines into outDir.
  probeTmp = mkdtempSync(join(tmpdir(), 'tacit-airpods-'));
  const outF = join(probeTmp, 'out'), errF = join(probeTmp, 'err');
  writeFileSync(outF, ''); writeFileSync(errF, '');
  p = spawn('open', ['-n', '-W', '--stdout', outF, '--stderr', errF, APP, '--args', '--parent-pid', String(process.pid)], { stdio: 'ignore' });
  const tail = (file: string, fn: (l: string) => void) => {
    let pos = 0, buf = '';
    setInterval(() => {
      if (!existsSync(file)) return;
      const size = statSync(file).size;
      if (size <= pos) return;
      const fd = openSync(file, 'r'), chunk = Buffer.alloc(size - pos);
      readSync(fd, chunk, 0, chunk.length, pos); closeSync(fd); pos = size;
      buf += chunk.toString();
      const lines = buf.split('\n'); buf = lines.pop()!;
      lines.forEach(fn);
    }, 15).unref();
  };
  tail(outF, onLine); tail(errF, onStatus);
}
const now = () => Date.now() / 1000 - offset; // probe clock
const events: { kind: string; label?: string; cue?: string; t0: number; t1?: number }[] = [];

const INSTR: Record<string, string> = {
  c1: 'mouth "pa" ONCE, silently', c2: 'mouth "pa-pa" (twice), silently', c3: 'mouth "pa-pa-pa" (three times), silently',
  neutral: 'stay still, relaxed', other: 'do the named non-command action',
};
const OTHER = ['swallow', 'small nod', 'look left and back', 'smile'];

async function waitForStream() {
  for (let i = 0; i < 300 && n < 25; i++) await sleep(100);
  if (n < 25) { console.error(`No AirPods motion samples after 30 s. Last probe status: ${lastStatus || 'none'}`); finish(); process.exit(2); }
  console.log(`streaming (${n} samples so far)`);
}

async function block(kind: string, label: string, seconds: number, cue: string) {
  big(cue); say(cue);
  await sleep(1200);
  tink();
  const t0 = now();
  await sleep(seconds * 1000);
  events.push({ kind, label, cue, t0, t1: now() });
}

async function jaw() {
  console.log('Head still throughout, facing the screen. Jaw: open fully then close, silently, on each tick.');
  await block('still', 'still', 8, 'stay still');
  big('jaw open on each tick'); say('jaw open on each tick'); await sleep(2200);
  for (let i = 0; i < 10; i++) { tink(); events.push({ kind: 'tick', label: 'jaw', t0: now() }); await sleep(2000); }
  await block('still', 'still', 6, 'stay still');
  big('small nod on each tick'); say('small nod on each tick'); await sleep(2200);
  for (let i = 0; i < 6; i++) { tink(); events.push({ kind: 'tick', label: 'nod', t0: now() }); await sleep(2000); }
  await block('still', 'still', 4, 'stay still');
}

// Gate 3: outward AirPods mic (macOS exposes only the processed HFP stream). Sham ticks (stay still) control for
// the cue sound leaking into the mic; jaw/mouthing epochs are compared against sham epochs, not silence.
async function mic() {
  const list = (() => { try { execFileSync('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { stdio: 'pipe' }); return ''; } catch (e: any) { return String(e.stderr); } })();
  const audio = list.split('AVFoundation audio devices:')[1] ?? '';
  const m = audio.split('\n').map((l) => /\[(\d+)\] (.*AirPods.*)$/.exec(l)).find(Boolean);
  if (!m) { console.error('No AirPods microphone found in AVFoundation devices:\n' + audio); return; }
  console.log(`mic: [${m[1]}] ${m[2]} (selecting it switches the AirPods to the HFP headset profile)`);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation', '-i', `:${m[1]}`, '-ac', '1', '-ar', '16000', '-y', join(outDir, 'audio.wav')], { stdio: ['pipe', 'ignore', 'inherit'] });
  const audioStart = now();
  events.push({ kind: 'audio_start', t0: audioStart });
  await sleep(2500);
  const ticks = async (label: string, cue: string, k: number) => {
    big(cue); say(cue); await sleep(2500);
    const order = Array.from({ length: k * 2 }, (_, i) => (i % 2 ? label : 'sham')).sort(() => Math.random() - 0.5);
    for (const l of order) { big(l === 'sham' ? 'tick: stay still' : `tick: ${cue}`); await sleep(800); tink(); events.push({ kind: 'tick', label: l, t0: now() }); await sleep(2200); }
  };
  await block('still', 'still', 6, 'stay still');
  await ticks('jaw', 'jaw open, silently', 8);
  await ticks('mouth', 'mouth pa pa pa, silently', 8);
  ff.stdin!.write('q'); await sleep(800);
}

async function cmd() {
  console.log('Head still. On each tick:'); for (const [k, v] of Object.entries(INSTR)) console.log(`  ${k.padEnd(8)} ${v}`);
  const classes = ['c1', 'c2', 'c3', 'neutral', 'other'];
  const cueOf: Record<string, string> = { c1: 'one', c2: 'two', c3: 'three', neutral: 'still' };
  let o = 0, k = 0;
  for (let r = 0; r < reps; r++) {
    const order = [...classes].sort(() => Math.random() - 0.5);
    for (const c of order) {
      const cue = (c === 'other' ? OTHER[o++ % OTHER.length] : cueOf[c]) ?? c;
      k++; process.stdout.write(`\ntrial ${k}/${reps * classes.length}`);
      big(cue); say(cue);
      await sleep(1500);
      tink();
      const t0 = now();
      await sleep(2300);
      events.push({ kind: 'trial', label: c, cue, t0, t1: now() });
      await sleep(700);
    }
    if (r === Math.floor(reps / 2) - 1) { big('short break, keep the AirPods in'); say('short break'); await sleep(5000); }
  }
}

// Mode 2 experiment: are different silently mouthed WORDS distinguishable (not just "the mouth moved")?
// Closed small vocabulary only — results say nothing about open-vocabulary silent speech.
const STYLE = arg('style', 'default');
const WORDS = (arg('words', 'yes,no,hello,water,help') ?? '').split(',').map((w) => w.trim()).filter(Boolean);
async function words() {
  if (STYLE === 'deliberate') console.log(`Head still. After each tick, ARTICULATE the whole word once — full lip and jaw movement, as if speaking clearly to someone lip-reading — but with no voice, no whisper, no breath.`);
  else console.log(`Head still. After each tick, silently mouth the word you heard ONCE, clearly, with no voice and no breath.`);
  console.log(`  words: ${WORDS.join(', ')}   |  "still": do nothing  |  other cues (${OTHER.join(', ')}): do that action`);
  const classes = [...WORDS, 'neutral', 'other'];
  let o = 0, k = 0;
  for (let r = 0; r < reps; r++) {
    const order = [...classes].sort(() => Math.random() - 0.5);
    for (const c of order) {
      const cue = c === 'other' ? OTHER[o++ % OTHER.length]! : c === 'neutral' ? 'still' : c;
      k++; process.stdout.write(`\ntrial ${k}/${reps * classes.length}`);
      big(cue); say(cue);
      await sleep(1500);
      tink();
      const t0 = now();
      await sleep(2500);
      events.push({ kind: 'trial', label: c, cue, t0, t1: now() });
      await sleep(700);
    }
    if (r === Math.floor(reps / 2) - 1) { big('short break, keep the AirPods in'); say('short break'); await sleep(5000); }
  }
}

process.on('SIGINT', () => { finish(); process.exit(130); });
function finish() {
  p.kill();
  if (probeTmp) setTimeout(() => rmSync(probeTmp, { recursive: true, force: true }), 200).unref();
  const meta = { protocol, name, reps, words: protocol === 'words' ? WORDS : undefined, style: protocol === 'words' ? STYLE : undefined, samples: n, offsetS: offset, events, created: new Date().toISOString(),
    os: execFileSync('sw_vers', ['-productVersion']).toString().trim() };
  writeFileSync(join(outDir, 'events.json'), JSON.stringify(meta, null, 1));
  console.log(`\nsaved ${n} samples, ${events.length} events → ${outDir}`);
}

await waitForStream();
say('starting in three seconds'); await sleep(3000);
if (protocol === 'jaw') await jaw(); else if (protocol === 'mic') await mic(); else if (protocol === 'words') await words(); else await cmd();
await sleep(500);
finish();
setTimeout(() => process.exit(0), 300);
