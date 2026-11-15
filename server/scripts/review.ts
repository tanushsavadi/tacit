// Terminal review-and-Speak fallback. Every action carries the displayed review token; an edit keeps that snapshot.
// npm run review: N@vTOKEN speaks; e N@vTOKEN edits; o enables voice; p/r pause/resume; s stops; q quits.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';
import type { LiveStatus, RecognitionHypothesis, ServerMessage, SpeechOutputStatus } from '../../shared/protocol.ts';
import { buildReviewedRequest } from '../src/reviewed.ts';
import { secrets } from './secrets.ts';

const ws = new WebSocket(`${process.env.TACIT_URL ?? 'ws://127.0.0.1:8790'}/ws?token=${secrets.userToken}`);
let live: LiveStatus | null = null, out: SpeechOutputStatus | null = null, latest: RecognitionHypothesis | null = null;
interface Offer { h: RecognitionHypothesis; live: LiveStatus; out: SpeechOutputStatus; token: string }
let offered: Offer | null = null, version = 0;
const mine = new Set<string>();
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'tacit> ' });
const say = (s: string) => { process.stdout.write(`\r\x1b[K${s}\n`); rl.prompt(true); };
const label = { raw: 'recognised', alternative: 'alternative', phrase: 'phrase list' } as const;
const statusKey = (s: LiveStatus | SpeechOutputStatus | null) => s && `${s.authorizationId}:${s.generation}:${s.state}`;
function display(): void {
  offered = null;
  if (!latest || !out || !live) return;
  const check = buildReviewedRequest(latest, { index: 0 }, out, live, 'display-check', Date.now());
  if (typeof check === 'string') return say(`[review] unavailable: ${check}`);
  const offer: Offer = { h: latest, live: { ...live }, out: { ...out }, token: `v${++version}` };
  offered = offer;
  say(`\n[heard] utterance ${latest.utteranceId.slice(-8)} — use the exact token shown (no automatic send):`);
  for (const c of latest.reviewCandidates ?? []) say(`   ${c.index + 1}@${offer.token}) ${c.text}   (${label[c.kind]}); edit: e ${c.index + 1}@${offer.token}`);
}

ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') {
    const previous = live; live = m.status;
    if (statusKey(previous) !== statusKey(live)) { offered = null; display(); }
    if (previous?.state !== live.state) say(`[live] ${live.state} — ${live.reason}`);
  }
  if (m.type === 'output_status') {
    const previous = out; out = m.status;
    if (statusKey(previous) !== statusKey(out)) { offered = null; display(); }
    if (previous?.state !== out.state) say(`[voice] ${out.state} via ${out.route.deviceName ?? out.route.state} (${out.voice})`);
  }
  if (m.type === 'review_invalidated' && m.authorizationId === live?.authorizationId && m.generation === live.generation) {
    latest = null; offered = null;
    say('[review] replaced by a newer utterance; pending choices and corrections cancelled.');
  }
  if (m.type === 'recognition_hypothesis') {
    const h = m.hypothesis;
    if (h.authorizationId !== live?.authorizationId || h.generation !== live.generation || live.state !== 'active') return;
    latest = h; offered = null;
    if (h.decision !== 'shown') return say(`[heard] nothing usable: ${h.reason}`);
    display();
  }
  if (m.type === 'speech_delivery' && mine.has(m.delivery.requestId)) {
    const dl = m.delivery;
    if (['rendered', 'refused', 'interrupted', 'failed'].includes(dl.state) || dl.state === 'synthesizing')
      say(`[speak] ${dl.state}${dl.reason ? `: ${dl.reason}` : ''}${dl.state === 'rendered' ? ' (played into the virtual mic; ask the listener if they heard it)' : ''}`);
  }
});

function speak(offer: Offer, index: number, edited?: string): void {
  if (offer !== offered) return say('[speak] not sent: review changed; choose the current words again.');
  const id = randomUUID();
  const req = buildReviewedRequest(offer.h, { index, ...(edited !== undefined ? { edited } : {}) }, offer.out, offer.live, id, Date.now());
  if (typeof req === 'string') return say(`[speak] not sent: ${req}`);
  offered = null; // no concurrent submissions or delayed edit callbacks against this approval
  mine.add(id);
  ws.send(JSON.stringify(req));
  say(`[speak] sending ${edited !== undefined ? 'your correction' : 'candidate ' + (index + 1)}: "${req.text}"`);
}

rl.on('line', (line) => {
  const t = line.trim();
  const ctl = (action: 'enable' | 'pause' | 'resume' | 'stop') => { offered = null; ws.send(JSON.stringify({ type: 'output_control', action })); };
  const pick = /^(e\s*)?([1-9])@(v[1-9]\d*)$/.exec(t);
  if (t === 'q') { rl.close(); return; }
  if (t === 'o') ctl('enable'); else if (t === 'p') ctl('pause'); else if (t === 'r') ctl('resume'); else if (t === 's') { ctl('stop'); say('[voice] STOP sent'); }
  else if (pick) {
    const offer = offered, i = Number(pick[2]) - 1;
    if (!offer || pick[3] !== offer.token) say('[review] stale token; use the current displayed choice.');
    else if (!pick[1]) speak(offer, i);
    else {
      const c = offer.h.reviewCandidates?.[i];
      if (!c) say('No such candidate.');
      else { rl.question('edit (Enter to speak, empty to cancel)> ', (txt) => { if (txt.trim()) speak(offer, i, txt); else say('cancelled'); }); rl.write(c.text); return; }
    }
  } else if (t) say('commands: N@vTOKEN speak · e N@vTOKEN edit · o enable voice · p pause · r resume · s STOP · q quit');
  rl.prompt();
});
rl.on('close', () => { offered = null; ws.close(); process.exit(0); });
ws.on('close', () => { latest = null; offered = null; live = null; out = null; say('[review] disconnected; pending choices cancelled.'); });
ws.on('open', () => { say('TACIT review — the browser workspace runs the camera (Start Live). Type o to enable voice output.'); rl.prompt(); });
ws.on('error', (e) => { offered = null; console.error(`cannot connect: ${(e as Error).message}`); process.exit(1); });
