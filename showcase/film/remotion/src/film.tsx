import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C, Captions, Cue, FPS, s } from './kit';

// Narration (ElevenLabs stock voice "Will", eleven_multilingual_v2) — text is the exact script sent to TTS.
export const SCRIPT: Record<string, string> = {
  A01: 'Imagine knowing exactly what you want to say… and having no way to say it out loud.',
  A02: "After a total laryngectomy, the voice box is gone. Many people can still shape words with their lips, but there's no sound behind them. The words are still there. The voice isn't.",
  A03: "So we asked a simple question. What if the words you can still mouth silently became another way to speak? That's TACIT. It lives quietly in the notch of your Mac.",
  A04: 'Start it once. TACIT reads your lips through the camera, never your microphone, and a visual speech recognition model running on your Mac turns silent articulation into text.',
  A05: 'No sound at all. Just lips. And the words come back.',
  A06b: 'Recognition isn\'t perfect, so nothing is spoken until you decide. Here, "doing" came back as "going". You see it. You fix it.',
  A07: "When the words are right, one tap on Speak sends exactly those words, in the voice you chose, into your call's microphone. And Stop is always one tap away.",
  A08: "But a conversation is more than sentences. It's timing. Hold my turn keeps your place, so nobody talks over you while you compose.",
  A09: 'Saved phrases let you react in a second, in words that sound like you. And for practised phrases, an optional real-time mode speaks without review, only after you accept a clear warning.',
  A10: 'My Voice lets you choose how you sound, and preview it privately first. Help Me Respond turns context you paste in into wording you can edit. It never listens to your meeting, and it never rewrites the words TACIT recognized.',
  A11: 'Under the hood: the camera, on-device lip tracking, visual speech recognition, your review, voice synthesis, and a virtual microphone that any calling app can use.',
  A12: "We're early. Accuracy varies, and TACIT hasn't been tested with people who've lost their voice. But we think everyone deserves more ways to be heard, on their own terms.",
  A13: 'TACIT. Your words. Your voice. Beyond speech.',
  D01: "Every year, people lose their voices to surgery, injury, and illness. Some use an electrolarynx, a voice prosthesis, writing, or sign. TACIT doesn't replace any of them. It's one more option.",
  D02: 'We built TACIT at HackUMass, starting from a research visual speech model, and one question: can it read silent lips well enough to help in a real conversation?',
  D03: "The honest answer is: sometimes. On our own recordings, some sentences came back word for word. Others didn't come close. That's exactly why review comes first.",
  D04: 'TACIT is built to fail safely. Pause drops anything stale. If the recognizer crashes, it restarts on its own. Nothing old is ever spoken.',
  D06: "Communication is autonomy: choosing your words, your timing, and how you sound. That's what TACIT is for.",
  J01: 'This is TACIT. Mouth your words silently, and your Mac speaks them, in a voice you choose, only after you approve.',
};
// Measured with ffprobe (seconds).
export const DUR: Record<string, number> = {
  A01: 4.46, A02: 12.35, A03: 10.4, A04: 11.33, A05: 3.25, A06b: 9.43, A07: 10.91, A08: 8.41, A09: 11.98,
  A10: 14.54, A11: 10.82, A12: 9.52, A13: 3.58,
  D01: 13.05, D02: 9.75, D03: 10.63, D04: 11.05, D06: 7.48, J01: 7.76,
};
// TACIT output phrases rendered with the macOS system voice "Daniel" (the voice TACIT routes by default).
export const TV: Record<string, { text: string; dur: number }> = {
  tv_howareyou: { text: 'How are you doing?', dur: 1.15 },
  tv_hold: { text: "One moment, I'm responding.", dur: 2.09 },
  tv_lights: { text: 'Please turn on the lights.', dur: 1.51 },
  tv_water: { text: 'I would like some water please.', dur: 1.89 },
  tv_repeat: { text: 'Could you repeat that?', dur: 1.24 },
};

