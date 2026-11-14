/**
 * TACIT server: HTTP + WebSocket on :8790.
 *   /ws?token=…          TACIT user UI (snapshots out, ClientMessage in)       — user token required
 *   /ws/caller?invite=…  remote caller browser (browser-ws call transport)     — caller invite required
 *   POST /twilio/voice   Twilio webhook (signature-verified) → TwiML with a one-time stream token
 *   /twilio/media        Twilio Media Streams (bound to the webhook by that token)
 *   /api/health          minimal status; full detail with the user token (Authorization: Bearer or ?token=)
 *   /                    serves web/dist when built (dev uses Vite on :5173 with a proxy)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, TurnLogMode } from '../../shared/protocol.ts';
import { Controller } from './controller.ts';
import { DEFAULT_GEMINI_MODELS, geminiGenerator, localGenerator, LOCAL_MODEL, withLabelledFallback } from './candidates.ts';
import { BrowserCall, SimCall } from './calls.ts';
import { TtsCache, checkElevenLabsVoice, createTts } from './tts.ts';
import { launchWhisperServer, whisperCpp, whisperServer, withSttFallback, type Stt } from './stt.ts';
import { TwilioCall, twiml, validTwilioSignature } from './twilio.ts';
import { authorizeUpgrade, loadSecrets, safeEqual, StreamTokens, type AuthConfig } from './auth.ts';
import { TurnLog } from './turnlog.ts';
import { LIVE_CAPABILITY, LiveSession, httpRecognizer } from './live.ts';
import { listDevices, pickDevice, routeBinary, routeGain, RouteHelper, sweepStaleAudio, unconfiguredRoute } from './route.ts';
import { SpeechOutput } from './speech.ts';
import type { VoiceRouteStatus } from '../../shared/protocol.ts';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const PORT = Number(process.env.PORT ?? 8790);
const RECOGNITION_URL = process.env.RECOGNITION_URL ?? 'http://127.0.0.1:8765';
const WEB_DIST = resolve(root, '..', 'web', 'dist');
/** Public https base URL (e.g. a cloudflared tunnel) — required for Twilio webhooks/signatures. */
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '') || null;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || null;

// ───────────────────────────── security config ─────────────────────────────

