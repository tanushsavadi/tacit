import { writeFileSync } from 'fs';
import { SCRIPT, DUR, TV } from './src/film';
import { devpostVO, devpostTV } from './src/devpost';
import { directorVO, directorTV } from './src/director';
import { judgingVO, judgingTV } from './src/judging';
const tc = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
let md = '# Narration scripts (final, as recorded)\n\nNarrator: ElevenLabs stock voice “Will” (synthetic; credited). TACIT voice lines: macOS “Daniel”, the app’s default output voice, re-rendered for the film. Text below is exactly what was synthesized.\n';
for (const [t, vo, tv] of [['Film A — Devpost Demo (2:48)', devpostVO, devpostTV], ['Film B — Director’s Cut (3:40)', directorVO, directorTV], ['Film C — Judging Cut (1:15)', judgingVO, judgingTV]] as const) {
  md += `\n## ${t}\n\n`;
  const ev = [...vo.map((v) => ({ at: v.at, s: `**${tc(v.at)}** (${DUR[v.id].toFixed(1)} s, ${v.id}) ${SCRIPT[v.id]}` })), ...tv.map((x) => ({ at: x.at, s: `**${tc(x.at)}** *TACIT voice:* “${TV[x.id].text}”` }))].sort((a, b) => a.at - b.at);
  md += ev.map((e) => e.s).join('\n\n') + '\n';
}
writeFileSync(process.argv[2], md);