export type VO = { id: string; at: number };
export type Fx = { id: string; at: number; vol?: number };
export type Scene = { at: number; dur: number; el: React.ReactNode; name: string };

/** Split narration into caption cues, timed proportionally to characters within the measured line. */
export const cuesFor = (vo: VO[], tv: Fx[] = []): Cue[] => {
  const out: Cue[] = [];
  for (const v of vo) {
    const text = SCRIPT[v.id]; const dur = DUR[v.id];
    const parts: string[] = [];
    for (const sent of text.match(/[^.!?…]+[.!?…]+["”]?|[^.!?…]+$/g) ?? [text]) {
      const t = sent.trim(); if (!t) continue;
      if (t.length <= 72) { parts.push(t); continue; }
      const words = t.split(' '); let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > 64 && cur) { parts.push(cur.trim()); cur = w; } else cur += ' ' + w;
      }
      if (cur.trim()) parts.push(cur.trim());
    }
    const total = parts.reduce((a, p) => a + p.length, 0);
    let t0 = v.at;
    for (const p of parts) { const d = (p.length / total) * dur; out.push({ start: +t0.toFixed(2), end: +(t0 + d).toFixed(2), text: p }); t0 += d; }
  }
  for (const x of tv) {
    const meta = TV[x.id]; if (!meta) continue;
    out.push({ start: x.at, end: +(x.at + Math.max(meta.dur, 1.6) + 0.4).toFixed(2), text: `[TACIT voice] “${meta.text}”` });
  }
  return out.sort((a, b) => a.start - b.start);
};

export const Film: React.FC<{ scenes: Scene[]; vo: VO[]; fx: Fx[]; tv: Fx[]; musicFrom: number; musicTo: number; duration: number }> = ({ scenes, vo, fx, tv, musicFrom, musicTo, duration }) => {
  const cues = cuesFor(vo, tv);
  const speechSpans = [...vo.map((v) => [v.at, v.at + DUR[v.id]]), ...tv.map((x) => [x.at, x.at + (TV[x.id]?.dur ?? 1)])];
  const musicVol = (f: number) => {
    const t = f / FPS + musicFrom;
    const ducked = speechSpans.some(([a, b]) => t > a - 0.4 && t < b + 0.5);
    const base = ducked ? 0.11 : 0.24;
    const fadeOut = Math.max(0, Math.min(1, (musicTo - t) / 3));
    const fadeIn = Math.max(0, Math.min(1, (t - musicFrom) / 3));
    return base * fadeOut * fadeIn;
  };
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {scenes.map((sc) => (
        <Sequence key={sc.name + sc.at} from={s(sc.at)} durationInFrames={s(sc.dur)} name={sc.name}>{sc.el}</Sequence>
      ))}
      <Sequence from={s(musicFrom)} durationInFrames={s(musicTo - musicFrom)} name="score">
        <Audio src={staticFile('aud/score_pad.wav')} volume={musicVol} />
      </Sequence>
      {vo.map((v) => (
        <Sequence key={v.id + v.at} from={s(v.at)} durationInFrames={s(DUR[v.id] + 0.3)} name={`VO ${v.id}`}>
          <Audio src={staticFile(`aud/${v.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      {tv.map((x) => (
        <Sequence key={x.id + x.at} from={s(x.at)} durationInFrames={s((TV[x.id]?.dur ?? 1) + 0.4)} name={`TACIT ${x.id}`}>
          <Audio src={staticFile(`aud/${x.id}.wav`)} volume={x.vol ?? 0.95} />
        </Sequence>
      ))}
      {fx.map((x, i) => (
        <Sequence key={x.id + i} from={s(x.at)} durationInFrames={s(1)} name={`sfx ${x.id}`}>
          <Audio src={staticFile(`aud/${x.id}.wav`)} volume={x.vol ?? 0.25} />
        </Sequence>
      ))}
      <Captions cues={cues} />
      <FrameGuard duration={duration} />
    </AbsoluteFill>
  );
};

const FrameGuard: React.FC<{ duration: number }> = () => { useCurrentFrame(); return null; };
