/** Session RAM only. This module has no speech, filesystem or model capability. */
import { randomUUID } from 'node:crypto';
export interface Citation { turnId: string; revision: number; start: number; end: number; quote: string }
export interface Turn { id: string; revision: number; order: number; text: string; final: boolean; at: number }
export interface Anchor { id: string; source: Citation; selected: boolean }
export type Relation = 'correction' | 'condition' | 'continuation' | 'clarification' | 'different-question' | 'topic-change' | 'ambiguous';
export interface Change { id: string; relation: Relation; before: Citation; after: Citation; detailBefore: string; detailAfter: string }
export interface Draft { id: string; text: string; version: number; anchor: Citation | null; startedAtRevision: number; saved: boolean; authorship: 'typed' | 'user-corrected'; acknowledged: string[] }
export interface FlowSnapshot {
  epoch: number; revision: number; state: 'off' | 'armed' | 'capturing' | 'paused';
  source: string | null; textConsent: boolean; turns: Turn[]; anchors: Anchor[]; changes: Change[]; drafts: Draft[];
  status: string; semantic: string;
}
export class FlowState {
  epoch = 0; revision = 0; state: FlowSnapshot['state'] = 'off'; source: string | null = null;
  textConsent = false; turns: Turn[] = []; anchors: Anchor[] = []; changes: Change[] = []; drafts: Draft[] = [];
  status = 'Flow is off.'; semantic = 'Off'; private order = 0;
  constructor(private now = Date.now) {}
  start(participantsAgreed: boolean, textConsent: boolean) {
    if (!participantsAgreed) throw new Error('Participant agreement is required.');
    if (this.state !== 'off' && this.state !== 'paused') throw new Error('Pause or stop before choosing a new meeting.');
    const saved = this.state === 'paused' ? this.drafts : [];
    this.stop(); this.drafts = saved; this.state = 'armed'; this.textConsent = textConsent;
    this.status = 'Choose the Meet tab in the TACIT Flow extension. Audio stays on this Mac.';
  }
  attachSource(label: string) {
    if (this.state !== 'armed' || label !== 'Selected Google Meet tab') throw new Error('Choose a new source deliberately.');
    this.source = label; this.state = 'capturing'; this.status = 'Listening to selected Meet tab · local transcription';
  }
  pause() {
    if (this.state === 'off') return;
    this.epoch++; this.state = 'paused'; this.source = null; this.textConsent = false;
    this.clearContext(); this.status = 'Paused. Drafts kept; choose and consent again to resume.';
  }
  stop() {
    this.epoch++; this.state = 'off'; this.source = null; this.textConsent = false;
    this.clearContext(); this.drafts = []; this.semantic = 'Off'; this.status = 'Flow is off. Context and drafts cleared.';
  }
  clearContext() { this.revision++; this.turns = []; this.anchors = []; this.changes = []; }
  transcript(id: string, revision: number, text: string, final: boolean): Turn | null {
    if (this.state !== 'capturing' || !/^[a-zA-Z0-9-]{1,90}$/.test(id) || !Number.isSafeInteger(revision) || revision < 1 || !text.trim() || text.length > 2000) return null;
    const prior = this.turns.find(t => t.id === id);
    if (prior && (revision <= prior.revision || (prior.final && !final))) return null;
    const turn: Turn = { id, revision, text, final, at: this.now(), order: prior?.order ?? ++this.order };
    this.turns = [...this.turns.filter(t => t.id !== id), turn].sort((a,b) => a.order-b.order).slice(-24);
    this.revision++;
    this.anchors = this.anchors.filter(a => this.valid(a.source));
    this.changes = this.changes.filter(c => this.valid(c.before) && this.valid(c.after));
    // Draft anchors are immutable snapshots, even after source revision/eviction. Never retarget them.
    return turn;
  }
  valid(c: Citation): boolean {
    const t = this.turns.find(t => t.id === c.turnId && t.revision === c.revision && t.final);
    return !!t && Number.isSafeInteger(c.start) && Number.isSafeInteger(c.end) && c.start >= 0 && c.end > c.start
      && c.end <= t.text.length && c.quote.length <= 500 && t.text.slice(c.start,c.end) === c.quote;
  }
  select(source: Citation): Draft {
    if (this.state !== 'capturing' || !this.valid(source)) throw new Error('That source is no longer current.');
    if (this.drafts.length >= 3) throw new Error('Three turns are saved. Resume or discard one first.');
    this.anchors.forEach(a => { a.selected = same(a.source,source); });
    const d: Draft = { id: randomUUID(), text: '', version: 1, anchor: structuredClone(source), startedAtRevision: this.revision, saved: false, authorship: 'typed', acknowledged: [] };
    this.drafts.push(d); return d;
  }
  edit(id: string, version: number, text: string) {
    const d = this.drafts.find(d => d.id === id);
    if (!d || d.version !== version || typeof text !== 'string' || text.length > 500) throw new Error('Draft changed. Keep your local text and reload.');
    d.text = text; d.version++; // Model results can never write here.
  }
  save(id: string) { const d = this.drafts.find(d => d.id === id); if (d) d.saved = true; }
  discard(id: string) { this.drafts = this.drafts.filter(d => d.id !== id); }
  acknowledge(id: string, change: string) {
    const d = this.drafts.find(d => d.id === id);
    if (d && this.changes.some(c => c.id === change) && !d.acknowledged.includes(change)) d.acknowledged.push(change);
  }
  relevant(d: Draft) {
    return this.changes.filter(c => ['correction','condition','ambiguous'].includes(c.relation) && d.anchor && same(c.before,d.anchor) && !d.acknowledged.includes(c.id));
  }
  snapshot(): FlowSnapshot { return structuredClone({ epoch:this.epoch, revision:this.revision, state:this.state, source:this.source, textConsent:this.textConsent,
    turns:this.turns, anchors:this.anchors, changes:this.changes, drafts:this.drafts, status:this.status, semantic:this.semantic }); }
}
export function same(a: Citation,b: Citation) { return a.turnId === b.turnId && a.revision === b.revision && a.start === b.start && a.end === b.end; }
