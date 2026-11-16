import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import {
  Architecture, C, Chip, Delivery, Kicker, Line, Mark, Recognized, Shot, Spring, Stage, Tap, Webcam, lerp, s, useSceneFade,
} from './kit';

const Fade: React.FC<{ dur: number; children: React.ReactNode; fade?: number }> = ({ dur, children, fade }) => {
  const o = useSceneFade(dur, fade);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const ORIGIN = {
  lights: [0.52, 0.7] as [number, number], water: [0.52, 0.7] as [number, number], understand: [0.52, 0.7] as [number, number],
  howareyou: [0.51, 0.78] as [number, number], mother: [0.51, 0.78] as [number, number], cake: [0.5, 0.78] as [number, number],
};
const REC = { kind: 'REAL RECORDING', text: 'founder’s silent articulation · no audio recorded' };

/** Cold open: silence, then a person mouthing words with no sound. */
export const ColdOpen: React.FC<{ dur: number; lines: { at: number; text: string }[]; clip?: string; origin?: [number, number] }> = ({ dur, lines, clip = 'vid/silent_cake.mp4', origin = ORIGIN.cake }) => (
  <Fade dur={dur} fade={0.8}>
    <Stage>
      <Webcam src={clip} dur={dur} origin={origin} z0={1.0} z1={1.6} rate={Math.min(1, 5.9 / dur)} />
      <Chip {...REC} delay={1.2} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 0 190px 120px' }}>
        {lines.map((l) => <Line key={l.text} at={l.at} size={58} weight={560}>{l.text}</Line>)}
      </AbsoluteFill>
    </Stage>
  </Fade>
);

export const Context: React.FC<{ dur: number; kicker: string; lines: { at: number; text: string; color?: string }[]; clip?: string; origin?: [number, number] }> = ({ dur, kicker, lines, clip = 'vid/silent_mother.mp4', origin = ORIGIN.mother }) => (
  <Fade dur={dur} fade={0.7}>
    <Stage>
      <Webcam src={clip} dur={dur} origin={origin} grade="dim" z0={1.2} z1={1.35} rate={Math.min(1, 5.4 / dur)} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(10,13,12,0.92) 0%, rgba(10,13,12,0.6) 55%, rgba(10,13,12,0.3) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 140px', gap: 26 }}>
        <Kicker style={{ marginBottom: 14 }}>{kicker}</Kicker>
        {lines.map((l) => <Line key={l.text} at={l.at} size={74} color={l.color}>{l.text}</Line>)}
      </AbsoluteFill>
    </Stage>
  </Fade>
);

export const Question: React.FC<{ dur: number; lines: { at: number; text: string }[] }> = ({ dur, lines }) => (
  <Fade dur={dur}>
    <Stage>
      <Webcam src="vid/silent_water.mp4" dur={dur} origin={ORIGIN.water} grade="mono" z0={1.25} z1={1.45} rate={Math.min(1, 5.4 / dur)} />
      <AbsoluteFill style={{ background: 'rgba(10,13,12,0.55)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        {lines.map((l) => <Line key={l.text} at={l.at} size={78}>{l.text}</Line>)}
      </AbsoluteFill>
    </Stage>
  </Fade>
);

export const LogoReveal: React.FC<{ dur: number }> = ({ dur }) => (
  <Fade dur={dur} fade={0.3}>
    <AbsoluteFill style={{ background: C.ink }}>
      <OffthreadVideo src={staticFile('vid/logo_reveal.mp4')} muted style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  </Fade>
);

/** Stylised desktop → the real compact notch capture at the top edge. */
export const NotchReveal: React.FC<{ dur: number; src?: string }> = ({ dur, src = 'img/real-compact-k.png' }) => {
  const f = useCurrentFrame();
  const t = lerp(f, s(0.4), s(dur), 0, 1);
  const sc = 1 + 1.25 * t;
  const o = useSceneFade(dur);
  return (
    <AbsoluteFill style={{ opacity: o, background: C.ink, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${sc})`, transformOrigin: '50% 0%' }}>
        <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 30% 110%, ${C.teal}55 0%, transparent 60%), radial-gradient(1200px 800px at 85% 0%, #1d2b5a66 0%, transparent 60%), linear-gradient(180deg, #0e1413 0%, #13201c 100%)` }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, background: 'rgba(0,0,0,0.35)' }} />
        <Img src={staticFile(src)} style={{ position: 'absolute', top: 0, left: (1920 - 528) / 2, width: 528 }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, bottom: 200, width: 1920, height: 60 }}><div style={{ position: 'relative', width: 1920, height: 60 }}><Chip kind="REAL CAPTURE" text="TACIT compact notch · native app · desktop backdrop stylised" delay={0.6} /></div></div>
    </AbsoluteFill>
  );
};

