import React from 'react';
import { C, Kicker } from './kit';
import { Film, Fx, Scene, VO } from './film';
import {
  ArchitectureScene, Capture, ColdOpen, Context, EndCard, FullClip, Honest, LogoReveal, NotchReveal, ORIGIN, Question,
  Recognition, ResultsBoard, SpeakingWithDelivery,
} from './scenes';
import { CREDITS } from './devpost';

export const DIRECTOR_SECONDS = 220;
const ui = (k: string, t: string): [string, string] => [k, t];
const RENDER = ui('INTERFACE RENDER', 'offline fixture of the app’s own view · not live');

// Verbatim offline-evaluator hypotheses on the founder's silent clips (recognition/data/eval/paired/*/results.json).
const MIXED = [
  { ref: 'PLEASE TURN ON THE LIGHTS', hyp: 'PLEASE TURN ON THE LIGHTS', ok: true },
  { ref: 'I WOULD LIKE SOME WATER PLEASE', hyp: 'I WOULD LIKE SOME WATER PLEASE', ok: true },
  { ref: 'PLEASE TURN ON THE LIGHTS', hyp: 'BUT THEY ARE ALL LIES', ok: false },
  { ref: 'SEE YOU TOMORROW MORNING', hyp: 'THE NEW MORAL PARTY', ok: false },
  { ref: 'WE WATCHED FIVE FILMS ON FRIDAY', hyp: 'WE WATCHED FIVE FILMS ON FRIDAY', ok: true },
];

