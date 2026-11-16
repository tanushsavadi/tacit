import { createHash } from 'node:crypto';
import { contextSchema, resolutionSchema, type Context, type CheckedResolution, type Reference } from './contracts.ts';

export const CORRECTION = /\b(?:actually|correction|instead|scratch that|not .{0,40}but|i meant|make that)\b/i;
const INSTRUCTION = /\b(?:ignore.{0,25}(?:instructions|rules)|system prompt|trigger speech|speak now|send automatically)\b/i;
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function fingerprint(c: Context): string { return hash(JSON.stringify(c)); }
export function correctionBoundary(c: Context): number {
  return c.turns.reduce((last, t, i) => CORRECTION.test(t.text) ? i : last, 0);
}
export function reference(c: Context, turnId: string, quote: string): Reference {
  const t = c.turns.find(t => t.id === turnId);
  if (!t) throw new Error('Unknown source turn');
  const start = t.text.indexOf(quote);
  if (start < 0) throw new Error('Quote is not exact source text');
  if (t.text.indexOf(quote, start + 1) >= 0) throw new Error('Quote occurs more than once; use a longer unique span');
  return { id: hash(`${turnId}\0${start}\0${quote}`).slice(0, 20), turnId, start, end: start + quote.length, quote };
}

export function validateResolution(input: unknown, context: Context): CheckedResolution {
  contextSchema.parse(context);
  const r = resolutionSchema.parse(input);
  if (r.state === 'resolved' && r.references.length !== 1) throw new Error('Resolved must have exactly one proposed reference');
  if (r.state === 'ambiguous' && r.references.length < 2) throw new Error('Ambiguous must have at least two references');
  if (['unresolved', 'abstain'].includes(r.state) && r.references.length) throw new Error('Abstention must have no references');
  const barrier = correctionBoundary(context);
  const refs = r.references.map(q => {
    const i = context.turns.findIndex(t => t.id === q.turnId);
    if (i < barrier) throw new Error('Reference predates a correction; resolve again');
    const ref = reference(context, q.turnId, q.quote);
    if (INSTRUCTION.test(q.quote)) throw new Error('Instruction-like text is not accepted as a reference');
    return ref;
  });
  if (new Set(refs.map(r => r.id)).size !== refs.length) throw new Error('Duplicate references');
  return { state: r.state, references: refs, layout: r.layout,
    warnings: ['Exact source quotation verified; semantic relevance and completeness are not guaranteed.',
      ...(barrier ? ['Conservative correction barrier: all earlier references are unavailable.'] : [])] };
}

export interface ChipResult { state: 'resolved' | 'ambiguous' | 'unresolved'; references: Reference[]; reason: string }
export function chips(context: Context): ChipResult {
  contextSchema.parse(context);
  const barrier = correctionBoundary(context);
  const groups: Reference[][] = [];
  for (const t of context.turns.slice(barrier)) {
    const refs: Reference[] = [];
    const re = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (?:[1-9]|1[0-2])(?::[0-5]\d)?(?: ?(?:am|pm))?\b/gi;
    for (const m of t.text.matchAll(re)) {
      try { refs.push(reference(context, t.id, m[0])); } catch { /* repeated identical chips require manual context inspection */ }
    }
    if (!refs.length && CORRECTION.test(t.text)) {
      for (const m of t.text.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)) {
        try { refs.push(reference(context,t.id,m[0])); } catch { /* unresolved repeated day */ }
      }
    }
    if (refs.length) groups.push(refs);
  }
  const last = context.turns.at(-1)?.text.toLowerCase() ?? '';
  let refs = groups.flat();
  if (/\b(later|earlier) (?:one|slot|option)\b/.test(last)) {
    refs = groups.map(g => {
      const sorted = [...g].sort((a,b) => hour(a.quote) - hour(b.quote));
      return /\blater\b/.test(last) ? sorted.at(-1)! : sorted[0]!;
    });
  }
  const state = refs.length === 0 ? 'unresolved' : refs.length === 1 ? 'resolved' : 'ambiguous';
  return { state, references: refs, reason: 'Weekday/time regex plus correction-day fallback; earlier/later compared within each source turn. No cross-turn coreference or time-zone inference.' };
}
function hour(s: string): number {
  const m = /at (\d+)(?::(\d+))? ?(am|pm)?/i.exec(s)!;
  const h = Number(m[1]); const meridian = m[3]?.toLowerCase();
  return (meridian ? h % 12 + (meridian === 'pm' ? 12 : 0) : h) * 60 + Number(m[2] ?? 0);
}
