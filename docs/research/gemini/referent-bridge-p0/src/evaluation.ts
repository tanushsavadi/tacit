import { chips } from './references.ts';
import type { Case } from './cases.ts';
import type { CheckedResolution, Reference } from './contracts.ts';

export function matches(actual: Pick<Reference,'turnId'|'quote'>, expected: {turnId:string;quote:string}, c: Case): boolean {
  if (actual.turnId !== expected.turnId || !actual.quote.includes(expected.quote)) return false;
  const otherTimes = chips({revision:1,turns:[c.context.turns.find(t=>t.id===actual.turnId)!]}).references.filter(r=>!expected.quote.includes(r.quote));
  return !otherTimes.some(r=>actual.quote.includes(r.quote));
}
export function scoreReferences(c: Case, r: Pick<CheckedResolution,'state'|'references'>) {
  const coverage=c.expected.references.filter(e=>r.references.some(a=>matches(a,e,c))).length;
  const unsupported=r.references.filter(a=>!c.expected.references.some(e=>matches(a,e,c))).length;
  const ambiguity=c.expected.state==='ambiguous' ? r.state==='ambiguous' && coverage===c.expected.references.length : true;
  const abstained=['unresolved','abstain'].includes(r.state);
  return { correct:coverage===c.expected.references.length && unsupported===0 && ambiguity,
    coverage, expected:c.expected.references.length, unsupported, ambiguityPreserved:ambiguity, abstained,
    safeAmbiguityAbstention:c.expected.state==='ambiguous' && abstained };
}
export function scoreWording(c: Case, text: string) {
  const lower=text.toLowerCase();
  const wantsNo=c.position.intent==='disagree';
  const affirmative=/\b(?:yes|i agree|works for me|happy to|i can make)\b/i.test(text);
  const negative=/\b(?:no|not|don't|do not|disagree|cannot|can't)\b/i.test(text);
  const stance=wantsNo ? negative && !affirmative : /\bcheck my calendar\b/i.test(c.position.point) ? /check|unsure|not sure|confirm|think/i.test(text) && !affirmative : true;
  const needsFive=c.position.point.includes('leave by five');
  const condition=needsFive ? /(?:leave|finish|end|go|gone)[^.]{0,50}(?:by|before)[^.]{0,15}(?:five|5)\b/i.test(text) : null;
  const selectedMention=c.selected ? lower.includes(c.selected.quote.toLowerCase()) : false;
  return { stance, condition, explicitSelectedReference:selectedMention,
    exactPointPreserved:text.includes(c.position.point),
    note:'Narrow deterministic diagnostic, not a general semantic-equivalence judge. Inspect every real response.' };
}

export interface Action { event: string; inserted: string }
export function effort(c: Case, method: 'hmr'|'chips'|'bridge', resolutionAvailable: boolean) {
  const context=c.context.turns.map(t=>`[${t.id}] ${t.text}`).join('\n');
  const steps: Action[]=[{event:'paste_context',inserted:context}];
  if(method==='bridge') steps.push({event:'request_references',inserted:''});
  if(method!=='hmr') steps.push(resolutionAvailable ? {event:'select_reference',inserted:''} : {event:'enter_reference_manually',inserted:c.selected?.quote??''});
  steps.push({event:'choose_intent',inserted:''},{event:'enter_own_point',inserted:c.position.point},
    {event:method==='hmr'?'request_wording':'compose',inserted:''},{event:'review_entire_text',inserted:''},{event:'approve_text_only',inserted:''});
  return { steps, actions:steps.length, insertedCharacters:steps.reduce((n,s)=>n+s.inserted.length,0),
    nonContextCharacters:steps.filter(s=>s.event!=='paste_context').reduce((n,s)=>n+s.inserted.length,0),
    oneKeyPerCharacterProxy:steps.filter(s=>s.event!=='paste_context').reduce((n,s)=>n+s.inserted.length,0),
    commonPasteCharacters:context.length,
    assumption:'Scripted minimum paths; characters are not measured physical keystrokes. HMR gets optimistic zero correction cost. Reading, pointer travel, paste shortcuts, assistive input, review time and errors are unmeasured.' };
}
