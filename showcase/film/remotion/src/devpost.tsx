import React from 'react';
import { C, Kicker } from './kit';
import { Film, Fx, Scene, VO } from './film';
import {
  ArchitectureScene, Capture, ColdOpen, Context, EndCard, FullClip, Honest, LogoReveal, NotchReveal, ORIGIN, Question,
  Recognition, ResultsBoard, SpeakingWithDelivery,
} from './scenes';

export const DEVPOST_SECONDS = 168;

export const CREDITS = [
  'Product shots: real captures of the native TACIT app, or labelled offline renders of its own views · Silent clips: the founder’s own recordings',
  'Narration: synthetic voice (ElevenLabs) · TACIT voice: macOS system voice · Score: original · Recognition model: Auto-AVSR (research licence)',
];

const ui = (k: string, t: string): [string, string] => [k, t];
const RENDER = ui('INTERFACE RENDER', 'offline fixture of the app’s own view · not live');

export const RESULTS = [
  { ref: 'PLEASE TURN ON THE LIGHTS', hyp: 'PLEASE TURN ON THE LIGHTS', ok: true },
  { ref: 'I WOULD LIKE SOME WATER PLEASE', hyp: 'I WOULD LIKE SOME WATER PLEASE', ok: true },
  { ref: 'CAN YOU CALL MY MOTHER', hyp: 'CAN YOU CALL MY MOTHER', ok: true },
  { ref: 'I DONT UNDERSTAND', hyp: 'I DONT UNDERSTAND', ok: true },
];