const authDisabled = process.env.TACIT_AUTH === 'off';
if (authDisabled && PUBLIC_URL) {
  console.error('[tacit] refusing to start: TACIT_AUTH=off is not allowed when PUBLIC_URL is set.');
  process.exit(1);
}
const auth: AuthConfig = {
  secrets: loadSecrets(join(root, 'data', 'secrets.json')),
  allowedOrigins: [
    ...(PUBLIC_URL ? [new URL(PUBLIC_URL).origin] : []),
    ...(process.env.TACIT_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ],
  disabled: authDisabled,
};
const streamTokens = new StreamTokens();

// ───────────────────────────── wiring ─────────────────────────────

const geminiModels = (process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL)?.split(',').map((m) => m.trim()).filter(Boolean) ?? DEFAULT_GEMINI_MODELS;
const gemini = process.env.GEMINI_API_KEY ? geminiGenerator(process.env.GEMINI_API_KEY, geminiModels) : null;
const created = createTts();
const tts = created.tts;
if (created.reason) console.log(`[tts] system voice: ${created.reason}`);
if (tts.personal) {
  // Confirm the configured ID exists and is a cloned voice before presenting it as the user's own.
  const check = await checkElevenLabsVoice(process.env.ELEVENLABS_API_KEY!, process.env.ELEVENLABS_VOICE_ID!, process.env.ELEVENLABS_BASE_URL);
  if (!check.ok || !check.personal) {
    const why = check.ok ? `voice category '${check.category}' is not a cloned voice` : `voice check failed: ${check.error}`;
    console.warn(`[tts] personal voice UNAVAILABLE (${why}); replies will fail until fixed or the user approves the system voice`);
    tts.disablePersonal(why);
  } else console.log(`[tts] personal voice verified: '${check.name}' (${check.category})`);
}
const sttCli = whisperCpp();
let stt: Stt | null = sttCli;
let stopWhisperServer: (() => void) | null = null;
if (process.env.WHISPER_SERVER_URL) {
  stt = withSttFallback(whisperServer(process.env.WHISPER_SERVER_URL), sttCli);
} else if (sttCli && process.env.WHISPER_SERVER !== 'off') {
  // Persistent model: measured p50 90 ms vs 388 ms per whisper-cli call (npm run bench:stt).
  // Supervised: if the child dies, requests fall back to whisper-cli while it is relaunched (max 5 restarts).
  let restarts = 0;
  const supervise = async (): Promise<boolean> => {
    const launched = await launchWhisperServer(undefined, undefined, undefined, () => {
      if (restarts >= 5) return void console.error('[stt] whisper-server keeps exiting; staying on whisper-cli');
      restarts += 1;
      console.warn(`[stt] whisper-server exited; restart ${restarts}/5 in 1 s`);
      setTimeout(() => void supervise(), 1000);
    });
    if (launched) stopWhisperServer = launched.stop;
    return !!launched;
  };
  if (await supervise()) {
    const port = process.env.WHISPER_SERVER_PORT ?? '8766';
    stt = withSttFallback(whisperServer(`http://127.0.0.1:${port}`, `local :${port}`), sttCli);
  } else console.warn('[stt] whisper-server unavailable; using per-call whisper-cli');
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => (stopWhisperServer?.(), process.exit(0)));
process.on('exit', () => stopWhisperServer?.());

const envLog = process.env.TACIT_LOG_TURNS as TurnLogMode | undefined;
const turnLog = new TurnLog(join(root, 'data', 'turns.jsonl'), {
  mode: envLog === 'timings' || envLog === 'full' ? envLog : 'off',
  retentionDays: Number(process.env.TACIT_LOG_RETENTION_DAYS ?? 7),
});

const controller = new Controller({
  generate: gemini ? withLabelledFallback(gemini.generate) : localGenerator,
  onTurnClosed: (turn) => {
    void turnLog
      .record(turn)
      .then(() => controller.setServices({ logging: turnLog.get() }))
      .catch((e) => console.error('[turns] write failed', e));
  },
});

controller.setServices({
  gemini: { configured: !!gemini, model: gemini ? gemini.models.join(' → ') : LOCAL_MODEL },
  logging: turnLog.get(),
  voicePolicy: tts.status(),
  voice: {
    listening: true,
    publicUrl: PUBLIC_URL,
    providers: {
      tts: true,
      ttsPersonal: tts.personal,
      [tts.label]: true,
      stt: !!stt,
      ...(stt ? { [stt.label]: true } : {}),
      authRequired: !auth.disabled,
      twilioSignatureCheck: !!TWILIO_AUTH_TOKEN,
    },
  },
});

async function pruneLogs(): Promise<void> {
  const removed = await turnLog.prune();
  if (removed) console.log(`[turns] pruned ${removed} entries older than ${turnLog.get().retentionDays} days`);
  controller.setServices({ logging: turnLog.get() });
}
void pruneLogs();
setInterval(() => void pruneLogs(), 3_600_000).unref();

// Auto-start the local Auto-AVSR service (recognition/tacit_vsr/service.py) when using the default URL.
const RECOGNITION_DIR = fileURLToPath(new URL('../../recognition/', import.meta.url));
const RECOGNITION_PY = `${RECOGNITION_DIR}.venv/bin/python`;
let recognitionRestarts = 0;
function launchRecognition(): void {
  const port = new URL(RECOGNITION_URL).port || '8765';
  const p = spawn(RECOGNITION_PY, ['-m', 'tacit_vsr.service', '--port', port, '--parent-pid', String(process.pid)], { cwd: RECOGNITION_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d: Buffer) => {
    for (const l of String(d).split('\n')) if (l.startsWith('[vsr]')) {
      console.log(`[recognition] ${l.slice(6)}`);
      if (l.includes('listening')) void probeRecognition(); // report ready immediately, not at the next 15 s probe
    }
  });
  p.stderr.resume();
  p.on('exit', (code) => {
    console.log(`[recognition] service exited (${code})`);
    void probeRecognition();
    if (++recognitionRestarts <= 5) setTimeout(launchRecognition, 1000);
  });
  process.on('exit', () => p.kill());
}
if (!process.env.RECOGNITION_URL && process.env.RECOGNITION_AUTOSTART !== 'off' && existsSync(RECOGNITION_PY)) launchRecognition();

async function probeRecognition(): Promise<void> {
  try {
    const res = await fetch(`${RECOGNITION_URL}/health`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { model?: string; device?: string };
    if (res.ok) recognitionRestarts = 0;
    controller.setServices({ recognition: { reachable: res.ok, model: body.model ?? null, device: body.device ?? null, checkedAt: Date.now(), ...(res.ok ? { live: LIVE_CAPABILITY } : {}) } });
  } catch {
    const prev = controller.snapshot().services.recognition;
    if (prev.reachable || prev.checkedAt === null)
      controller.setServices({ recognition: { reachable: false, model: null, device: null, checkedAt: Date.now() } });
  }
}
void probeRecognition();
setInterval(probeRecognition, 15_000).unref();

// ───────────────────────────── UI channel ─────────────────────────────

const uiClients = new Set<WebSocket>();
function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of uiClients) if (ws.readyState === ws.OPEN) ws.send(data);
}
controller.on('change', (snapshot) => broadcast({ type: 'snapshot', snapshot }));
controller.on('cue', (cue) => broadcast({ type: 'cue', cue }));

