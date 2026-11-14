/**
 * Reply-candidate generation. Returns exactly 3 options with distinct intents.
 *  - Gemini (structured JSON output) when GEMINI_API_KEY is set.
 *  - Otherwise a deterministic local rule set, labelled `local-rules (no LLM)` everywhere it surfaces.
 */
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { CandidateOption, TranscriptEntry } from '../../shared/protocol.ts';
import type { CandidateGenerator, GeneratedCandidates } from './controller.ts';

export const LOCAL_MODEL = 'local-rules (no LLM)';

// ───────────────────────────── local fallback ─────────────────────────────

type Intent = { intent: string; phrasings: string[] };

const YES_NO = /^(are|is|am|do|does|did|can|could|will|would|should|have|has|had|was|were|shall|may|might|want)\b/i;

function localIntents(callerText: string): Intent[] {
  const t = callerText.trim().toLowerCase();
  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.split(/\s+/).length <= 6) {
    return [
      { intent: 'greet', phrasings: ['Hi! Good to hear from you.', 'Hello there.'] },
      { intent: 'ask-why', phrasings: ['Hi, what can I do for you?', 'Hey, what’s up?'] },
      { intent: 'busy', phrasings: ['Hi, can I call you back later?', 'Hey, now isn’t a great time.'] },
    ];
  }
  if (/\bhow are you\b|\bhow('s| is) it going\b/.test(t)) {
    return [
      { intent: 'positive', phrasings: ['I’m doing well, thanks for asking.', 'Pretty good, thanks.'] },
      { intent: 'so-so', phrasings: ['Honestly, it’s been a long day.', 'Could be better.'] },
      { intent: 'return', phrasings: ['Good, and how about you?', 'Fine. How are you?'] },
    ];
  }
  if (t.endsWith('?') && YES_NO.test(t)) {
    return [
      { intent: 'yes', phrasings: ['Yes, that works for me.', 'Yes.'] },
      { intent: 'no', phrasings: ['No, I don’t think so.', 'No, thank you.'] },
      { intent: 'unsure', phrasings: ['Let me think about it and get back to you.', 'I’m not sure yet.'] },
    ];
  }
  if (/^(when|what time)\b/.test(t)) {
    return [
      { intent: 'soon', phrasings: ['As soon as possible, please.', 'Today if you can.'] },
      { intent: 'later', phrasings: ['Later this week is better for me.', 'Maybe next week.'] },
      { intent: 'ask-options', phrasings: ['What times do you have available?', 'When works for you?'] },
    ];
  }
  if (/^(what|which|who|where|why|how)\b/.test(t)) {
    return [
      { intent: 'answer-later', phrasings: ['Let me check and send it to you by text.', 'I’ll get back to you on that.'] },
      { intent: 'clarify', phrasings: ['Sorry, could you say that another way?', 'Can you repeat that?'] },
      { intent: 'defer', phrasings: ['I’m not sure. What do you suggest?', 'What would you recommend?'] },
    ];
  }
  return [
    { intent: 'agree', phrasings: ['That sounds good to me.', 'Okay, sounds good.'] },
    { intent: 'clarify', phrasings: ['Sorry, could you say that another way?', 'Can you repeat that?'] },
    { intent: 'decline', phrasings: ['I’d rather not, thank you.', 'No thanks.'] },
  ];
}

export const localGenerator: CandidateGenerator = async ({ transcript, avoid, round }) => {
  const start = Date.now();
  const lastCaller = [...transcript].reverse().find((e) => e.role === 'caller')?.text ?? '';
  const avoidSet = new Set(avoid);
  const options: CandidateOption[] = localIntents(lastCaller).map((it, index) => {
    // On "alternatives", rotate to the next phrasing not already shown.
    const order = it.phrasings.map((_, i) => (i + round) % it.phrasings.length);
    const pick = order.find((i) => !avoidSet.has(it.phrasings[i]!)) ?? order[0]!;
    return { index, text: it.phrasings[pick]!, intent: it.intent, phrasingIndex: pick };
  });
  return { options, mode: 'baseline', distinguishability: null, model: LOCAL_MODEL, generationMs: Date.now() - start };
};

// ───────────────────────────── Gemini ─────────────────────────────

const SCHEMA = {
  type: 'object',
  properties: {
    intents: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          intent: { type: 'string', description: '2-3 word label of the meaning, e.g. "agree", "ask time".' },
          phrasings: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
        },
        required: ['intent', 'phrasings'],
      },
    },
  },
  required: ['intents'],
} as const;