export const devpostScenes: Scene[] = [
  { name: 'cold open', at: 0, dur: 11.8, el: <ColdOpen dur={11.8} lines={[{ at: 2.0, text: 'No sound.' }, { at: 3.6, text: 'Every word, still formed.' }]} /> },
  { name: 'context', at: 11.6, dur: 16.6, el: <Context dur={16.6} kicker="After a total laryngectomy" lines={[
    { at: 1.2, text: 'The voice box is removed.' }, { at: 4.8, text: 'The lips can still shape words.' },
    { at: 10.4, text: 'The words are still there.' }, { at: 12.2, text: 'The sound isn’t.', color: C.dim }]} /> },
  { name: 'question', at: 28.0, dur: 6.5, el: <Question dur={6.5} lines={[{ at: 2.0, text: 'What if silent words' }, { at: 3.0, text: 'became another way to speak?' }]} /> },
  { name: 'logo', at: 34.3, dur: 4.5, el: <LogoReveal dur={4.5} /> },
  { name: 'notch reveal', at: 38.5, dur: 5.9, el: <NotchReveal dur={5.9} /> },
  { name: 'workspace start', at: 44.2, dur: 6.2, el: <Capture dur={6.2} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.92, x: 0, y: 0 }} to={{ scale: 1.45, x: -268, y: 131 }} chip={ui('REAL CAPTURE', 'workspace · Review first selected')} taps={[{ at: 5.0, x: 960, y: 540 }]} /> },
  { name: 'lips', at: 50.2, dur: 6.0, el: <FullClip dur={6.0} clip="vid/silent_mother.mp4" origin={ORIGIN.mother} rate={0.9} z0={1.1} z1={1.9}
    overlay={<div style={{ position: 'absolute', left: 120, bottom: 200 }}><Kicker>Camera → lips → words</Kicker><div style={{ fontSize: 30, color: C.paper, marginTop: 14 }}>Audio is never used.</div></div>} /> },
  { name: 'recognize lights', at: 56.0, dur: 8.0, el: <Recognition dur={8.0} clip="vid/silent_lights.mp4" origin={ORIGIN.lights} rate={0.69}
    at={3.6} text="PLEASE TURN ON THE LIGHTS" label="Recognized from silent lips" note="0 of 5 words wrong · recorded clip, offline evaluator" /> },
  { name: 'results board', at: 63.8, dur: 4.9, el: <ResultsBoard dur={4.9} rows={RESULTS} title="Word for word, from silent recordings" foot="Other sentences came back wrong. That’s why you review first." /> },
  { name: 'recognize going', at: 68.6, dur: 6.6, el: <Recognition dur={6.6} clip="vid/silent_howareyou.mp4" origin={ORIGIN.howareyou} rate={0.82}
    at={0.8} text="HOW ARE YOU GOING" label="Recognized from silent lips" note="meant “how are you doing” · 1 of 4 words wrong"
    highlight={{ word: 'GOING', color: C.amber, at: 5.0 }} replace={{ from: 'GOING', to: 'DOING', at: 5.9 }} /> },
  { name: 'edit', at: 75.0, dur: 5.0, el: <Capture dur={5.0} src="img/real-edit.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: -44, y: -60 }}
    chip={ui('REAL CAPTURE', 'correction editor · sent only when you press Speak')} /> },
  { name: 'review speak', at: 79.8, dur: 4.3, el: <Capture dur={4.3} src="img/real-review-k.png" width={900} from={{ scale: 1.0, x: -169, y: -112 }} to={{ scale: 1.5, x: 297, y: 155 }}
    chip={ui('REAL CAPTURE', 'Words ready · Review first')} taps={[{ at: 3.4, x: 960, y: 540 }]} /> },
  { name: 'speaking', at: 83.9, dur: 13.7, el: <SpeakingWithDelivery dur={13.7} deliveryAt={6.0} /> },
  { name: 'hold my turn', at: 97.4, dur: 11.5, el: <Capture dur={11.5} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.95, x: 0, y: 40 }} to={{ scale: 1.55, x: -125, y: 294 }} chip={ui('REAL CAPTURE', 'Hold my turn speaks your hold phrase')} taps={[{ at: 8.9, x: 960, y: 540 }]} /> },
  { name: 'phrases', at: 108.7, dur: 5.9, el: <Capture dur={5.9} src="img/phrases.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.25, x: 0, y: 30 }} chip={RENDER} /> },
  { name: 'realtime warning', at: 114.4, dur: 7.2, el: <Capture dur={7.2} src="img/realtime-confirm.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: 0, y: -30 }} chip={RENDER} chipColor={C.amber} /> },
  { name: 'my voice', at: 121.4, dur: 5.2, el: <Capture dur={5.2} src="img/voice.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: 0, y: 60 }} chip={RENDER} /> },
  { name: 'help me respond', at: 126.4, dur: 10.6, el: <Capture dur={10.6} src="img/assistance.png" width={1000} y={30} from={{ scale: 0.84, x: 0, y: -20 }} to={{ scale: 1.0, x: 0, y: 30 }} chip={ui('INTERFACE RENDER', 'offline fixture · AI off in this render')}
    caption={<div style={{ fontSize: 24, color: C.dim }}>Help Me Respond · <span style={{ color: C.paper }}>Gemini drafts wording from text you type or paste</span> · editable · spoken only when you press Speak</div>} /> },
  { name: 'architecture', at: 136.8, dur: 11.8, el: <ArchitectureScene dur={11.8} lights={[1.7, 2.3, 3.9, 5.7, 6.5, 8.1]} /> },
  { name: 'honest', at: 148.4, dur: 10.2, el: <Honest dur={10.2} lines={[
    { at: 0.6, text: 'Early prototype.' }, { at: 2.4, text: 'Not clinically validated.' },
    { at: 4.4, text: 'Not a replacement for AAC, voice prostheses or sign.', color: C.dim }, { at: 6.4, text: 'One more way to be heard.', color: C.mint }]} /> },
  { name: 'end', at: 158.4, dur: 9.6, el: <EndCard dur={9.6} tagAt={1.8} creditsAt={5.0} credits={CREDITS} /> },
];

export const devpostVO: VO[] = [
  { id: 'A01', at: 6.8 }, { id: 'A02', at: 12.6 }, { id: 'A03', at: 28.2 }, { id: 'A04', at: 44.4 }, { id: 'A05', at: 56.4 },
  { id: 'A06b', at: 68.8 }, { id: 'A07', at: 86.6 }, { id: 'A08', at: 97.9 }, { id: 'A09', at: 109.2 }, { id: 'A10', at: 121.8 },
  { id: 'A11', at: 137.2 }, { id: 'A12', at: 148.9 }, { id: 'A13', at: 159.6 },
];
export const devpostTV: Fx[] = [{ id: 'tv_howareyou', at: 84.4 }, { id: 'tv_hold', at: 106.6 }];
export const devpostFX: Fx[] = [{ id: 'sfx_tick', at: 49.2 }, { id: 'sfx_speak', at: 83.2 }, { id: 'sfx_tick', at: 106.3 }];

export const DevpostDemo: React.FC = () => (
  <Film scenes={devpostScenes} vo={devpostVO} tv={devpostTV} fx={devpostFX} musicFrom={6.0} musicTo={DEVPOST_SECONDS} duration={DEVPOST_SECONDS} />
);
