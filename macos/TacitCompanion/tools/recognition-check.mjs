// Native UI integration QA with an EXISTING recording and the REAL recognizer. No camera, mocked hypotheses,
// invented suggestions, reference correction, or automatic speech. Never an independent accuracy measurement.
// node macos/TacitCompanion/tools/recognition-check.mjs /path/to/clip.mp4
// Commands on stdin: send | pause | resume | voice | end. Speak is deliberately a native UI action.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(join(root, 'server/package.json'));
const { WebSocket } = require('ws');
if (!process.argv[2]) throw new Error('Provide an existing recorded clip. No camera is activated.');
const dir = mkdtempSync(join(tmpdir(), 'tacit-native-qa-'));
let frames;
try {
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',resolve(process.argv[2]),'-an','-vf','fps=25,scale=640:-2','-frames:v','250','-q:v','4',join(dir,'f%04d.jpg')]);
  frames = readdirSync(dir).sort().map(f => readFileSync(join(dir,f)));
} finally { rmSync(dir, {recursive:true,force:true}); }
if (frames.length < 8 || frames.reduce((sum,f)=>sum+f.length,0) > 12 * 1024 * 1024) throw new Error('Clip outside protocol bounds');
const { userToken } = JSON.parse(readFileSync(join(root,'server/data/secrets.json'),'utf8'));
const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT ?? 8790}/ws?token=${encodeURIComponent(userToken)}`);
let live, output, ownLive, ownOutput, awaitingVoice = false, started = false, ending = false;
const send = message => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
const lines = createInterface({input:process.stdin});
const close = () => {
  if (ending) return; ending = true;
  if (ownOutput && output?.authorizationId === ownOutput) send({type:'output_control',action:'stop'});
  ws.close(); lines.close(); clearTimeout(deadline);
};
const deadline = setTimeout(close, 240000);
const clip = () => {
  if (!ownLive || live?.authorizationId !== ownLive || live.state !== 'active') return console.log('BLOCKED: this QA session is not active');
  const start = performance.now(), times = frames.map((_,i)=>start+i*40);
  send({type:'visual_utterance',utteranceId:randomUUID(),authorizationId:ownLive,startMs:times[0],endMs:times.at(-1),endpointMs:times.at(-1)+480,frameTimesMs:times});
  for (const frame of frames) ws.send(frame);
  console.log(`RECORDED INPUT: ${frames.length} genuine frames submitted; not a live-camera or held-out accuracy test`);
};
const start = () => {
  if (started || !live || !output) return;
  if (live.state !== 'off' || output.state !== 'off' || output.route.readers?.length !== 0) {
    console.log('BLOCKED: requires Live/output off and known zero route readers; no sessions changed'); return close();
  }
  started = true; send({type:'live_control',action:'activate',mode:'display-only',inputSource:'camera'});
};
ws.on('message', data => {
  let m; try { m=JSON.parse(String(data)); } catch { return; }
  if (m.type === 'live_status') {
    live=m.status;
    console.log(`Live: ${live.state}`);
    if (started && !ownLive && live.state==='active') { ownLive=live.authorizationId; clip(); }
    else if (ownLive && live.authorizationId && live.authorizationId!==ownLive) { console.log('Session replaced; ending QA observer'); close(); }
    start();
  }
  if (m.type === 'output_status') {
    output=m.status;
    if (awaitingVoice && output.state==='ready') {ownOutput=output.authorizationId;awaitingVoice=false;}
    start();
  }
  if (m.type === 'recognition_hypothesis') console.log(JSON.stringify({recognition:m.hypothesis.decision,reviewCandidates:m.hypothesis.reviewCandidates?.length??0,transmitted:m.hypothesis.transmitted,recognitionMs:m.hypothesis.recognitionMs}));
  if (m.type === 'speech_delivery') console.log(JSON.stringify({delivery:m.delivery.state,source:m.delivery.source,remoteAudibility:m.delivery.remoteAudibility}));
});
lines.on('line', line => {
  if (line==='end') return close();
  if (live?.authorizationId!==ownLive) return;
  if (line==='send') clip();
  if (line==='pause'||line==='resume') send({type:'live_control',action:line});
  if (line==='voice' && output?.state==='off' && output.route.readers?.length===0) { awaitingVoice=true;send({type:'output_control',action:'enable'}); }
});
ws.on('error', () => { console.log('Local QA connection failed (URL withheld)'); close(); });
ws.on('close', () => { lines.close();clearTimeout(deadline); });
process.on('SIGINT',close);process.on('SIGTERM',close);
