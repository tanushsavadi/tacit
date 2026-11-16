import React from 'react';
import {
  AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

// TACIT Living Signal palette (docs/brand/README.md on feat/brand-orb)
export const C = {
  ink: '#0A0D0C', graphite: '#16201D', paper: '#F4F7F6', mint: '#62E3C4', teal: '#0B7D6B', amber: '#FFB547',
  dim: 'rgba(244,247,246,0.62)', faint: 'rgba(244,247,246,0.38)',
};
export const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const FPS = 30;
export const s = (sec: number) => Math.round(sec * FPS);
const ease = Easing.bezier(0.45, 0, 0.2, 1);

export const lerp = (f: number, a: number, b: number, from: number, to: number, e = ease) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });

/** Fade a scene in and out over `fade` seconds. */
export const useSceneFade = (durSec: number, fade = 0.45) => {
  const f = useCurrentFrame();
  const d = s(durSec);
  return Math.min(lerp(f, 0, s(fade), 0, 1), lerp(f, d - s(fade), d, 1, 0));
};

export const Stage: React.FC<{ children?: React.ReactNode; glow?: string }> = ({ children, glow = C.mint }) => (
  <AbsoluteFill style={{ background: C.ink, fontFamily: FONT, overflow: 'hidden' }}>
    <AbsoluteFill style={{
      background: `radial-gradient(1200px 700px at 50% 38%, ${glow}14 0%, transparent 60%), radial-gradient(900px 900px at 50% 120%, ${C.graphite} 0%, transparent 70%)`,
    }} />
    {children}
  </AbsoluteFill>
);

/** Provenance label: every shot says what it is. */
export const Chip: React.FC<{ kind: string; text: string; color?: string; delay?: number }> = ({ kind, text, color = C.mint, delay = 0.3 }) => {
  const f = useCurrentFrame();
  const o = lerp(f, s(delay), s(delay + 0.4), 0, 1);
  return (
    <div style={{
      position: 'absolute', top: 44, left: 56, opacity: o, display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 19, letterSpacing: '0.06em', color: C.dim, fontWeight: 500, fontFamily: FONT, whiteSpace: 'nowrap',
      background: 'rgba(10,13,12,0.78)', padding: '8px 16px', borderRadius: 12, zIndex: 5,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: color }} />
      <span style={{ color: C.paper, fontWeight: 650 }}>{kind}</span>
      <span>· {text}</span>
    </div>
  );
};

type Cam = { scale: number; x: number; y: number };
/** A real capture on the dark stage with an eased camera move (x/y = focal offset in px of the displayed image). */
export const Shot: React.FC<{
  src: string; width: number; dur: number; from: Cam; to: Cam; y?: number; radius?: number; glow?: boolean; holdStart?: number;
}> = ({ src, width, dur, from, to, y = 0, radius = 28, glow = true, holdStart = 0 }) => {
  const f = useCurrentFrame();
  const t = lerp(f, s(holdStart), s(dur), 0, 1, Easing.bezier(0.33, 0, 0.15, 1));
  const sc = from.scale + (to.scale - from.scale) * t;
  const x = from.x + (to.x - from.x) * t;
  const yy = from.y + (to.y - from.y) * t;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `translate(${-x * sc}px, ${-yy * sc + y}px) scale(${sc})` }}>
        <Img src={staticFile(src)} style={{
          width, display: 'block', borderRadius: radius,
          boxShadow: glow ? `0 0 0 1px rgba(255,255,255,0.06), 0 40px 120px rgba(0,0,0,0.6), 0 0 160px ${C.mint}18` : undefined,
        }} />
      </div>
    </AbsoluteFill>
  );
};

