// Terminal review-and-Speak client (fallback UI for reviewed speech; the browser keeps owning camera capture/Live).
// Shows the candidates of the LATEST shown utterance. Nothing is ever pre-selected or sent automatically: the user
// types a number (or edits) and presses Enter. The server re-checks every request (speak_reviewed).
//   npm run review            commands:  1-6 speak candidate · e N edit candidate N then Enter · o enable voice
//                                        output · p pause · r resume · s STOP (cuts audio now) · q quit
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';
import type { LiveStatus, RecognitionHypothesis, ServerMessage, SpeechOutputStatus } from '../../shared/protocol.ts';
import { buildReviewedRequest } from '../src/reviewed.ts';
import { secrets } from './secrets.ts';

const ws = new WebSocket(`${process.env.TACIT_URL ?? 'ws://127.0.0.1:8790'}/ws?token=${secrets.userToken}`);
let live: LiveStatus | null = null, out: SpeechOutputStatus | null = null, latest: RecognitionHypothesis | null = null;
const mine = new Set<string>();
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'tacit> ' });
const say = (s: string) => { process.stdout.write(`\r\x1b[K${s}\n`); rl.prompt(true); };
const label = { raw: 'recognised', alternative: 'alternative', phrase: 'phrase list' } as const;

ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') { const was = live?.state; live = m.status; if (was !== live.state) say(`[live] ${live.state} — ${live.reason}`); }
  if (m.type === 'output_status') { const was = out?.state; out = m.status; if (was !== out.state) say(`[voice] ${out.state} via ${out.route.deviceName ?? out.route.state} (${out.voice})`); }
  if (m.type === 'recognition_hypothesis') {
    const h = m.hypothesis;
    if (h.decision !== 'shown') return say(`[heard] nothing usable: ${h.reason}`);
    latest = h;
    say(`\n[heard] utterance ${h.utteranceId.slice(-8)} — pick one and press Enter (nothing is sent until you do):`);
    for (const c of h.reviewCandidates ?? []) say(`   ${c.index + 1}) ${c.text}   (${label[c.kind]})`);
  }
  if (m.type === 'speech_delivery' && mine.has(m.delivery.requestId)) {
    const dl = m.delivery;
    if (['rendered', 'refused', 'interrupted', 'failed'].includes(dl.state) || dl.state === 'synthesizing')
      say(`[speak] ${dl.state}${dl.reason ? `: ${dl.reason}` : ''}${dl.state === 'rendered' ? ' (played into the virtual mic; ask the listener if they heard it)' : ''}`);
  }
});

function speak(index: number, edited?: string): void {
  if (!latest || !out || !live) return say('No recognised utterance yet.');
  const id = randomUUID();
  const req = buildReviewedRequest(latest, { index, ...(edited !== undefined ? { edited } : {}) }, out, live, id);
  if (typeof req === 'string') return say(`[speak] not sent: ${req}`);
  mine.add(id);
  ws.send(JSON.stringify(req));
  say(`[speak] sending ${edited !== undefined ? 'your correction' : 'candidate ' + (index + 1)}: "${req.text}"`);
}

rl.on('line', (line) => {
  const t = line.trim();
  const ctl = (action: 'enable' | 'pause' | 'resume' | 'stop') => ws.send(JSON.stringify({ type: 'output_control', action }));
  if (t === 'q') { rl.close(); return; }
  if (t === 'o') ctl('enable'); else if (t === 'p') ctl('pause'); else if (t === 'r') ctl('resume'); else if (t === 's') { ctl('stop'); say('[voice] STOP sent'); }
  else if (/^[1-9]$/.test(t)) speak(Number(t) - 1);
  else if (/^e\s*[1-9]$/.test(t)) {
    const i = Number(t.replace(/\D/g, '')) - 1, c = latest?.reviewCandidates?.[i];
    if (!c) say('No such candidate.');
    else { rl.question('edit (Enter to speak, empty to cancel)> ', (txt) => { if (txt.trim()) speak(i, txt.trim()); else say('cancelled'); }); rl.write(c.text.toLowerCase()); return; }
  } else if (t) say('commands: 1-6 speak · e N edit · o enable voice · p pause · r resume · s STOP · q quit');
  rl.prompt();
});
rl.on('close', () => { ws.close(); process.exit(0); });
ws.on('open', () => { say('TACIT review — the browser workspace runs the camera (Start Live). Type o to enable voice output.'); rl.prompt(); });
ws.on('error', (e) => { console.error(`cannot connect: ${(e as Error).message}`); process.exit(1); });
