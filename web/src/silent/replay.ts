export interface ReplayLabel { startMs: number; endMs: number; text?: string; kind: 'silent' | 'voiced' | 'non-speech' }
export interface ReplayPlan { url: string; rate: number; dropEvery: number; interruptions: { startMs: number; endMs: number }[] }
export function parseReplayLabels(value: unknown): ReplayLabel[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Labels must be an array of at most 1000 intervals.');
  let last = -1;
  return value.map((v: ReplayLabel) => {
    if (!v || !Number.isFinite(v.startMs) || !Number.isFinite(v.endMs) || v.startMs < 0 || v.startMs < last || v.endMs <= v.startMs || !['silent', 'voiced', 'non-speech'].includes(v.kind) || (v.text !== undefined && typeof v.text !== 'string')) throw new Error('Use ordered, non-overlapping {startMs, endMs, kind, text?} intervals.');
    last = v.endMs;
    return { startMs: v.startMs, endMs: v.endMs, kind: v.kind, ...(v.text === undefined ? {} : { text: v.text }) };
  });
}
export function replayFault(plan: ReplayPlan, index: number, mediaTimeMs: number): 'drop' | 'tracking-interruption' | null {
  if (plan.interruptions.some(i => mediaTimeMs >= i.startMs && mediaTimeMs < i.endMs)) return 'tracking-interruption';
  return plan.dropEvery > 0 && index % plan.dropEvery === 0 ? 'drop' : null;
}
/** One-to-one boundary matches. This measures segmentation only, never recognition accuracy. */
export function evaluateBoundaries(labels: ReplayLabel[], windows: { startMs: number; endMs: number; endpointMs: number }[]) {
  const speech = labels.filter(l => l.kind !== 'non-speech');
  const used = new Set<number>();
  const matches = speech.map(label => {
    let best = -1, overlap = 0;
    windows.forEach((w, i) => {
      if (used.has(i)) return;
      const intersection = Math.max(0, Math.min(label.endMs, w.endMs) - Math.max(label.startMs, w.startMs));
      const iou = intersection / (Math.max(label.endMs, w.endMs) - Math.min(label.startMs, w.startMs));
      if (iou > overlap) { best = i; overlap = iou; }
    });
    if (best < 0) return { label, matched: false as const };
    used.add(best); const w = windows[best]!;
    return { label, matched: true as const, iou: overlap, onsetErrorMs: w.startMs - label.startMs, offsetErrorMs: w.endMs - label.endMs, endpointMs: w.endpointMs };
  });
  return { matches, missed: matches.filter(m => !m.matched).length, unmatchedWindows: windows.length - used.size,
    nonSpeechWindows: windows.filter(w => labels.some(l => l.kind === 'non-speech' && Math.min(w.endMs, l.endMs) > Math.max(w.startMs, l.startMs))).length };
}