/** Founder's own silent-articulation recording (video-only file, no audio track). */
export const Webcam: React.FC<{
  src: string; dur: number; origin: [number, number]; z0?: number; z1?: number; rate?: number; startFrom?: number;
  grade?: 'normal' | 'mono' | 'dim'; box?: { left: number; top: number; width: number; height: number };
}> = ({ src, dur, origin, z0 = 1.05, z1 = 1.35, rate = 1, startFrom = 0, grade = 'normal', box }) => {
  const f = useCurrentFrame();
  const z = lerp(f, 0, s(dur), z0, z1, Easing.bezier(0.3, 0, 0.3, 1));
  const filter = grade === 'mono' ? 'grayscale(1) contrast(1.05) brightness(0.55)'
    : grade === 'dim' ? 'saturate(0.7) brightness(0.45) blur(6px)' : 'saturate(0.92) contrast(1.04)';
  const frame = box ?? { left: 0, top: 0, width: 1920, height: 1080 };
  return (
    <div style={{ position: 'absolute', ...frame, overflow: 'hidden', borderRadius: box ? 28 : 0, background: '#000' }}>
      <OffthreadVideo src={staticFile(src)} muted playbackRate={rate} startFrom={s(startFrom)} style={{
        width: '100%', height: '100%', objectFit: 'cover', filter,
        transform: `scale(${z})`, transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%`,
      }} />
      {grade === 'normal' && <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(10,13,12,0.55) 0%, transparent 22%, transparent 70%, rgba(10,13,12,0.75) 100%)' }} />}
    </div>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.mint, style }) => (
  <div style={{ fontSize: 22, letterSpacing: '0.22em', fontWeight: 650, color, textTransform: 'uppercase', ...style }}>{children}</div>
);

/** Headline line that rises in at `at` seconds. */
export const Line: React.FC<{ at: number; children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }> = ({ at, children, size = 72, color = C.paper, weight = 620, style }) => {
  const f = useCurrentFrame();
  const o = lerp(f, s(at), s(at + 0.6), 0, 1);
  const ty = lerp(f, s(at), s(at + 0.8), 26, 0);
  return <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontSize: size, fontWeight: weight, color, letterSpacing: '-0.025em', lineHeight: 1.12, ...style }}>{children}</div>;
};

/** Recognizer output panel; text is the verbatim hypothesis from results.json / the native run. */
export const Recognized: React.FC<{
  at: number; text: string; label: string; note?: string; highlight?: { word: string; color: string; at: number };
  replace?: { from: string; to: string; at: number }; style?: React.CSSProperties;
}> = ({ at, text, label, note, highlight, replace, style }) => {
  const f = useCurrentFrame();
  const o = lerp(f, s(at), s(at + 0.4), 0, 1);
  const chars = Math.floor(interpolate(f, [s(at + 0.3), s(at + 0.3) + text.length * 1.6], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const shown = text.slice(0, chars);
  const words = shown.split(' ');
  const done = chars >= text.length;
  return (
    <div style={{ opacity: o, ...style }}>
      <Kicker style={{ marginBottom: 22 }}>{label}</Kicker>
      <div style={{ fontSize: 64, fontWeight: 650, color: C.paper, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
        {words.map((w, i) => {
          let color = C.paper; let deco: React.CSSProperties = {};
          if (highlight && w === highlight.word && f >= s(highlight.at)) { color = highlight.color; deco = { textDecoration: 'underline', textDecorationThickness: 5, textUnderlineOffset: 10 }; }
          if (replace && w === replace.from && f >= s(replace.at)) {
            const p = lerp(f, s(replace.at), s(replace.at + 0.5), 0, 1);
            return <span key={i}><span style={{ color: C.faint, textDecoration: 'line-through', opacity: 1 - p * 0.6 }}>{w}</span>{' '}<span style={{ color: C.mint, opacity: p }}>{replace.to}</span>{i < words.length - 1 ? ' ' : ''}</span>;
          }
          return <span key={i} style={{ color, ...deco }}>{w}{i < words.length - 1 ? ' ' : ''}</span>;
        })}
        {!done && <span style={{ color: C.mint, opacity: (Math.floor(f / 8) % 2) ? 1 : 0.2 }}>▍</span>}
      </div>
      {note && <div style={{ marginTop: 22, fontSize: 24, color: C.dim, opacity: done ? lerp(f, s(at) + text.length * 1.6, s(at) + text.length * 1.6 + 12, 0, 1) : 0 }}>{note}</div>}
    </div>
  );
};

/** Editorial emphasis ring for a tap. Placement is approximate to the button in the real capture. */
export const Tap: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const f = useCurrentFrame();
  if (f < s(at) || f > s(at + 0.9)) return null;
  const p = lerp(f, s(at), s(at + 0.9), 0, 1, Easing.out(Easing.cubic));
  return <div style={{ position: 'absolute', left: x - 50, top: y - 50, width: 100, height: 100, borderRadius: 100, border: `4px solid ${C.mint}`, opacity: 1 - p, transform: `scale(${0.5 + p})` }} />;
};

export type Cue = { start: number; end: number; text: string };
export const Captions: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const o = Math.min(lerp(f, s(cue.start), s(cue.start) + 4, 0, 1), lerp(f, s(cue.end) - 4, s(cue.end), 1, 0));
  return (
    <div style={{ position: 'absolute', bottom: 52, width: '100%', display: 'flex', justifyContent: 'center', opacity: o, fontFamily: FONT }}>
      <div style={{ maxWidth: 1300, textAlign: 'center', fontSize: 36, lineHeight: 1.3, color: '#fff', fontWeight: 520, background: 'rgba(5,7,6,0.72)', padding: '10px 26px', borderRadius: 14 }}>{cue.text}</div>
    </div>
  );
};

/** The Living Signal mark drawn from the brand geometry (24-unit grid). */
export const Mark: React.FC<{ size: number; dot?: string; lips?: string; part?: number; arcs?: number }> = ({ size, dot = C.mint, lips = C.paper, part = 0, arcs = 0 }) => {
  const r = 7.25; const gap = 24; // degrees, mouth-corner gaps at 0° and 180°
  const arc = (a0: number, a1: number, dy: number) => {
    const p = (a: number) => [12 + r * Math.cos((a * Math.PI) / 180), 12 + dy + r * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0); const [x1, y1] = p(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const g = gap / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
      <path d={arc(180 + g, 360 - g, -part)} stroke={lips} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d={arc(g, 180 - g, part)} stroke={lips} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <circle cx={12} cy={12} r={2.45} fill={dot} />
      {[0, 1].map((i) => {
        const k = (arcs + i * 0.5) % 1; if (arcs <= 0) return null;
        const rr = 9 + k * 7;
        return <path key={i} d={`M ${12 + rr * Math.cos(-0.5)} ${12 + rr * Math.sin(-0.5)} A ${rr} ${rr} 0 0 1 ${12 + rr * Math.cos(0.5)} ${12 + rr * Math.sin(0.5)}`} stroke={dot} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={1 - k} />;
      })}
    </svg>
  );
};

/** Camera → … → virtual mic, lit in sequence. */
export const Architecture: React.FC<{ lights: number[]; dur: number }> = ({ lights }) => {
  const f = useCurrentFrame();
  const nodes = [
    ['Camera', 'Mac camera'],
    ['Lip tracking', 'on-device · Apple Vision'],
    ['Visual speech recognition', 'Auto-AVSR · runs locally'],
    ['Your review', 'Speak · Edit · Stop'],
    ['Voice synthesis', 'the voice you chose'],
    ['Virtual microphone', 'any calling app'],
  ];
  const W = 250; const gap = 46; const total = nodes.length * W + (nodes.length - 1) * gap; const x0 = (1920 - total) / 2;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 250, width: '100%', textAlign: 'center' }}>
        <Kicker>How TACIT works</Kicker>
      </div>
      {nodes.map(([t, sub], i) => {
        const on = lerp(f, s(lights[i]), s(lights[i] + 0.5), 0, 1);
        const isReview = i === 3;
        const col = isReview ? C.amber : C.mint;
        return (
          <React.Fragment key={t}>
            {i > 0 && (
              <div style={{ position: 'absolute', left: x0 + i * (W + gap) - gap + 6, top: 503, width: gap - 12, height: 3, background: C.faint, overflow: 'hidden', borderRadius: 3 }}>
                <div style={{ width: `${on * 100}%`, height: '100%', background: col }} />
              </div>
            )}
            <div style={{
              position: 'absolute', left: x0 + i * (W + gap), top: 420, width: W, height: 170, borderRadius: 26,
              border: `2px solid ${on > 0.5 ? col : 'rgba(255,255,255,0.12)'}`, background: on > 0.5 ? `${col}12` : 'rgba(255,255,255,0.03)',
              opacity: 0.35 + on * 0.65, transform: `translateY(${(1 - on) * 14}px)`,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px',
            }}>
              <div style={{ fontSize: 15, color: col, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 10 }}>0{i + 1}</div>
              <div style={{ fontSize: 28, color: C.paper, fontWeight: 650, lineHeight: 1.1 }}>{t}</div>
              <div style={{ fontSize: 18, color: C.dim, marginTop: 8 }}>{sub}</div>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ position: 'absolute', top: 650, width: '100%', textAlign: 'center', fontSize: 24, color: C.dim, opacity: lerp(f, s(lights[5] + 0.6), s(lights[5] + 1.2), 0, 1) }}>
        Nothing reaches the call unless you press Speak, or turn on Real-time yourself.
      </div>
    </AbsoluteFill>
  );
};

/** Voice → Call mic → Done: mirrors TACIT's local delivery states. Not a remote "heard" claim. */
export const Delivery: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const steps = ['Voice', 'Call mic', 'Done'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
      {steps.map((t, i) => {
        const on = lerp(f, s(at + i * 0.9), s(at + i * 0.9 + 0.4), 0, 1);
        return (
          <React.Fragment key={t}>
            {i > 0 && <div style={{ width: 110, height: 3, background: C.faint, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${on * 100}%`, height: '100%', background: C.mint }} /></div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.35 + on * 0.65 }}>
              <div style={{ width: 26, height: 26, borderRadius: 26, border: `3px solid ${C.mint}`, background: on > 0.6 ? C.mint : 'transparent' }} />
              <div style={{ fontSize: 34, color: C.paper, fontWeight: 620 }}>{t}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const Spring: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: f - s(at), fps, config: { damping: 200 } });
  return <div style={{ opacity: p, transform: `scale(${0.96 + 0.04 * p})` }}>{children}</div>;
};
