/**
 * Verifies real Gemini candidate generation (never falls back). Prints the resolved model, per-request
 * latency, the 3 options, and any error. Reads GEMINI_API_KEY / GEMINI_MODEL from server/.env.
 *   npm run gemini:probe
 */
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TranscriptEntry } from '../../shared/protocol.ts';
import { DEFAULT_GEMINI_MODELS, geminiGenerator } from '../src/candidates.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set in server/.env');
  process.exit(1);
}

const cases: string[][] = [
  ['Hi, this is the dentist office. Can you come in on Thursday at three?'],
  ['Hey, it’s Sam. Are we still on for dinner tonight?'],
  ['Hello, I’m calling from the pharmacy about your prescription refill. Would you like it delivered or will you pick it up?'],
];

// Compare models: GEMINI_MODELS=a,b npm run gemini:probe  (default: GEMINI_MODEL or auto-resolved)
const models = process.env.GEMINI_MODELS?.split(',') ?? (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_GEMINI_MODELS);
let failures = 0;
for (const modelId of models) {
const g = geminiGenerator(key, [modelId!]); // one model per run: no chain, no fallback
console.log(`\n=== ${modelId} ===`);
for (const lines of cases) {
  const transcript: TranscriptEntry[] = lines.map((text, i) => ({ role: 'caller', text, ts: Date.now() + i }));
  const t0 = Date.now();
  try {
    const out = await g.generate({ transcript, mode: 'baseline', avoid: [], round: 0 });
    console.log(`\nCaller: ${lines.at(-1)}\n  model=${out.model} generationMs=${out.generationMs} wallMs=${Date.now() - t0}`);
    for (const o of out.options) console.log(`  [${o.index}] ${o.text}  (${o.intent})`);
  } catch (e) {
    failures++;
    console.log(`\nCaller: ${lines.at(-1)}\n  ERROR after ${Date.now() - t0} ms: ${e instanceof Error ? e.message : String(e)}`);
  }
}
}
console.log(`\nfailures: ${failures}/${cases.length * models.length}`);
process.exit(failures ? 1 : 0);