type Cam = { scale: number; x: number; y: number };
export const Capture: React.FC<{
  dur: number; src: string; width: number; from: Cam; to: Cam; chip: [string, string]; chipColor?: string;
  taps?: { at: number; x: number; y: number }[]; caption?: React.ReactNode; y?: number; radius?: number;
}> = ({ dur, src, width, from, to, chip, chipColor, taps = [], caption, y = -40, radius }) => (
  <Fade dur={dur}>
    <Stage>
      <Shot src={src} width={width} dur={dur} from={from} to={to} y={y} radius={radius} />
      {taps.map((t) => <Tap key={t.at} {...t} />)}
      <Chip kind={chip[0]} text={chip[1]} color={chipColor} />
      {caption && <div style={{ position: 'absolute', left: 0, right: 0, top: 108, display: 'flex', justifyContent: 'center' }}><div style={{ background: 'rgba(10,13,12,0.8)', padding: '10px 22px', borderRadius: 12 }}>{caption}</div></div>}
    </Stage>
  </Fade>
);

/** Silent clip + verbatim recognizer output. */
export const Recognition: React.FC<{
  dur: number; clip: string; origin: [number, number]; text: string; label: string; note: string; at: number; rate?: number;
  highlight?: { word: string; color: string; at: number }; replace?: { from: string; to: string; at: number }; chip?: [string, string];
}> = ({ dur, clip, origin, text, label, note, at, rate = 1, highlight, replace, chip }) => (
  <Fade dur={dur}>
    <Stage>
      <Webcam src={clip} dur={dur} origin={origin} rate={rate} z0={1.15} z1={1.45} box={{ left: 90, top: 150, width: 860, height: 760 }} />
      <div style={{ position: 'absolute', left: 1030, top: 330, width: 820 }}>
        <Recognized at={at} text={text} label={label} note={note} highlight={highlight} replace={replace} />
      </div>
      <Chip kind={chip?.[0] ?? 'REAL RECORDING + RECOGNIZER OUTPUT'} text={chip?.[1] ?? 'silent clip · no audio track · verbatim model hypothesis'} />
    </Stage>
  </Fade>
);

export const FullClip: React.FC<{ dur: number; clip: string; origin: [number, number]; rate?: number; z0?: number; z1?: number; overlay?: React.ReactNode }> = ({ dur, clip, origin, rate = 1, z0 = 1.05, z1 = 1.5, overlay }) => (
  <Fade dur={dur}>
    <Stage>
      <Webcam src={clip} dur={dur} origin={origin} rate={rate} z0={z0} z1={z1} />
      <Chip {...REC} />
      {overlay && <AbsoluteFill style={{ background: 'linear-gradient(20deg, rgba(10,13,12,0.92) 0%, rgba(10,13,12,0.55) 30%, transparent 55%)' }} />}
      {overlay}
    </Stage>
  </Fade>
);

/** Board of real exact results from recorded silent clips. */
export const ResultsBoard: React.FC<{ dur: number; rows: { ref: string; hyp: string; ok: boolean }[]; title: string; foot: string }> = ({ dur, rows, title, foot }) => (
  <Fade dur={dur}>
    <Stage>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 220px' }}>
        <Kicker style={{ marginBottom: 40 }}>{title}</Kicker>
        {rows.map((r, i) => (
          <Spring key={r.ref} at={0.3 + i * 0.45}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 30, padding: '22px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 22, height: 22, borderRadius: 22, background: r.ok ? C.mint : C.amber, flexShrink: 0, transform: 'translateY(2px)' }} />
              <div style={{ fontSize: 52, color: C.paper, fontWeight: 640, flex: 1 }}>{r.hyp}</div>
              <div style={{ fontSize: 24, color: C.dim, width: 420, textAlign: 'right' }}>{r.ok ? 'exact' : `meant: ${r.ref.toLowerCase()}`}</div>
            </div>
          </Spring>
        ))}
        <div style={{ marginTop: 34, fontSize: 24, color: C.dim }}>{foot}</div>
      </AbsoluteFill>
      <Chip kind="RECOGNIZER OUTPUT" text="recorded silent clips · offline evaluator · not an accuracy rate" />
    </Stage>
  </Fade>
);

