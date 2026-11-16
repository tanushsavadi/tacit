import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { C, H, Header, Kicker, Lockup, Mark, Num, P, Pill, Shot, Source, Stage, img } from './kit';

const TOTAL = 10;

/** Founder's face crop from a 1280×720 silent-recording frame. (cx, cy) = face centre, side = crop size in source px. */
const Face: React.FC<{ src: string; size: number; cx?: number; cy?: number; side?: number; radius?: number; style?: React.CSSProperties }> = ({ src, size, cx = 660, cy = 390, side = 600, radius = 28, style }) => {
  const k = size / side;
  return (
    <div style={{ width: size, height: size, overflow: 'hidden', borderRadius: radius, position: 'relative', background: '#000', flex: 'none', ...style }}>
      <Img src={img(src)} style={{ position: 'absolute', width: 1280 * k, left: -(cx - side / 2) * k, top: -(cy - side / 2) * k }} />
    </div>
  );
};

const Arrow: React.FC<{ x: number; y: number; w?: number; color?: string }> = ({ x, y, w = 40, color = C.mint }) => (
  <svg style={{ position: 'absolute', left: x, top: y - 12 }} width={w} height={24} viewBox={`0 0 ${w} 24`}>
    <path d={`M 2 12 L ${w - 4} 12 M ${w - 13} 4 L ${w - 4} 12 L ${w - 13} 20`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ───────────────────────────── 01 HERO ─────────────────────────────
export const Hero: React.FC = () => (
  <Stage glowX="70%" glowY="22%">
    {/* brand geometry as a quiet watermark */}
    <div style={{ position: 'absolute', left: 760, top: 40, opacity: 0.05 }}><Mark size={1020} dot="none" stroke={1.2} /></div>
    <Shot src="real-review-k.png" w={880} x={830} y={0} />
    <div style={{ position: 'absolute', left: 1120, top: 488, display: 'flex', alignItems: 'center', gap: 14, color: C.mint, fontSize: 22, fontWeight: 650, letterSpacing: '0.04em' }}>
      <svg width="18" height="40" viewBox="0 0 18 40"><path d="M9 2 L9 36 M2 29 L9 37 L16 29" stroke={C.mint} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      you press Speak
    </div>
    <Shot src="real-speaking-k.png" w={740} x={900} y={560} glow={C.mint} />
    <div style={{ position: 'absolute', left: 110, top: 250, width: 680 }}>
      <Lockup h={104} />
      <div style={{ marginTop: 74 }}>
        <H size={88} style={{ lineHeight: 1.06 }}>Your words.<br />Your voice.<br /><span style={{ color: C.mint }}>Beyond speech.</span></H>
      </div>
      <P size={29} style={{ marginTop: 40, width: 640 }}>
        Mouth your words to the camera. TACIT shows what it read, and speaks only what you approve — in the voice you choose, inside your call.
      </P>
      <div style={{ display: 'flex', gap: 12, marginTop: 40, flexWrap: 'wrap' }}>
        <Pill>Silent speech → voice</Pill><Pill>Review first</Pill><Pill>Native macOS</Pill>
      </div>
    </div>
    <Source kind="REAL CAPTURES" text="TACIT’s macOS notch: recognized words waiting for review, then speaking after Speak" style={{ left: 110, bottom: 62 }} />
  </Stage>
);

// ───────────────────────────── 02 SILENT → VOICE ─────────────────────────────
const Step: React.FC<{ n: number; x: number; title: string; body: string; children: React.ReactNode }> = ({ n, x, title, body, children }) => (
  <div style={{ position: 'absolute', left: x, top: 380, width: 372 }}>
    <div style={{ width: 372, height: 372, borderRadius: 28, overflow: 'hidden', position: 'relative', background: 'rgba(255,255,255,0.035)', border: `1.5px solid ${C.line}` }}>{children}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 34 }}>
      <Num n={n} size={46} />
      <div style={{ fontSize: 33, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
    </div>
    <P size={24} style={{ marginTop: 14, lineHeight: 1.38 }}>{body}</P>
  </div>
);

export const SilentToVoice: React.FC = () => {
  const xs = [96, 508, 920, 1332];
  return (
    <Stage glowX="50%" glowY="45%">
      <Header n={2} total={TOTAL} />
      <Kicker style={{ position: 'absolute', left: 96, top: 178 }}>How it works</Kicker>
      <H size={68} style={{ position: 'absolute', left: 96, top: 218 }}>Mouth the words. TACIT gives them a voice.</H>
      <Step n={1} x={xs[0]} title="Silent articulation" body="You mouth the words. No sound needed — TACIT reads your lips only.">
        <Face src="lights_2.5.png" size={372} radius={0} cx={660} cy={400} side={560} />
        <div style={{ position: 'absolute', left: 16, bottom: 16, fontSize: 16, fontWeight: 750, letterSpacing: '0.14em', color: C.paper, background: 'rgba(10,13,12,0.78)', padding: '8px 12px', borderRadius: 10 }}>VIDEO ONLY · NO AUDIO</div>
      </Step>
      <Step n={2} x={xs[1]} title="Visual recognition" body="A lip-reading model turns mouth movement into words, on your Mac.">
        <div style={{ display: 'flex', gap: 10, padding: '26px 26px 0' }}>
          {['lights_1.0.png', 'lights_2.5.png', 'lights_3.5.png'].map((f) => <Face key={f} src={f} size={98} radius={14} cx={655} cy={520} side={260} />)}
        </div>
        <div style={{ padding: '30px 28px 0' }}>
          <Kicker size={17}>Recognized</Kicker>
          <div style={{ fontSize: 40, fontWeight: 750, lineHeight: 1.1, marginTop: 14, letterSpacing: '-0.01em' }}>PLEASE TURN ON THE LIGHTS</div>
        </div>
      </Step>
      <Step n={3} x={xs[2]} title="You review" body="The words appear first. Speak them, or correct them. Nothing is said without you.">
        <div style={{ padding: '44px 30px 0' }}>
          <div style={{ fontSize: 17, color: C.faint, fontWeight: 700, letterSpacing: '0.16em' }}>SHOWN TO YOU FIRST</div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.14, marginTop: 16 }}>PLEASE TURN ON THE LIGHTS</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 52 }}>
            <div style={{ padding: '14px 24px', borderRadius: 40, border: `1.5px solid ${C.line}`, fontSize: 24, fontWeight: 650, color: C.paper }}>Edit</div>
            <div style={{ padding: '14px 26px', borderRadius: 40, border: `2px solid ${C.mint}`, fontSize: 24, fontWeight: 700, color: C.mint }}>Speak ↑</div>
          </div>
        </div>
      </Step>
      <Step n={4} x={xs[3]} title="Your chosen voice" body="Spoken once, in the voice you picked, into a virtual mic your call app can use.">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginLeft: -30 }}><Mark size={170} arcs /></div>
          <div style={{ marginTop: 36, fontSize: 22, color: C.dim, fontWeight: 550 }}>your words · your voice</div>
        </AbsoluteFill>
      </Step>
      {[0, 1, 2].map((i) => <Arrow key={i} x={xs[i] + 372 + 2} y={566} w={36} />)}
      <Source kind="REAL RECORDING" text="Founder’s silent clip “please turn on the lights” (video only). Recognized offline by Auto-AVSR (visual-only): exact on this clip — one example, not an accuracy rate." style={{ left: 96, bottom: 58, width: 1608 }} size={18} />
    </Stage>
  );
};

