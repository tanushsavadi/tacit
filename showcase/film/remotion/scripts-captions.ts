import { writeFileSync } from 'fs';
import { cuesFor } from './src/film';
import { devpostVO, devpostTV } from './src/devpost';
import { directorVO, directorTV } from './src/director';
import { judgingVO, judgingTV } from './src/judging';
const ts = (x: number) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(r).padStart(3,'0')}`; };
const out = process.argv[2];
for (const [name, vo, tv] of [['TACIT_Devpost_Demo_2m48s', devpostVO, devpostTV], ['TACIT_Directors_Cut_3m40s', directorVO, directorTV], ['TACIT_Judging_Cut', judgingVO, judgingTV]] as const) {
  const cues = cuesFor(vo as any, tv as any);
  writeFileSync(`${out}/${name}.srt`, cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
  writeFileSync(`${out}/${name}.vtt`, 'WEBVTT\n\n' + cues.map((c) => `${ts(c.start).replace(',', '.')} --> ${ts(c.end).replace(',', '.')}\n${c.text}\n`).join('\n'));
  console.log(name, cues.length, 'cues');
}
