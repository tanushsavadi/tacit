import { readFileSync } from 'node:fs';
import net from 'node:net';
import { fixturesSchema } from './provider.ts';
fixturesSchema.parse(JSON.parse(readFileSync(new URL('../demo/flow/scenarios.json',import.meta.url),'utf8')));
for(const port of [19890,19892])await new Promise<void>((r,j)=>{const s=net.createServer();s.once('error',()=>j(Error(`Demo port ${port} is occupied; no process was stopped`)));s.listen(port,'127.0.0.1',()=>s.close(()=>r()));});
console.log('✓ Dependencies · typed fixtures A/B/C · isolated ports free');