// ───────────────────────────── 03 REVIEW FIRST ─────────────────────────────
export const ReviewFirst: React.FC = () => (
  <Stage glowX="72%" glowY="45%">
    <Header n={3} total={TOTAL} />
    <div style={{ position: 'absolute', left: 96, top: 250, width: 720 }}>
      <Kicker>Review first</Kicker>
      <H size={86} style={{ marginTop: 22 }}>Your words.<br />Your decision.</H>
      <P size={28} style={{ marginTop: 34 }}>
        Lip reading can be wrong. TACIT shows the recognized words first and speaks nothing until you press Speak.
      </P>
      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {[
          ['Shown to you, never sent on its own'],
          ['Corrected by you — never rewritten by AI'],
          ['One tap on Speak sends exactly what you see'],
        ].map(([t], i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Num n={i + 1} size={44} />
            <div style={{ fontSize: 28, fontWeight: 620, color: C.paper }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
    <Shot src="real-review-k.png" w={760} x={950} y={110} />
    <div style={{ position: 'absolute', left: 880, top: 160 }}><Num n={1} size={44} /></div>
    <Shot src="real-edit-k.png" w={760} x={950} y={580} crop={{ top: 0, height: 470 }} />
    <div style={{ position: 'absolute', left: 880, top: 790 }}><Num n={2} size={44} /></div>
    <div style={{ position: 'absolute', left: 880, top: 960 }}><Num n={3} size={44} /></div>
    <Source kind="REAL CAPTURES" text="TACIT’s macOS notch: words from a genuine silent recording, then the user’s own correction" style={{ left: 96, bottom: 58 }} />
  </Stage>
);

// ───────────────────────────── 04 LIVING NOTCH ─────────────────────────────
const Label: React.FC<{ k: string; t: string; style?: React.CSSProperties }> = ({ k, t, style }) => (
  <div style={{ position: 'absolute', display: 'flex', alignItems: 'baseline', gap: 16, ...style }}>
    <Kicker size={20}>{k}</Kicker>
    <div style={{ fontSize: 24, color: C.dim, fontWeight: 500 }}>{t}</div>
  </div>
);

export const LivingNotch: React.FC = () => (
  <Stage glowX="50%" glowY="25%">
    <Header n={4} total={TOTAL} />
    <Kicker style={{ position: 'absolute', left: 96, top: 178 }}>The Living Notch</Kicker>
    <H size={68} style={{ position: 'absolute', left: 96, top: 218 }}>Lives in your Mac’s notch.</H>
    <P size={28} style={{ position: 'absolute', left: 96, top: 306, width: 1400 }}>Always one glance away, never in the way — and Pause or Stop is always one tap from anywhere.</P>
    <Label k="Compact" t="sits in the notch band" style={{ left: 96, top: 412 }} />
    <div style={{ position: 'absolute', left: 96, top: 456, width: 1608, height: 118, overflow: 'hidden', borderRadius: 18, border: `1px solid ${C.line}` }}>
      <Img src={img('01-compact-in-notch-context.png')} style={{ width: 1608, display: 'block', marginTop: -2 }} />
    </div>
    <Label k="Peek" t="hover — words ready" style={{ left: 150, top: 622 }} />
    <Shot src="real-review-k.png" w={660} x={150} y={672} />
    <Label k="Expanded" t="click — the full workspace" style={{ left: 1010, top: 622 }} />
    <Shot src="03-expanded-home.png" w={560} x={1010} y={672} />
    <Source kind="REAL CAPTURES" text="native macOS app on a notched MacBook — compact band, hover Peek, expanded workspace" style={{ left: 96, bottom: 58 }} />
  </Stage>
);

// ───────────────────────────── 05 MY VOICE ─────────────────────────────
export const MyVoice: React.FC = () => (
  <Stage glowX="72%" glowY="50%">
    <Header n={5} total={TOTAL} />
    <div style={{ position: 'absolute', left: 96, top: 270, width: 700 }}>
      <Kicker>My Voice</Kicker>
      <H size={82} style={{ marginTop: 22 }}>The voice that<br />speaks for you.</H>
      <P size={28} style={{ marginTop: 34 }}>
        Choose any voice installed on your Mac, preview it privately, and tune speed and pitch. Every word you approve is spoken in it.
      </P>
      <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
        <Pill>Saved on this Mac</Pill><Pill>Previews never reach the call</Pill>
      </div>
      <P size={21} style={{ marginTop: 40, color: C.faint, width: 640 }}>
        Uses synthetic voices installed on macOS. TACIT does not recreate anyone’s natural voice.
      </P>
    </div>
    <Shot src="voice.png" w={860} x={850} y={232} />
    <Source kind="INTERFACE RENDER" text="the app’s own My Voice screen, rendered with offline test data (the UI reads OFFLINE)" color={C.faint} style={{ left: 96, bottom: 58 }} />
  </Stage>
);

// ───────────────────────────── 06 HOLD MY TURN ─────────────────────────────
export const HoldMyTurn: React.FC = () => {
  const k = 774 / 480; // zoom on the real bottom bar of real-edit (x 40..520, y 610..705)
  return (
    <Stage glowX="72%" glowY="40%">
      <Header n={6} total={TOTAL} />
      <div style={{ position: 'absolute', left: 96, top: 270, width: 720 }}>
        <Kicker>Stay in the conversation</Kicker>
        <H size={80} style={{ marginTop: 22 }}>Hold your turn<br />while you compose.</H>
        <P size={28} style={{ marginTop: 34 }}>
          Silent speech takes a moment. One tap on Hold my turn speaks your hold phrase, so you keep your place. Saved phrases cover the quick replies.
        </P>
      </div>
      <div style={{ position: 'absolute', left: 930, top: 150, width: 774, height: 153, overflow: 'hidden', borderRadius: 24, background: '#000', boxShadow: `0 30px 60px rgba(0,0,0,0.6), 0 0 70px ${C.mint}22` }}>
        <Img src={img('real-edit-k.png')} style={{ position: 'absolute', width: 920 * k, left: -40 * k, top: -610 * k }} />
      </div>
      <div style={{ position: 'absolute', left: 930, top: 340, width: 774, padding: '30px 36px', borderRadius: 24, background: 'rgba(98,227,196,0.07)', border: `1.5px solid ${C.mint}44` }}>
        <Kicker size={17}>Your hold phrase · spoken in your voice</Kicker>
        <div style={{ fontSize: 46, fontWeight: 680, marginTop: 16, letterSpacing: '-0.02em' }}>“One moment, I’m responding.”</div>
        <div style={{ fontSize: 21, color: C.dim, marginTop: 14 }}>Default wording — editable · shortcut ⌃⇧⌘H</div>
      </div>
      <Kicker size={18} color={C.dim} style={{ position: 'absolute', left: 930, top: 590 }}>Express yourself · saved phrases</Kicker>
      <div style={{ position: 'absolute', left: 930, top: 630, width: 774, height: 326, overflow: 'hidden', borderRadius: 24, background: '#000', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }}>
        <Img src={img('phrases.png')} style={{ position: 'absolute', width: 920 * 0.9, left: -32 * 0.9, top: -205 * 0.9 }} />
      </div>
      <Source kind="REAL CAPTURE + INTERFACE RENDER" text="Hold my turn bar from the native app · saved phrases rendered with offline test data" style={{ left: 96, bottom: 58 }} />
    </Stage>
  );
};

// ───────────────────────────── 07 HELP ME RESPOND ─────────────────────────────
export const HelpMeRespond: React.FC = () => {
  const w = 720; const k = w / 888;
  const items: [string, string, string, number, number][] = [
    ['intent-sample', 'They said — typed or pasted by you', 'Pick your move', 36, 364],
    ['point', 'Add your own point', 'Your opinion, in a few words', 124, 266],
    ['draft', 'Edit the suggested wording', 'Then press Speak — or don’t', 124, 266],
  ];
  const tops: number[] = []; { let t = 150; for (const it of items) { tops.push(t); t += 40 + it[4] * k + 34; } }
  return (
    <Stage glowX="72%" glowY="50%">
      <Header n={7} total={TOTAL} />
      <div style={{ position: 'absolute', left: 96, top: 230, width: 700 }}>
        <Kicker>Help Me Respond · Gemini</Kicker>
        <H size={70} style={{ marginTop: 22 }}>AI helps you say it.<br /><span style={{ color: C.mint }}>You decide what you think.</span></H>
        <P size={27} style={{ marginTop: 32 }}>
          Paste what was said, choose your move, add your point. Google Gemini suggests wording you can edit — nothing is spoken until you press Speak.
        </P>
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['Context only from what you type or paste', 'No meeting listening or capture', 'Opinions come from you — never invented'].map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: C.paper, fontWeight: 560 }}>
              <span style={{ width: 10, height: 10, borderRadius: 10, background: C.mint }} />{t}
            </div>
          ))}
        </div>
      </div>
      {items.map(([f, t, sub, cy, ch], i) => {
        const top = tops[i];
        return (
          <React.Fragment key={f}>
            <div style={{ position: 'absolute', left: 984, top: top - 2, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ color: C.mint, fontWeight: 750, fontSize: 19, letterSpacing: '0.12em' }}>0{i + 1}</span>
              <span style={{ fontSize: 21, fontWeight: 650, color: C.paper }}>{t}</span>
              <span style={{ fontSize: 19, color: C.faint }}>· {sub}</span>
            </div>
            <div style={{ position: 'absolute', left: 966, top: top + 40, width: w - 4, height: ch * k, overflow: 'hidden', borderRadius: 22, background: '#000', border: `1px solid ${C.line}`, boxShadow: '0 24px 50px rgba(0,0,0,0.55)' }}>
              <Img src={img(`presence/404x196-${f}.png`)} style={{ position: 'absolute', width: 888 * k, left: -22 * k, top: -(cy - 12) * k }} />
            </div>
          </React.Fragment>
        );
      })}
      <Source kind="INTERFACE RENDER" text="the app’s own Help Me Respond views, rendered offline with a SAMPLE question and fixture wording (labelled in the UI) — not live AI output" color={C.faint} style={{ left: 96, bottom: 58, width: 1608 }} size={18} />
    </Stage>
  );
};