// ───────────────────────────── Live Silent Speech + voice output ─────────────────────────────
// One Live session and one speech-output session for the whole server (one user, one virtual mic per Mac): the
// browser workspace and the menu-bar companion see and control the same state.

let route: RouteHelper | null = null;
let routeFallback: VoiceRouteStatus = unconfiguredRoute('Checking for the virtual microphone…');
const speech = new SpeechOutput(tts, () => route, () => routeFallback);
speech.usePresynth(new TtsCache(tts, 'file')); // reviewed candidates, local only, under the voice policy
speech.on('status', (status) => { broadcast({ type: 'output_status', status }); controller.setServices({ voiceRoute: status.route }); });
speech.on('delivery', (delivery) => {
  broadcast({ type: 'speech_delivery', delivery });
  if (['rendered', 'refused', 'interrupted', 'failed'].includes(delivery.state)) {
    const t = delivery.timings;
    console.log(`[speech] ${delivery.source} ${delivery.state}${delivery.reason ? ` (${delivery.reason})` : ''}` +
      (t.synthEndAt && t.synthStartAt ? ` tts=${t.synthEndAt - t.synthStartAt}ms` : '') +
      (t.firstAudioAt ? ` request→audio=${t.firstAudioAt - t.requestedAt}ms` : ''));
  }
});
const live = new LiveSession(httpRecognizer(RECOGNITION_URL), (m) => {
  broadcast(m);
  // Unreachable today: Live refuses 'automatic' and the speech gate is UNVALIDATED_GATE. Kept so the only path from
  // recognition to voice is the policy-checked one.
  if (m.type === 'recognition_hypothesis' && live.current.mode === 'automatic') speech.speakRecognized(m.hypothesis, live.current);
  if (m.type === 'recognition_hypothesis') speech.prepareReviewed(m.hypothesis); // pre-synthesis only; never plays
});

let liveOwner: WebSocket | null = null;

