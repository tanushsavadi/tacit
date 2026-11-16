import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';

// TACIT Living Signal palette (docs/brand/README.md, feat/brand-orb)
export const C = {
  ink: '#0A0D0C', graphite: '#16201D', paper: '#F4F7F6', mint: '#62E3C4', teal: '#0B7D6B', amber: '#FFB547',
  dim: 'rgba(244,247,246,0.66)', faint: 'rgba(244,247,246,0.40)', line: 'rgba(244,247,246,0.10)',
};
export const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

export const img = (p: string) => staticFile(`img/${p}`);

/** Dark stage with soft mint light and graphite floor. */
export const Stage: React.FC<{ children?: React.ReactNode; glowX?: string; glowY?: string; w?: number }> = ({ children, glowX = '68%', glowY = '30%', w = 1800 }) => (
  <AbsoluteFill style={{ background: C.ink, fontFamily: FONT, overflow: 'hidden', color: C.paper }}>
    <AbsoluteFill style={{
      background: `radial-gradient(${w * 0.62}px ${w * 0.42}px at ${glowX} ${glowY}, ${C.mint}1c 0%, transparent 62%),
        radial-gradient(${w * 0.7}px ${w * 0.5}px at 18% 115%, ${C.graphite} 0%, transparent 70%),
        radial-gradient(${w * 0.5}px ${w * 0.4}px at 100% 100%, #0f1a17 0%, transparent 70%)`,
    }} />
    {/* fine grain-free vignette */}
    <AbsoluteFill style={{ boxShadow: `inset 0 0 ${w * 0.12}px rgba(0,0,0,0.55)` }} />
    {children}
  </AbsoluteFill>
);

/** Official lockup (vector, from brand-assets/svg/tacit-lockup.svg). viewBox 69.88 × 18.79. */
export const Lockup: React.FC<{ h: number; style?: React.CSSProperties }> = ({ h, style }) => (
  <Img src={img('tacit-lockup.svg')} style={{ height: h, width: (h * 69.88) / 18.79, display: 'block', ...style }} />
);

/** Living Signal mark drawn from the 24-unit brand geometry (r 7.25, stroke 2.2, gaps 2×24°, dot r 2.45). */
export const Mark: React.FC<{ size: number; lips?: string; dot?: string; arcs?: boolean; opacity?: number; stroke?: number }> = ({ size, lips = C.paper, dot = C.mint, arcs = false, opacity = 1, stroke = 2.2 }) => {
  const r = 7.25; const g = 12;
  const p = (a: number) => [12 + r * Math.cos((a * Math.PI) / 180), 12 + r * Math.sin((a * Math.PI) / 180)];
  const arc = (a0: number, a1: number) => { const [x0, y0] = p(a0); const [x1, y1] = p(a1); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`; };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: 'visible', opacity, display: 'block' }}>
      <path d={arc(180 + g, 360 - g)} stroke={lips} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      <path d={arc(g, 180 - g)} stroke={lips} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      {dot !== 'none' && <circle cx={12} cy={12} r={2.45} fill={dot} />}
      {arcs && [10.6, 13.6].map((rr, i) => (
        <path key={rr} d={`M ${12 + rr * Math.cos(-0.42)} ${12 + rr * Math.sin(-0.42)} A ${rr} ${rr} 0 0 1 ${12 + rr * Math.cos(0.42)} ${12 + rr * Math.sin(0.42)}`}
          stroke={dot} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={i ? 0.45 : 0.85} />
      ))}
    </svg>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.mint, size = 22, style }) => (
  <div style={{ fontSize: size, letterSpacing: '0.2em', fontWeight: 700, color, textTransform: 'uppercase', ...style }}>{children}</div>
);

export const H: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 76, style }) => (
  <div style={{ fontSize: size, fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.04, color: C.paper, ...style }}>{children}</div>
);

export const P: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 29, style }) => (
  <div style={{ fontSize: size, fontWeight: 450, lineHeight: 1.4, color: C.dim, letterSpacing: '-0.005em', ...style }}>{children}</div>
);

/** Provenance line — every image says what its pictures are. */
export const Source: React.FC<{ kind: string; text: string; color?: string; style?: React.CSSProperties; size?: number }> = ({ kind, text, color = C.mint, style, size = 19 }) => (
  <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: 12, fontSize: size, color: C.faint, fontWeight: 500, letterSpacing: '0.01em', ...style }}>
    <span style={{ width: 9, height: 9, borderRadius: 9, background: color, flex: 'none' }} />
    <span style={{ color: C.dim, fontWeight: 700, letterSpacing: '0.12em', fontSize: size * 0.86 }}>{kind}</span>
    <span>{text}</span>
  </div>
);

/** A real capture (transparent-cornered PNG) with soft depth. */
export const Shot: React.FC<{ src: string; w: number; x: number; y: number; glow?: string; style?: React.CSSProperties; crop?: { top: number; height: number } }> = ({ src, w, x, y, glow = C.mint, style, crop }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, filter: `drop-shadow(0 30px 60px rgba(0,0,0,0.65)) drop-shadow(0 0 70px ${glow}22)`, ...style }}>
    {crop ? (
      <div style={{ width: w, height: crop.height, overflow: 'hidden', borderRadius: 26 }}>
        <Img src={img(src)} style={{ width: w, display: 'block', marginTop: -crop.top }} />
      </div>
    ) : <Img src={img(src)} style={{ width: w, display: 'block' }} />}
  </div>
);

/** Header used by every gallery slide: lockup left, slide index right. */
export const Header: React.FC<{ n: number; total?: number }> = ({ n, total = 10 }) => (
  <>
    <Lockup h={40} style={{ position: 'absolute', left: 96, top: 78 }} />
    <div style={{ position: 'absolute', right: 96, top: 84, fontSize: 21, letterSpacing: '0.18em', color: C.faint, fontWeight: 600 }}>
      {String(n).padStart(2, '0')}<span style={{ opacity: 0.5 }}> / {String(total).padStart(2, '0')}</span>
    </div>
  </>
);

export const Num: React.FC<{ n: number | string; color?: string; size?: number }> = ({ n, color = C.mint, size = 44 }) => (
  <div style={{ width: size, height: size, borderRadius: size, border: `2px solid ${color}`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: 750, flex: 'none' }}>{n}</div>
);

export const Pill: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.mint, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderRadius: 40, border: `1.5px solid ${color}55`, background: `${color}12`, color, fontSize: 21, fontWeight: 650, ...style }}>{children}</div>
);