// ───────────────────────────── 08 ARCHITECTURE ─────────────────────────────
export const Architecture: React.FC = () => {
  const nodes: [string, string, string][] = [
    ['Mac camera', 'your lips, video only', 'Swift app'],
    ['Lip tracking', 'Apple Vision, on device', 'Swift app'],
    ['Lip reading', 'Auto-AVSR model, runs locally', 'Python'],
    ['You approve', 'Speak · Edit · Stop', 'notch UI'],
    ['Voice', 'macOS voice or ElevenLabs', 'Node.js server'],
    ['Virtual mic', 'BlackHole → your call app', 'Swift router'],
  ];
  const W = 244; const G = 29; const X0 = 96; const Y = 390; const NH = 250;
  return (
    <Stage glowX="50%" glowY="40%">
      <Header n={8} total={TOTAL} />
      <Kicker style={{ position: 'absolute', left: 96, top: 178 }}>Under the hood</Kicker>
      <H size={66} style={{ position: 'absolute', left: 96, top: 218 }}>From silent lips to a call microphone.</H>
      {nodes.map(([t, sub, tech], i) => {
        const you = i === 3;
        return (
          <div key={t} style={{
            position: 'absolute', left: X0 + i * (W + G), top: Y, width: W, height: NH, borderRadius: 26, boxSizing: 'border-box',
            border: `${you ? 2.5 : 1.5}px solid ${you ? C.mint : 'rgba(244,247,246,0.16)'}`, background: you ? `${C.mint}14` : 'rgba(255,255,255,0.035)',
            padding: '26px 24px', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 18, color: C.mint, fontWeight: 750, letterSpacing: '0.16em' }}>0{i + 1}</div>
            <div style={{ fontSize: 31, fontWeight: 720, marginTop: 16, letterSpacing: '-0.02em', lineHeight: 1.08 }}>{t}</div>
            <div style={{ fontSize: 21, color: C.dim, marginTop: 12, lineHeight: 1.3 }}>{sub}</div>
            <div style={{ marginTop: 'auto', fontSize: 16, color: C.faint, fontWeight: 650, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tech}</div>
          </div>
        );
      })}
      {nodes.slice(1).map((_, i) => <Arrow key={i} x={X0 + (i + 1) * (W + G) - G + 1} y={Y + NH / 2} w={G - 2} color={i === 2 ? C.mint : 'rgba(244,247,246,0.45)'} />)}
      {/* brackets */}
      {[[0, 2, 'Silent speech recognition — on your Mac'], [4, 5, 'Your words, into the call']].map(([a, b, t]) => {
        const x = X0 + (a as number) * (W + G); const w = ((b as number) - (a as number) + 1) * W + ((b as number) - (a as number)) * G;
        return (
          <div key={t as string} style={{ position: 'absolute', left: x, top: Y + NH + 24, width: w }}>
            <div style={{ height: 14, borderLeft: `2px solid ${C.line}`, borderRight: `2px solid ${C.line}`, borderBottom: `2px solid ${C.line}`, borderRadius: '0 0 10px 10px' }} />
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 21, color: C.dim, fontWeight: 600 }}>{t}</div>
          </div>
        );
      })}
      {/* typed / phrases / Help Me Respond also end at the same approval */}
      <div style={{ position: 'absolute', left: X0 + 3 * (W + G) + W / 2 - 1, top: Y + NH, width: 2, height: 96, background: `repeating-linear-gradient(180deg, ${C.mint} 0 8px, transparent 8px 14px)` }} />
      <div style={{ position: 'absolute', left: X0 + 3 * (W + G) - 120, top: Y + NH + 96, width: W + 240, padding: '18px 20px', borderRadius: 20, border: `1.5px dashed ${C.mint}66`, textAlign: 'center', fontSize: 21, color: C.paper, fontWeight: 600, boxSizing: 'border-box', background: C.ink }}>
        Or type · saved phrases · Help Me Respond <span style={{ color: C.mint }}>(Google Gemini)</span>
      </div>
      <div style={{ position: 'absolute', left: 96, top: 930, width: 1608, padding: '26px 34px', borderRadius: 22, background: 'rgba(98,227,196,0.07)', border: `1.5px solid ${C.mint}44`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 22 }}>
        <Mark size={40} />
        <div style={{ fontSize: 26, fontWeight: 620 }}>Nothing reaches the call unless you press Speak — or explicitly turn on Real-time. <span style={{ color: C.dim, fontWeight: 500 }}>Pause and Stop cancel queued and playing audio.</span></div>
      </div>
      <Source kind="DIAGRAM" text="components as implemented in the TACIT repository · tested with Google Meet using BlackHole 16ch · no accuracy or latency figures implied" color={C.faint} style={{ left: 96, bottom: 58 }} size={18} />
    </Stage>
  );
};

