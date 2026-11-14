/**
 * Real ElevenLabs verification (needs ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in server/.env).
 * Confirms the voice exists and is a cloned voice, then synthesizes one phrase as MP3 and μ-law and reports latency.
 *   npm run voice:check
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioDurationMs, checkElevenLabsVoice, elevenLabs } from '../src/tts.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voiceId, ELEVENLABS_VOICE_CONSENT: consent, ELEVENLABS_BASE_URL: baseUrl, ELEVENLABS_MODEL: modelId } = process.env;
if (!key || !voiceId) {
  console.error('Missing ELEVENLABS_API_KEY and/or ELEVENLABS_VOICE_ID in server/.env');
  process.exit(1);
}
console.log(`consent flag ELEVENLABS_VOICE_CONSENT=self: ${consent === 'self' ? 'set' : 'NOT set (server will use the system voice)'}`);
const check = await checkElevenLabsVoice(key, voiceId, baseUrl);
console.log('voice check:', check);
const el = elevenLabs({ apiKey: key, voiceId, modelId, baseUrl });
for (const fmt of ['file', 'ulaw_8000'] as const) {
  try {
    const r = await el.synth('Yes, Thursday at three works for me.', fmt);
    console.log(`${fmt}: ${r.mime}, ${r.audio.length} bytes, ${Math.round(audioDurationMs(r.audio, r.mime) ?? 0)} ms audio, first byte ${r.firstByteTs - r.requestTs} ms`);
  } catch (e) {
    console.log(`${fmt}: ERROR ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(check.ok && check.personal ? 0 : 1);