async function setupRoute(): Promise<void> {
  if (route) return;
  if (process.env.TACIT_ROUTE === 'off') { routeFallback = unconfiguredRoute('Virtual microphone disabled (TACIT_ROUTE=off).'); return; }
  if (process.platform !== 'darwin') { routeFallback = unconfiguredRoute('Virtual microphone output needs macOS.'); return; }
  const bin = routeBinary();
  if (!bin) { routeFallback = unconfiguredRoute('tacit-route is not built: run ./scripts/tacit.sh build'); return; }
  try {
    const { devices } = await listDevices(bin);
    const dev = pickDevice(devices);
    if (!dev) {
      routeFallback = unconfiguredRoute(process.env.TACIT_ROUTE_DEVICE_UID
        ? `Configured TACIT_ROUTE_DEVICE_UID not found.` : 'No BlackHole virtual audio device installed (brew install blackhole-2ch).');
      return;
    }
    route = new RouteHelper(bin, dev, routeGain(dev.uid));
    route.on('status', () => speech.emit('status', speech.status()));
    console.log(`[route] virtual microphone: ${dev.name} (gain ${route.status().gainDb} dB${route.status().calibrated ? '' : ', UNCALIBRATED'})`);
  } catch (e) {
    routeFallback = unconfiguredRoute(`tacit-route failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    speech.emit('status', speech.status());
  }
}
const swept = sweepStaleAudio();
if (swept) console.log(`[route] removed ${swept} stale staged-audio folder(s) from an earlier run`);
void setupRoute();
setInterval(() => {
  if (route?.exhausted) { route.close(); route = null; console.log('[route] replacing a helper that kept failing'); } // fresh restart budget
  if (route) route.refresh(); else void setupRoute();
}, 15_000).unref();
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => route?.close());
process.on('exit', () => route?.close());

let simCall: SimCall | null = null;

async function handleClient(msg: ClientMessage): Promise<unknown> {
  switch (msg.type) {
    case 'candidates_displayed':
      return controller.candidatesDisplayed(msg.candidateSetId, Date.now());
    case 'selection_started':
      return controller.selectionStarted(msg.candidateSetId);
    case 'selection_aborted':
      return controller.selectionAborted(msg.candidateSetId, msg.reason);
    case 'tap_select':
      return controller.directSelect(msg.candidateSetId, msg.index, 'tap');
    case 'head_select':
      return controller.directSelect(msg.candidateSetId, msg.index, 'head');
    case 'mouth_gesture_select':
      if (typeof msg.method !== 'string' || !msg.method) return;
      return controller.gestureSelect(msg.candidateSetId, msg.index, msg.method);
    case 'head_gesture':
      return msg.gesture === 'nod'
        ? controller.confirm({ source: 'nod', proposalId: msg.proposalId })
        : controller.cancel({ source: 'shake' });
    case 'confirm':
      return controller.confirm({ source: msg.source, proposalId: msg.proposalId });
    case 'cancel':
      return controller.cancel({ source: msg.source });
    case 'request_alternatives':
      return controller.requestAlternatives();
    case 'reject_all':
      return controller.rejectAll();
    case 'set_candidate_mode':
      return controller.setCandidateMode(msg.mode);
    case 'set_trial_target':
      return controller.setTrialTarget(msg.index);
    case 'sim_call_start': {
      const call = new SimCall();
      if (controller.attachCall(call)) simCall = call;
      return;
    }
    case 'sim_caller_says':
      return simCall?.say(msg.text);
    case 'sim_call_end':
    case 'hangup':
      simCall = null;
      return controller.hangup();
    case 'set_turn_logging':
      if (msg.mode !== 'off' && msg.mode !== 'timings' && msg.mode !== 'full') return;
      turnLog.setMode(msg.mode);
      console.log(`[turns] logging set to '${msg.mode}' by the user`);
      return controller.setServices({ logging: turnLog.get() });
    case 'set_voice_policy': {
      const patch: { allowSystemFallback?: boolean; personalPresynth?: boolean } = {};
      if (typeof msg.allowSystemFallback === 'boolean') patch.allowSystemFallback = msg.allowSystemFallback;
      if (typeof msg.personalPresynth === 'boolean') patch.personalPresynth = msg.personalPresynth;
      tts.setPolicy(patch);
      console.log(`[tts] voice policy set by the user: ${JSON.stringify(tts.policy)}`);
      return controller.setServices({ voicePolicy: tts.status() });
    }
    case 'output_control':
      if (!['enable', 'pause', 'resume', 'stop'].includes(msg.action)) return;
      console.log(`[speech] voice output ${msg.action} by the user`);
      return speech.control(msg.action);
    case 'speak_typed':
      return speech.speakTyped(msg);
    case 'speak_reviewed': // explicit user pick (or correction) of the latest shown utterance; checks in SpeechOutput
      return speech.speakReviewed(msg, live.current, live.reviewTarget());
    case 'delete_turn_logs':
      await turnLog.deleteAll();
      console.log('[turns] all stored turns deleted by the user');
      return controller.setServices({ logging: turnLog.get() });
  }
}

// ───────────────────────────── HTTP ─────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString();
}

function bearer(req: IncomingMessage, url: URL): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
}

async function twilioWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!TWILIO_AUTH_TOKEN && PUBLIC_URL) {
    console.warn('[twilio] refused: PUBLIC_URL is set but TWILIO_AUTH_TOKEN is not (signatures cannot be verified)');
    res.writeHead(503).end();
    return;
  }
  const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
  const base = PUBLIC_URL ?? `https://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  if (TWILIO_AUTH_TOKEN && !validTwilioSignature(TWILIO_AUTH_TOKEN, `${base}/twilio/voice`, params, req.headers['x-twilio-signature'] as string | undefined)) {
    console.warn('[twilio] rejected webhook with bad signature');
    res.writeHead(403).end();
    return;
  }
  if (!TWILIO_AUTH_TOKEN) console.warn('[twilio] local only: TWILIO_AUTH_TOKEN not set — webhook signature NOT verified');
  res.writeHead(200, { 'content-type': 'text/xml' });
  if (!stt || controller.snapshot().sessionId !== null) {
    res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Say>TACIT is unavailable right now.</Say><Hangup/></Response>');
    return;
  }
  res.end(twiml(`${base.replace(/^http/, 'ws')}/twilio/media`, streamTokens.issue()));
  console.log('[twilio] incoming call accepted by webhook');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/twilio/voice' && req.method === 'POST') return await twilioWebhook(req, res);
    if (url.pathname === '/api/health') {
      const full = auth.disabled || safeEqual(bearer(req, url), auth.secrets.userToken);
      const s = controller.snapshot();
      const body = full
        ? { ok: true, phase: s.phase, services: s.services, tts: tts.label, stt: stt?.label ?? null, geminiModels: gemini?.models ?? null, geminiLastAttempts: gemini?.lastAttempts() ?? null }
        : { ok: true, authRequired: !auth.disabled };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    // Static web build (optional). Contains no secrets.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(WEB_DIST, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(WEB_DIST)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = join(WEB_DIST, 'index.html');
    } catch {
      file = join(WEB_DIST, 'index.html');
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'referrer-policy': 'no-referrer' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('web/dist not built — run the Vite dev server (cd web && npm run dev) or npm run build.');
    }
  } catch (e) {
    console.error('[http] error', e instanceof Error ? e.message : e);
    if (!res.headersSent) res.writeHead(400).end();
  }
});

const uiWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const callerWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const twilioWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/twilio/media') {
    // Authorized by the one-time stream token inside the `start` event (see TwilioCall).
    twilioWss.handleUpgrade(req, socket, head, (ws) => twilioWss.emit('connection', ws));
    return;
  }
  const verdict = authorizeUpgrade(req, auth);
  if (!verdict.ok) {
    console.warn(`[auth] rejected ${path}: ${verdict.reason}`);
    const text = verdict.status === 401 ? 'Unauthorized' : verdict.status === 403 ? 'Forbidden' : 'Not Found';
    socket.end(`HTTP/1.1 ${verdict.status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    return;
  }
  const wss = verdict.role === 'user' ? uiWss : callerWss;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

twilioWss.on('connection', (ws) => {
  if (!stt) return void ws.close();
  const call = new TwilioCall(ws, tts, stt, (token) => streamTokens.consume(token));
  const unauthTimer = setTimeout(() => ws.close(1008, 'no start'), 10_000);
  call.once('unauthorized', () => {
    clearTimeout(unauthTimer);
    console.warn('[twilio] media stream rejected: invalid or reused stream token');
  });
  call.once('authorized', () => {
    clearTimeout(unauthTimer);
    if (controller.snapshot().sessionId !== null || !controller.attachCall(call)) return void call.hangup();
    simCall = null;
    console.log(`[call] Twilio media stream connected (${call.id})`);
  });
});

uiWss.on('connection', (ws) => {
  uiClients.add(ws);
  console.log(`[ui] user client connected (${uiClients.size} open)`);
  ws.send(JSON.stringify({ type: 'snapshot', snapshot: controller.snapshot() } satisfies ServerMessage));
  ws.send(JSON.stringify({ type: 'session_info', callerInvitePath: `/?invite=${auth.secrets.callerToken}#caller`, authRequired: !auth.disabled } satisfies ServerMessage));
  ws.binaryType = 'nodebuffer';
  ws.send(JSON.stringify({ type: 'live_status', status: live.current } satisfies ServerMessage));
  ws.send(JSON.stringify({ type: 'output_status', status: speech.status() } satisfies ServerMessage));
  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) return live.frame(data as Buffer, ws); // JPEG frames of this socket's current visual_utterance
      const msg = JSON.parse(String(data)) as ClientMessage;
      if (msg.type === 'live_control') {
        const before = live.current.authorizationId;
        live.control(msg);
        // The client that activated Live (the one with the camera) owns it: when that socket goes away, Live ends.
        if (msg.action === 'activate' && live.current.authorizationId !== before && live.current.state === 'active') liveOwner = ws;
        if (msg.action === 'end') liveOwner = null;
        // Pausing/stopping Live also silences anything TACIT has not finished saying.
        if (msg.action === 'pause' || msg.action === 'interrupt' || msg.action === 'end') speech.interrupt(`Live ${msg.action === 'end' ? 'ended' : msg.action === 'pause' ? 'paused' : 'interrupted'}.`);
        return;
      }
      if (msg.type === 'visual_utterance') return live.utterance(msg, ws);
      const verdict = (await handleClient(msg)) as { accepted?: boolean; reason?: string } | undefined;
      if (verdict?.accepted === false) console.log(`[ui] ${msg.type} rejected: ${verdict.reason}`);
    } catch (e) {
      console.error('[ui] bad message', e instanceof Error ? e.message : e);
    }
  });
  // Heartbeat: a hung or suspended client must not count as "someone who can pause TACIT".
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const beat = setInterval(() => {
    if (!alive) { console.log('[ui] client missed heartbeat; closing'); return ws.terminate(); }
    alive = false; ws.ping();
  }, 10_000);
  ws.on('close', () => {
    clearInterval(beat);
    uiClients.delete(ws);
    live.disconnect(ws);
    if (liveOwner === ws) { // the capturing client left: nobody is supplying camera input any more
      liveOwner = null;
      if (live.current.state !== 'off') { live.close(); speech.interrupt('Live ended: the capturing client disconnected.'); }
    }
    if (uiClients.size === 0) { // nobody left who could see or pause TACIT: fail safe
      live.close();
      if (speech.status().state !== 'off') speech.control('stop');
    }
  });
});

