/**
 * Readiness check for a REAL Twilio call. Read-only: opens no tunnel, places no call, prints no secrets.
 *   npm run twilio:preflight
 */
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const e = process.env;
let blockers = 0;
const row = (ok: boolean, what: string, fix = '') => {
  console.log(`${ok ? ' OK ' : 'TODO'}  ${what}${!ok && fix ? `\n        → ${fix}` : ''}`);
  if (!ok) blockers++;
};
const has = (bin: string) => {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

row(!!e.TWILIO_AUTH_TOKEN, 'TWILIO_AUTH_TOKEN set (webhook signature verification)', 'add it to server/.env (Twilio console → Account → API keys & tokens)');
row(e.TACIT_AUTH !== 'off', 'browser channel auth enabled (TACIT_AUTH is not off)');
row(!!e.PUBLIC_URL && e.PUBLIC_URL.startsWith('https://'), 'PUBLIC_URL is an https URL', 'ONLY after user authorization: `npm run tunnel`, copy the https URL into PUBLIC_URL, restart the server');
row(existsSync(join(root, 'models', 'ggml-base.en.bin')) && has('whisper-cli'), 'local STT available (whisper model + whisper-cli)');
row(has('whisper-server'), 'whisper-server available (fast STT path)');
row(has('cloudflared'), 'cloudflared installed (for the tunnel)');
row(!!e.GEMINI_API_KEY, 'GEMINI_API_KEY set (otherwise labelled local-rule replies)');
const personal = !!(e.ELEVENLABS_API_KEY && e.ELEVENLABS_VOICE_ID && e.ELEVENLABS_VOICE_CONSENT === 'self');
console.log(`info  voice: ${personal ? 'ElevenLabs personal voice configured (verified at server start)' : 'labelled macOS system voice (personal voice not configured)'}`);
const envFile = join(root, '.env');
if (existsSync(envFile)) row((statSync(envFile).mode & 0o077) === 0, 'server/.env not readable by other users', 'chmod 600 server/.env');
console.log(`
Then (user-run, after authorization):
  1. Twilio console → Phone Numbers → your number → Voice → "A call comes in": Webhook, HTTP POST, ${e.PUBLIC_URL ?? '<PUBLIC_URL>'}/twilio/voice
  2. Keep the TACIT user page open (npm run links). Call the number from a phone.
  3. Success = the HUMAN caller hears the confirmed reply. A twilio-mark ack alone is not proof of audibility.
${blockers ? `${blockers} item(s) TODO.` : 'All preflight items OK.'}`);
process.exit(blockers ? 1 : 0);