export const SpeakingWithDelivery: React.FC<{ dur: number; deliveryAt: number }> = ({ dur, deliveryAt }) => {
  const f = useCurrentFrame();
  const shift = lerp(f, s(deliveryAt - 0.6), s(deliveryAt), 0, -120);
  return (
    <Fade dur={dur}>
      <Stage>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${shift}px)` }}>
          <Shot src="img/real-speaking-k.png" width={900} dur={dur} from={{ scale: 1.08, x: -80, y: -40 }} to={{ scale: 1.0, x: 0, y: 0 }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 770, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, opacity: lerp(f, s(deliveryAt - 0.3), s(deliveryAt + 0.2), 0, 1) }}>
          <Delivery at={deliveryAt} />
          <div style={{ fontSize: 21, color: C.dim }}>Local output status · stops at the virtual microphone</div>
        </div>
        <Chip kind="REAL CAPTURE" text="speaking · after an explicit Speak · rendered locally" />
      </Stage>
    </Fade>
  );
};

export const ArchitectureScene: React.FC<{ dur: number; lights: number[] }> = ({ dur, lights }) => (
  <Fade dur={dur}><Stage><Architecture lights={lights} dur={dur} /><Chip kind="DIAGRAM" text="the shipped pipeline, simplified" /></Stage></Fade>
);

export const Honest: React.FC<{ dur: number; lines: { at: number; text: string; color?: string }[] }> = ({ dur, lines }) => (
  <Fade dur={dur} fade={0.7}>
    <Stage>
      <Webcam src="vid/silent_understand.mp4" dur={dur} origin={ORIGIN.understand} grade="dim" z0={1.3} z1={1.15} rate={Math.min(1, 5.4 / dur)} />
      <AbsoluteFill style={{ background: 'rgba(10,13,12,0.62)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 160px', gap: 22 }}>
        {lines.map((l) => <Line key={l.text} at={l.at} size={60} weight={580} color={l.color}>{l.text}</Line>)}
      </AbsoluteFill>
    </Stage>
  </Fade>
);

export const EndCard: React.FC<{ dur: number; tagAt: number; credits: string[]; creditsAt: number }> = ({ dur, tagAt, credits, creditsAt }) => {
  const f = useCurrentFrame();
  const p = lerp(f, s(0.2), s(1.6), 0, 1);
  const arcs = f > s(tagAt + 2.4) ? ((f - s(tagAt + 2.4)) / 39) % 1 : 0;
  const o = useSceneFade(dur, 0.6);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Stage>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40, transform: 'translateY(-50px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, opacity: p, transform: `scale(${0.94 + 0.06 * p})` }}>
            <Mark size={150} part={lerp(f, s(0.4), s(1.0), 1.4, 0)} arcs={arcs} />
            <Img src={staticFile('img/tacit-wordmark.svg')} style={{ height: 112 }} />
          </div>
          <div style={{ display: 'flex', gap: 30, fontSize: 46, fontWeight: 560, letterSpacing: '-0.01em' }}>
            {['Your words.', 'Your voice.', 'Beyond speech.'].map((t, i) => (
              <span key={t} style={{ color: i === 2 ? C.mint : C.paper, opacity: lerp(f, s(tagAt + i * 0.8), s(tagAt + i * 0.8 + 0.5), 0, 1) }}>{t}</span>
            ))}
          </div>
        </AbsoluteFill>
        <div style={{ position: 'absolute', bottom: 150, width: '100%', textAlign: 'center', fontSize: 19, color: C.faint, lineHeight: 1.6, opacity: lerp(f, s(creditsAt), s(creditsAt + 0.6), 0, 1) }}>
          {credits.map((c) => <div key={c}>{c}</div>)}
        </div>
      </Stage>
    </AbsoluteFill>
  );
};