const SYSTEM = `You write reply options for TACIT, a phone-call assistant for a person who cannot speak aloud.
The user picks one option and it is spoken in their voice to the caller.
Return exactly 3 intents that are meaningfully DIFFERENT (e.g. accept / decline / ask a question), each with
up to 3 phrasings. Phrasings: first person, natural spoken English, 2-12 words, no emoji, no stage directions,
never invent personal facts (names, addresses, numbers) the transcript does not contain.`;

function formatTranscript(transcript: TranscriptEntry[]): string {
  return transcript
    .slice(-12)
    .map((e) => `${e.role === 'caller' ? 'Caller' : 'User'}: ${e.text}`)
    .join('\n');
}

const GENERATION_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 5_000);
/**
 * Tried in order. Default measured 2026-11-14: 3.5-flash-lite 0.9–1.5 s, 3.5-flash 1.3–1.7 s;
 * 3.8-flash timed out / 503 "high demand"; 2.5-flash 404 for new users. Override with GEMINI_MODEL(S).
 */
export const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

export interface GeminiAttempt {
  model: string;
  ms: number;
  error?: string;
}

export function geminiGenerator(
  apiKey: string,
  models: string[] = DEFAULT_GEMINI_MODELS,
): { generate: CandidateGenerator; models: string[]; lastAttempts: () => GeminiAttempt[] } {
  const ai = new GoogleGenAI({ apiKey });
  let attempts: GeminiAttempt[] = [];

  // Short replies need no deliberation; thinking adds seconds of latency.
  const lowThinking = new Set<string>();
  const thinking = (m: string) =>
    /^gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: lowThinking.has(m) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };

  async function once(m: string, prompt: string): Promise<CandidateOption[]> {
    const call = () =>
      ai.models.generateContent({
        model: m,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: SCHEMA,
          temperature: 0.7,
          abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
          thinkingConfig: thinking(m),
        },
      });
    let res;
    try {
      res = await call();
    } catch (e) {
      // Some models reject MINIMAL; remember and retry once with LOW.
      if (!/thinking level/i.test(String(e)) || lowThinking.has(m)) throw e;
      lowThinking.add(m);
      res = await call();
    }
    const parsed = JSON.parse(res.text ?? '{}') as { intents?: Intent[] };
    const intents = (parsed.intents ?? []).filter((i) => i.phrasings?.length).slice(0, 3);
    if (intents.length < 3) throw new Error(`returned ${intents.length} usable intents`);
    return intents.map((it, index) => ({ index, text: it.phrasings[0]!.trim(), intent: it.intent, phrasingIndex: 0 }));
  }

  const generate: CandidateGenerator = async ({ transcript, avoid }) => {
    const start = Date.now();
    attempts = [];
    const prompt =
      `Conversation so far:\n${formatTranscript(transcript)}\n\nWrite reply options for the User's next turn.` +
      (avoid.length ? `\nThe user rejected these; offer different ones:\n- ${avoid.join('\n- ')}` : '');
    for (const m of models) {
      const t0 = Date.now();
      try {
        const options = await once(m, prompt);
        attempts.push({ model: m, ms: Date.now() - t0 });
        const out: GeneratedCandidates = { options, mode: 'baseline', distinguishability: null, model: m, generationMs: Date.now() - start };
        return out;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160);
        attempts.push({ model: m, ms: Date.now() - t0, error: msg });
        console.warn(`[gemini] ${m} failed after ${Date.now() - t0} ms: ${msg}`);
      }
    }
    throw new Error(`all Gemini models failed (${attempts.map((a) => `${a.model}: ${a.error}`).join('; ')})`);
  };

  return { generate, models, lastAttempts: () => attempts };
}

/**
 * Gemini with an explicitly labelled local fallback. When every Gemini model fails, the candidate set's
 * `model` reads `local-rules (no LLM) — Gemini unavailable: <reason>` so the UI can never present it as LLM output.
 */
export function withLabelledFallback(primary: CandidateGenerator): CandidateGenerator {
  return async (req) => {
    const start = Date.now();
    try {
      return await primary(req);
    } catch (e) {
      const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ');
      const short = /503|high demand|UNAVAILABLE/i.test(reason) ? 'overloaded (503)' : /abort|timeout/i.test(reason) ? 'timeout' : reason.slice(0, 60);
      const local = await localGenerator(req);
      return { ...local, model: `${LOCAL_MODEL} — Gemini unavailable: ${short}`, generationMs: Date.now() - start };
    }
  };
}
