/**
 * Security checks against a RUNNING server (npm start). Every case must be rejected/limited.
 *   npm run security:check
 */
import WebSocket from 'ws';
import { secrets } from './secrets.ts';

const http = process.env.TACIT_HTTP ?? 'http://localhost:8790';
const ws = http.replace(/^http/, 'ws');
let failed = 0;
const check = (name: string, pass: boolean, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) failed++;
};

/** Resolves with the HTTP status of a rejected upgrade, or 101 if the socket opened. */
function tryWs(url: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const s = new WebSocket(url, { headers });
    s.on('open', () => {
      s.close();
      resolve(101);
    });
    s.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    s.on('error', () => resolve(-1));
  });
}

check('user channel without token → 401', (await tryWs(`${ws}/ws`)) === 401);
check('user channel with wrong token → 401', (await tryWs(`${ws}/ws?token=nope`)) === 401);
check('caller invite used as user token → 401', (await tryWs(`${ws}/ws?token=${secrets.callerToken}`)) === 401);
check('caller channel without invite → 401', (await tryWs(`${ws}/ws/caller`)) === 401);
check('user token used as caller invite → 401', (await tryWs(`${ws}/ws/caller?invite=${secrets.userToken}`)) === 401);
check('valid token from a foreign Origin → 403', (await tryWs(`${ws}/ws?token=${secrets.userToken}`, { Origin: 'https://evil.example' })) === 403);
check('valid token, same-host Origin → 101', (await tryWs(`${ws}/ws?token=${secrets.userToken}`, { Origin: http })) === 101);
check('unknown WS path → 404', (await tryWs(`${ws}/ws/other?token=${secrets.userToken}`)) === 404);

const h0 = await (await fetch(`${http}/api/health`)).json();
check('health without token reveals no service detail', !('services' in h0), JSON.stringify(h0));
const h1 = await (await fetch(`${http}/api/health`, { headers: { authorization: `Bearer ${secrets.userToken}` } })).json();
check('health with token returns detail', 'services' in h1);

// Twilio media stream with a forged / missing stream token must be closed and never attach a call.
async function twilioStart(token?: string): Promise<{ closedCode: number }> {
  const s = new WebSocket(`${ws}/twilio/media`);
  await new Promise((r) => s.once('open', r));
  const closed = new Promise<number>((r) => s.once('close', (code) => r(code)));
  s.send(JSON.stringify({ event: 'start', streamSid: 'MZx', start: { callSid: 'CAx', customParameters: token ? { token } : {} } }));
  const code = await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(0), 3000))]);
  if (code === 0) s.close();
  return { closedCode: code };
}
check('Twilio media stream without stream token → closed 1008', (await twilioStart()).closedCode === 1008);
check('Twilio media stream with forged stream token → closed 1008', (await twilioStart('forged')).closedCode === 1008);

const ui = new WebSocket(`${ws}/ws?token=${secrets.userToken}`);
const snap = await new Promise<any>((r) => ui.once('message', (d) => r(JSON.parse(String(d)))));
check('no call attached by rejected attempts', snap.snapshot.sessionId === null, `phase=${snap.snapshot.phase}`);
ui.close();

console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL SECURITY CHECKS PASSED');
process.exit(failed ? 1 : 0);
