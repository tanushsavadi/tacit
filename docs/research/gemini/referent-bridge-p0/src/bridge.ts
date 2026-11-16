import { randomUUID } from 'node:crypto';
import { contextSchema, type Context, type CheckedResolution, type Model, type Position, type Reference } from './contracts.ts';
import { fingerprint, hash, validateResolution } from './references.ts';

export type Outcome = { state: 'ready'; resolution: CheckedResolution } | { state: 'cancelled' | 'stale' | 'failed'; reason: string };
export interface Draft { text: string; hash: string; reference: Reference; userPoint: string; contextFingerprint: string; version: number }
export interface ApprovedText { kind: 'approved-research-text-only'; text: string; hash: string; approvedAt: string; reference: Reference }

export class Bridge {
  private context: Context;
  private epoch = 0;
  private active: { id: string; abort: AbortController } | null = null;
  private shown: CheckedResolution | null = null;
  private selected: string | null = null;
  private position: Position | null = null;
  private draft: Draft | null = null;
  private consumed = false;
  constructor(context: Context) { this.context = structuredClone(contextSchema.parse(context)); }
  get snapshot() { return structuredClone({ context: this.context, epoch: this.epoch, resolution: this.shown, selected: this.selected, position: this.position, draft: this.draft }); }
  setContext(c: Context): void {
    const next = contextSchema.parse(c);
    if (next.revision <= this.context.revision) throw new Error('Context revision must increase');
    this.invalidate(); this.context = structuredClone(next);
  }
  cancel(): void { this.invalidate(); }
  private invalidate(): void {
    this.active?.abort.abort(); this.active = null; this.epoch++;
    this.shown = null; this.selected = null; this.position = null; this.draft = null; this.consumed = false;
  }
  async resolve(model: Model, timeoutMs = 5000): Promise<Outcome> {
    this.invalidate();
    const epoch = this.epoch; const context = structuredClone(this.context);
    const a = { id: randomUUID(), abort: new AbortController() }; this.active = a;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; a.abort.abort(); reject(new Error('Model deadline exceeded')); }, timeoutMs);
    });
    const cancelled = new Promise<never>((_, reject) => {
      a.abort.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
    });
    try {
      const output = await Promise.race([model({ context: structuredClone(context) }, a.abort.signal), timeout, cancelled]);
      if (epoch !== this.epoch || this.active !== a) return { state: 'stale', reason: 'Superseded context or request' };
      this.shown = validateResolution(output, context);
      return { state: 'ready', resolution: structuredClone(this.shown) };
    } catch (e) {
      if (epoch !== this.epoch || this.active !== a) return { state: 'cancelled', reason: 'Request cancelled or superseded' };
      return { state: 'failed', reason: timedOut ? 'Model deadline exceeded' : e instanceof Error ? e.message : 'Invalid model result' };
    } finally { clearTimeout(timer); if (this.active === a) this.active = null; }
  }
  select(id: string): void {
    if (!this.shown?.references.some(r => r.id === id)) throw new Error('Explicit selection must be one of the displayed references');
    this.selected = id; this.draft = null; this.consumed = false;
  }
  author(position: Position): void {
    if (!['share_view', 'disagree', 'phrase_this'].includes(position.intent)) throw new Error('Invalid user-authored intention');
    if (!position.point.trim() || position.point.length > 500 || /[\u0000-\u001f\u007f]/.test(position.point)) throw new Error('A nonempty plain-text user point of at most 500 characters is required');
    this.position = structuredClone(position); this.draft = null; this.consumed = false;
  }
  compose(): Draft {
    const r = this.shown?.references.find(r => r.id === this.selected);
    if (!r || !this.position) throw new Error('Select a reference and author your own position first');
    const point = this.position.point;
    const text = this.shown?.layout === 'point-first' ? `${point} (Regarding: ${r.quote})` : `Regarding ${r.quote}: ${point}`;
    this.draft = { text, hash: hash(text), reference: structuredClone(r), userPoint: point, contextFingerprint: fingerprint(this.context), version: this.epoch };
    this.consumed = false;
    return structuredClone(this.draft);
  }
  approve(expectedHash: string): ApprovedText {
    const d = this.draft;
    if (!d || d.hash !== expectedHash || hash(d.text) !== d.hash || d.version !== this.epoch || d.contextFingerprint !== fingerprint(this.context)) throw new Error('Stale or changed draft; review again');
    if (this.consumed) throw new Error('Already approved; no duplicate artifact');
    this.consumed = true;
    return { kind: 'approved-research-text-only', text: d.text, hash: d.hash, approvedAt: new Date().toISOString(), reference: structuredClone(d.reference) };
  }
}