export const directorScenes: Scene[] = [
  { name: 'cold open', at: 0, dur: 11.8, el: <ColdOpen dur={11.8} lines={[{ at: 2.0, text: 'No sound.' }, { at: 3.6, text: 'Every word, still formed.' }]} /> },
  { name: 'context', at: 11.6, dur: 16.8, el: <Context dur={16.8} kicker="After a total laryngectomy" lines={[
    { at: 1.2, text: 'The voice box is removed.' }, { at: 4.8, text: 'The lips can still shape words.' },
    { at: 10.4, text: 'The words are still there.' }, { at: 12.2, text: 'The sound isn’t.', color: C.dim }]} /> },
  { name: 'options', at: 28.2, dur: 13.9, el: <Context dur={13.9} clip="vid/silent_understand.mp4" origin={ORIGIN.understand} kicker="Existing ways to communicate" lines={[
    { at: 3.0, text: 'Electrolarynx.' }, { at: 3.9, text: 'Voice prosthesis.' }, { at: 4.8, text: 'Writing. Sign.' },
    { at: 9.4, text: 'TACIT is one more option.', color: C.mint }]} /> },
  { name: 'question', at: 42.0, dur: 6.5, el: <Question dur={6.5} lines={[{ at: 2.0, text: 'What if silent words' }, { at: 3.0, text: 'became another way to speak?' }]} /> },
  { name: 'logo', at: 48.3, dur: 4.5, el: <LogoReveal dur={4.5} /> },
  { name: 'notch reveal', at: 52.5, dur: 6.1, el: <NotchReveal dur={6.1} /> },
  { name: 'origin', at: 58.4, dur: 10.8, el: <FullClip dur={10.8} clip="vid/silent_cake.mp4" origin={ORIGIN.cake} rate={0.55} z0={1.0} z1={1.25}
    overlay={<div style={{ position: 'absolute', left: 120, bottom: 200 }}><Kicker>Built at HackUMass XIV</Kicker><div style={{ fontSize: 34, color: C.paper, marginTop: 14 }}>Auto-AVSR visual speech model · research weights · lips only</div></div>} /> },
  { name: 'workspace start', at: 69.0, dur: 6.2, el: <Capture dur={6.2} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.92, x: 0, y: 0 }} to={{ scale: 1.45, x: -268, y: 131 }} chip={ui('REAL CAPTURE', 'workspace · Review first selected')} taps={[{ at: 5.0, x: 960, y: 540 }]} /> },
  { name: 'lips', at: 75.0, dur: 6.0, el: <FullClip dur={6.0} clip="vid/silent_mother.mp4" origin={ORIGIN.mother} rate={0.9} z0={1.1} z1={1.9}
    overlay={<div style={{ position: 'absolute', left: 120, bottom: 200 }}><Kicker>Camera → lips → words</Kicker><div style={{ fontSize: 30, color: C.paper, marginTop: 14 }}>Audio is never used.</div></div>} /> },
  { name: 'recognize lights', at: 80.8, dur: 8.2, el: <Recognition dur={8.2} clip="vid/silent_lights.mp4" origin={ORIGIN.lights} rate={0.68}
    at={3.6} text="PLEASE TURN ON THE LIGHTS" label="Recognized from silent lips" note="0 of 5 words wrong · recorded clip, offline evaluator" /> },
  { name: 'results mixed', at: 88.8, dur: 11.6, el: <ResultsBoard dur={11.6} rows={MIXED} title="Our own silent recordings · the good and the bad" foot="Verbatim model output. Some exact, some nowhere close. Not an accuracy rate." /> },
  { name: 'recognize going', at: 100.2, dur: 6.6, el: <Recognition dur={6.6} clip="vid/silent_howareyou.mp4" origin={ORIGIN.howareyou} rate={0.82}
    at={0.8} text="HOW ARE YOU GOING" label="Recognized from silent lips" note="meant “how are you doing” · 1 of 4 words wrong"
    highlight={{ word: 'GOING', color: C.amber, at: 5.0 }} replace={{ from: 'GOING', to: 'DOING', at: 5.9 }} /> },
  { name: 'edit', at: 106.6, dur: 5.0, el: <Capture dur={5.0} src="img/real-edit.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: -44, y: -60 }}
    chip={ui('REAL CAPTURE', 'correction editor · sent only when you press Speak')} /> },
  { name: 'review speak', at: 111.4, dur: 4.3, el: <Capture dur={4.3} src="img/real-review-k.png" width={900} from={{ scale: 1.0, x: -169, y: -112 }} to={{ scale: 1.5, x: 297, y: 155 }}
    chip={ui('REAL CAPTURE', 'Words ready · Review first')} taps={[{ at: 3.4, x: 960, y: 540 }]} /> },
  { name: 'speaking', at: 115.5, dur: 13.7, el: <SpeakingWithDelivery dur={13.7} deliveryAt={6.0} /> },
  { name: 'hold my turn', at: 129.0, dur: 11.5, el: <Capture dur={11.5} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.95, x: 0, y: 40 }} to={{ scale: 1.55, x: -125, y: 294 }} chip={ui('REAL CAPTURE', 'Hold my turn speaks your hold phrase')} taps={[{ at: 8.9, x: 960, y: 540 }]} /> },
  { name: 'phrases', at: 140.3, dur: 5.9, el: <Capture dur={5.9} src="img/phrases.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.25, x: 0, y: 30 }} chip={RENDER} /> },
  { name: 'realtime warning', at: 146.0, dur: 7.2, el: <Capture dur={7.2} src="img/realtime-confirm.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: 0, y: -30 }} chip={RENDER} chipColor={C.amber} /> },
  { name: 'my voice', at: 153.0, dur: 5.2, el: <Capture dur={5.2} src="img/voice.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: 0, y: 60 }} chip={RENDER} /> },
  { name: 'help me respond', at: 158.0, dur: 10.6, el: <Capture dur={10.6} src="img/assistance.png" width={1000} y={30} from={{ scale: 0.84, x: 0, y: -20 }} to={{ scale: 1.0, x: 0, y: 30 }} chip={ui('INTERFACE RENDER', 'offline fixture · AI off in this render')}
    caption={<div style={{ fontSize: 24, color: C.dim }}>Help Me Respond · <span style={{ color: C.paper }}>Gemini drafts wording from text you type or paste</span> · editable · spoken only when you press Speak</div>} /> },
  { name: 'fail safely', at: 168.4, dur: 12.2, el: <Context dur={12.2} clip="vid/silent_water.mp4" origin={ORIGIN.water} kicker="Built to fail safely" lines={[
    { at: 1.8, text: 'Pause drops stale results.' }, { at: 4.4, text: 'Recognizer crash → back in 8 s.' },
    { at: 6.6, text: 'Stop silences speech in ~20 ms.' }, { at: 8.4, text: 'Nothing old is ever spoken.', color: C.mint }]} /> },
  { name: 'architecture', at: 180.4, dur: 11.8, el: <ArchitectureScene dur={11.8} lights={[1.7, 2.3, 3.9, 5.7, 6.5, 8.1]} /> },
  { name: 'honest', at: 192.0, dur: 10.2, el: <Honest dur={10.2} lines={[
    { at: 0.6, text: 'Early prototype.' }, { at: 2.4, text: 'Not clinically validated.' },
    { at: 4.4, text: 'Not a replacement for AAC, voice prostheses or sign.', color: C.dim }, { at: 6.4, text: 'One more way to be heard.', color: C.mint }]} /> },
  { name: 'mission', at: 202.0, dur: 8.4, el: <Question dur={8.4} lines={[{ at: 1.6, text: 'Your words.' }, { at: 3.4, text: 'Your timing.' }, { at: 4.6, text: 'How you sound.' }]} /> },
  { name: 'end', at: 210.2, dur: 9.8, el: <EndCard dur={9.8} tagAt={1.8} creditsAt={5.2} credits={CREDITS} /> },
];

export const directorVO: VO[] = [
  { id: 'A01', at: 6.8 }, { id: 'A02', at: 12.6 }, { id: 'D01', at: 28.6 }, { id: 'A03', at: 42.2 }, { id: 'D02', at: 58.8 },
  { id: 'A04', at: 69.2 }, { id: 'A05', at: 81.2 }, { id: 'D03', at: 89.4 }, { id: 'A06b', at: 100.4 }, { id: 'A07', at: 118.2 },
  { id: 'A08', at: 129.5 }, { id: 'A09', at: 140.8 }, { id: 'A10', at: 153.4 }, { id: 'D04', at: 168.8 }, { id: 'A11', at: 180.8 },
  { id: 'A12', at: 192.5 }, { id: 'D06', at: 202.4 }, { id: 'A13', at: 211.4 },
];
export const directorTV: Fx[] = [{ id: 'tv_howareyou', at: 116.0 }, { id: 'tv_hold', at: 138.2 }];
export const directorFX: Fx[] = [{ id: 'sfx_tick', at: 74.0 }, { id: 'sfx_speak', at: 114.8 }, { id: 'sfx_tick', at: 137.9 }];

export const DirectorsCut: React.FC = () => (
  <Film scenes={directorScenes} vo={directorVO} tv={directorTV} fx={directorFX} musicFrom={6.0} musicTo={DIRECTOR_SECONDS} duration={DIRECTOR_SECONDS} />
);
