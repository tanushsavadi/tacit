import React from 'react';
import { C } from './kit';
import { Film, Fx, Scene, VO } from './film';
import { Capture, EndCard, Honest, NotchReveal, ORIGIN, Recognition, SpeakingWithDelivery } from './scenes';
import { CREDITS } from './devpost';

export const JUDGING_SECONDS = 75;
const ui = (k: string, t: string): [string, string] => [k, t];

export const judgingScenes: Scene[] = [
  { name: 'hook', at: 0, dur: 7.0, el: <Recognition dur={7.0} clip="vid/silent_lights.mp4" origin={ORIGIN.lights} rate={0.79}
    at={2.6} text="PLEASE TURN ON THE LIGHTS" label="Recognized from silent lips" note="no audio recorded · 0 of 5 words wrong · recorded clip" /> },
  { name: 'notch reveal', at: 6.8, dur: 5.8, el: <NotchReveal dur={5.8} /> },
  { name: 'workspace', at: 12.4, dur: 4.6, el: <Capture dur={4.6} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.35, x: -268, y: 131 }} chip={ui('REAL CAPTURE', 'workspace · Review first selected')} taps={[{ at: 3.8, x: 960, y: 540 }]} /> },
  { name: 'recognize going', at: 16.8, dur: 6.6, el: <Recognition dur={6.6} clip="vid/silent_howareyou.mp4" origin={ORIGIN.howareyou} rate={0.82}
    at={0.8} text="HOW ARE YOU GOING" label="Recognized from silent lips" note="meant “how are you doing” · 1 of 4 words wrong"
    highlight={{ word: 'GOING', color: C.amber, at: 5.0 }} replace={{ from: 'GOING', to: 'DOING', at: 5.9 }} /> },
  { name: 'edit', at: 23.2, dur: 4.2, el: <Capture dur={4.2} src="img/real-edit.png" width={1000} from={{ scale: 0.95, x: 0, y: 0 }} to={{ scale: 1.3, x: -44, y: -60 }}
    chip={ui('REAL CAPTURE', 'correction editor · sent only when you press Speak')} /> },
  { name: 'review speak', at: 27.2, dur: 4.3, el: <Capture dur={4.3} src="img/real-review-k.png" width={900} from={{ scale: 1.0, x: -169, y: -112 }} to={{ scale: 1.5, x: 297, y: 155 }}
    chip={ui('REAL CAPTURE', 'Words ready · Review first')} taps={[{ at: 3.4, x: 960, y: 540 }]} /> },
  { name: 'speaking', at: 31.3, dur: 13.2, el: <SpeakingWithDelivery dur={13.2} deliveryAt={5.5} /> },
  { name: 'hold my turn', at: 44.3, dur: 11.5, el: <Capture dur={11.5} src="img/03-expanded-home.png" width={1000}
    from={{ scale: 0.95, x: 0, y: 40 }} to={{ scale: 1.55, x: -125, y: 294 }} chip={ui('REAL CAPTURE', 'Hold my turn speaks your hold phrase')} taps={[{ at: 8.9, x: 960, y: 540 }]} /> },
  { name: 'honest', at: 55.6, dur: 10.4, el: <Honest dur={10.4} lines={[
    { at: 0.6, text: 'Early prototype.' }, { at: 2.4, text: 'Not clinically validated.' },
    { at: 4.4, text: 'Not a replacement for AAC, voice prostheses or sign.', color: C.dim }, { at: 6.4, text: 'One more way to be heard.', color: C.mint }]} /> },
  { name: 'end', at: 65.8, dur: 9.2, el: <EndCard dur={9.2} tagAt={1.6} creditsAt={4.8} credits={CREDITS} /> },
];

export const judgingVO: VO[] = [
  { id: 'J01', at: 7.0 }, { id: 'A06b', at: 17.0 }, { id: 'A07', at: 33.6 }, { id: 'A08', at: 44.8 }, { id: 'A12', at: 56.0 }, { id: 'A13', at: 67.0 },
];
export const judgingTV: Fx[] = [{ id: 'tv_howareyou', at: 31.8 }, { id: 'tv_hold', at: 53.5 }];
export const judgingFX: Fx[] = [{ id: 'sfx_tick', at: 16.2 }, { id: 'sfx_speak', at: 30.6 }, { id: 'sfx_tick', at: 53.2 }];

export const JudgingCut: React.FC = () => (
  <Film scenes={judgingScenes} vo={judgingVO} tv={judgingTV} fx={judgingFX} musicFrom={1.0} musicTo={JUDGING_SECONDS} duration={JUDGING_SECONDS} />
);