// ───────────────────────────── 09 REAL RESULTS ─────────────────────────────
export const RealResults: React.FC = () => {
  const rows: { f: string; cx: number; cy: number; ref: string; hyp: string; ok: boolean; bad?: string }[] = [
    { f: 'r_lights.png', cx: 660, cy: 400, ref: 'please turn on the lights', hyp: 'PLEASE TURN ON THE LIGHTS', ok: true },
    { f: 'r_water.png', cx: 660, cy: 400, ref: 'I would like some water please', hyp: 'I WOULD LIKE SOME WATER PLEASE', ok: true },
    { f: 'r_understand.png', cx: 660, cy: 400, ref: 'I don’t understand', hyp: 'I DONT UNDERSTAND', ok: true },
    { f: 'r_mother.png', cx: 660, cy: 410, ref: 'can you call my mother', hyp: 'CAN YOU CALL MY MOTHER', ok: true },
    { f: 'r_howareyou.png', cx: 660, cy: 410, ref: 'how are you doing', hyp: 'HOW ARE YOU GOING', ok: false, bad: 'GOING' },
  ];
  return (
    <Stage glowX="60%" glowY="50%">
      <Header n={9} total={TOTAL} />
      <Kicker style={{ position: 'absolute', left: 96, top: 178 }}>Real results, unedited</Kicker>
      <H size={66} style={{ position: 'absolute', left: 96, top: 218 }}>What TACIT read from silent lips.</H>
      <div style={{ position: 'absolute', left: 96, top: 330, width: 1608 }}>
        <div style={{ display: 'flex', fontSize: 17, color: C.faint, fontWeight: 700, letterSpacing: '0.16em', padding: '0 0 14px 0', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ width: 150 }}>CLIP</div><div style={{ width: 520 }}>MOUTHED SILENTLY</div><div style={{ width: 720 }}>RECOGNIZED (VERBATIM)</div><div>RESULT</div>
        </div>
        {rows.map((r) => (
          <div key={r.f} style={{ display: 'flex', alignItems: 'center', height: 134, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 150, flex: 'none' }}><Face src={r.f} size={104} radius={16} cx={r.cx} cy={r.cy} side={520} /></div>
            <div style={{ width: 520, flex: 'none', fontSize: 28, color: C.dim, fontStyle: 'italic' }}>“{r.ref}”</div>
            <div style={{ width: 720, flex: 'none', fontSize: 34, fontWeight: 720, letterSpacing: '-0.005em' }}>
              {r.hyp.split(' ').map((w, i) => <span key={i} style={w === r.bad ? { color: C.amber, textDecoration: 'underline', textDecorationThickness: 4, textUnderlineOffset: 8 } : undefined}>{w}{' '}</span>)}
            </div>
            <div>{r.ok ? <Pill>Exact</Pill> : <Pill color={C.amber}>1 word wrong</Pill>}</div>
          </div>
        ))}
      </div>
      <Source kind="REAL RECORDINGS" text="founder’s own silent clips, video only · offline Auto-AVSR (visual-only), outputs verbatim · hand-picked: many other clips are misread · not an accuracy rate" style={{ left: 96, bottom: 58, width: 1608 }} size={18} />
    </Stage>
  );
};