callerWss.on('connection', (ws) => {
  ws.binaryType = 'nodebuffer';
  if (controller.snapshot().sessionId !== null) {
    ws.send(JSON.stringify({ type: 'rejected', reason: 'TACIT is already on a call' }));
    ws.close();
    return;
  }
  const call = new BrowserCall(ws, tts, stt);
  if (!controller.attachCall(call)) return;
  simCall = null;
  ws.send(JSON.stringify({ type: 'accepted', sessionId: call.id }));
  console.log(`[call] browser caller connected (${call.id})`);
});

// TACIT_HOST=127.0.0.1 keeps the server private to this Mac (the launcher's default); unset = all interfaces (LAN caller tests).
server.listen(PORT, process.env.TACIT_HOST || undefined, () => {
  console.log(`[tacit] server on http://${process.env.TACIT_HOST || 'localhost'}:${PORT}${process.env.TACIT_HOST ? '' : ' (all interfaces)'}`);
  console.log(`[tacit] candidates: ${gemini ? `Gemini ${gemini.models.join(' → ')} (labelled local fallback)` : LOCAL_MODEL} | tts: ${tts.label} | stt: ${stt?.label ?? 'none (no whisper model)'}`);
  console.log(`[tacit] auth: ${auth.disabled ? 'DISABLED (TACIT_AUTH=off, local dev only)' : 'required — run `npm run links` for the user/caller URLs'}`);
  console.log(`[tacit] turn logging: ${turnLog.get().mode} (retention ${turnLog.get().retentionDays} d)`);
  if (PUBLIC_URL) console.log(`[tacit] Twilio webhook: ${PUBLIC_URL}/twilio/voice (signature check ${TWILIO_AUTH_TOKEN ? 'on' : 'MISSING → refused'})`);
});
