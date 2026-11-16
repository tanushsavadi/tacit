import { writeFileSync } from 'fs';
import { SCRIPT, DUR, TV } from './src/film';
import { devpostScenes, devpostVO, devpostTV, DEVPOST_SECONDS } from './src/devpost';
import { directorScenes, directorVO, directorTV, DIRECTOR_SECONDS } from './src/director';
import { judgingScenes, judgingVO, judgingTV, JUDGING_SECONDS } from './src/judging';
const PROV: [RegExp, string][] = [
  [/^recognize|^hook/, 'REAL RECORDING (silent, no audio track) + verbatim RECOGNIZER OUTPUT'],
  [/^results/, 'RECOGNIZER OUTPUT (offline evaluator, recorded silent clips)'],
  [/^(phrases|realtime warning|my voice|help me respond)/, 'INTERFACE RENDER (offline fixture of the app’s own SwiftUI view; shows OFFLINE)'],
  [/^(workspace|edit|review speak|speaking|hold my turn|notch reveal)/, 'REAL CAPTURE (native TACIT app)'],
  [/^logo/, 'BRAND MOTION (docs/brand/motion, feat/brand-orb)'],
  [/^end/, 'BRAND GRAPHIC (Living Signal geometry, rendered programmatically)'],
  [/^architecture/, 'DIAGRAM (motion graphic)'],
  [/.*/, 'REAL RECORDING (founder’s own silent clip) + typography'],
];
const prov = (n: string) => PROV.find(([r]) => r.test(n))![1];
const tc = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
let md = '# TACIT — timecoded storyboards\n\nGenerated from the Remotion edit specs (`timeline/tacit-film/src/{devpost,director,judging}.tsx`). Times in m:ss.s.\n';
for (const [title, scenes, vo, tv, total] of [
  ['Film A — Devpost Demo (2:48)', devpostScenes, devpostVO, devpostTV, DEVPOST_SECONDS],
  ['Film B — Director’s Cut (3:40)', directorScenes, directorVO, directorTV, DIRECTOR_SECONDS],
  ['Film C — Judging Cut (1:15)', judgingScenes, judgingVO, judgingTV, JUDGING_SECONDS]] as const) {
  md += `\n## ${title}\n\nTotal ${total} s.\n\n| In | Out | Shot | Provenance |\n|---|---|---|---|\n`;
  for (const s of scenes) md += `| ${tc(s.at)} | ${tc(s.at + s.dur)} | ${s.name} | ${prov(s.name)} |\n`;
  md += `\n**Audio events**\n\n| In | Out | Track | Text |\n|---|---|---|---|\n`;
  const ev = [...vo.map((v) => ({ at: v.at, end: v.at + DUR[v.id], k: `Narration ${v.id}`, t: SCRIPT[v.id] })), ...tv.map((x) => ({ at: x.at, end: x.at + TV[x.id].dur, k: 'TACIT voice (macOS “Daniel”, re-rendered)', t: TV[x.id].text }))].sort((a, b) => a.at - b.at);
  for (const e of ev) md += `| ${tc(e.at)} | ${tc(e.end)} | ${e.k} | ${e.t} |\n`;
}
writeFileSync(process.argv[2], md);