// ───────────────────────────── 10 TWO MODES ─────────────────────────────
export const TwoModes: React.FC = () => (
  <Stage glowX="30%" glowY="55%">
    <Header n={10} total={TOTAL} />
    <Kicker style={{ position: 'absolute', left: 96, top: 178 }}>Two ways to speak</Kicker>
    <H size={66} style={{ position: 'absolute', left: 96, top: 218 }}>Review is the default. Real-time is your call.</H>
    <div style={{ position: 'absolute', left: 96, top: 360, width: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Kicker size={21}>Review first</Kicker><span style={{ fontSize: 21, color: C.faint }}>· default</span></div>
      <P size={25} style={{ marginTop: 12 }}>You see the words and press Speak.</P>
    </div>
    <Shot src="real-review-k.png" w={760} x={96} y={500} />
    <div style={{ position: 'absolute', left: 940, top: 360, width: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Kicker size={21} color={C.amber}>Real-time</Kicker><span style={{ fontSize: 21, color: C.faint }}>· experimental, opt-in each session</span></div>
      <P size={25} style={{ marginTop: 12 }}>Spoken unreviewed — only after this warning.</P>
    </div>
    <Shot src="realtime-confirm.png" w={700} x={970} y={480} glow={C.amber} />
    <Source kind="REAL CAPTURE + INTERFACE RENDER" text="left: native notch capture · right: the app’s own Real-time confirmation, offline test data (reads OFFLINE)" style={{ left: 96, bottom: 58 }} size={18} />
  </Stage>
);

// ───────────────────────────── VIDEO THUMBNAIL 1280×720 ─────────────────────────────
export const Thumbnail: React.FC = () => (
  <Stage glowX="78%" glowY="30%" w={1280}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: 720, overflow: 'hidden' }}>
      <Img src={img('lights_2.5.png')} style={{ position: 'absolute', height: 900, left: -537, top: -235 }} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, transparent 55%, ${C.ink} 99%), linear-gradient(0deg, ${C.ink}cc 0%, transparent 35%)` }} />
    </div>
    <div style={{ position: 'absolute', left: 40, bottom: 40, padding: '14px 20px', borderRadius: 16, background: 'rgba(10,13,12,0.86)', border: `1.5px solid ${C.mint}66` }}>
      <div style={{ fontSize: 15, letterSpacing: '0.16em', fontWeight: 750, color: C.mint }}>READ FROM SILENT LIPS</div>
      <div style={{ fontSize: 30, fontWeight: 750, marginTop: 6 }}>PLEASE TURN ON THE LIGHTS</div>
    </div>
    <div style={{ position: 'absolute', left: 620, top: 92, width: 620 }}>
      <Lockup h={70} />
      <div style={{ marginTop: 48, fontSize: 82, fontWeight: 760, letterSpacing: '-0.035em', lineHeight: 1.0 }}>
        Turning silent<br />articulation<br /><span style={{ color: C.mint }}>into speech.</span>
      </div>
      <div style={{ marginTop: 36, fontSize: 27, color: C.dim, fontWeight: 520 }}>Your words. Your voice. Beyond speech.</div>
    </div>
  </Stage>
);

// ───────────────────────────── SOCIAL 1200×630 ─────────────────────────────
export const Social: React.FC = () => (
  <Stage glowX="74%" glowY="20%" w={1200}>
    <Shot src="real-review-k.png" w={560} x={600} y={0} />
    <div style={{ position: 'absolute', left: 660, top: 330, opacity: 0.9 }}>
      <Shot src="real-speaking-k.png" w={480} x={0} y={0} />
    </div>
    <div style={{ position: 'absolute', left: 70, top: 120, width: 500 }}>
      <Lockup h={70} />
      <div style={{ marginTop: 46, fontSize: 58, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.06 }}>Your words.<br />Your voice.<br /><span style={{ color: C.mint }}>Beyond speech.</span></div>
      <div style={{ marginTop: 26, fontSize: 21, color: C.dim, lineHeight: 1.4 }}>Silent speech → voice for people who can’t speak aloud. Native macOS · review first.</div>
    </div>
  </Stage>
);
