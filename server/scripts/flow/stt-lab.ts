import {fileURLToPath} from 'node:url';
/** Synthetic local TTS -> real local whisper-server. No speakers, microphone, meeting or Gemini audio. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {localWhisper} from '../../src/flow/transcription.ts';
const run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'tacit-flow-synthetic-'));
const model=process.env.WHISPER_MODEL;
if(!model)throw Error('Set WHISPER_MODEL to the local model path (no model copied).');
const child=spawn('whisper-server',['-m',model,'--host','127.0.0.1','--port','18766','-l','en','-nt','-ng','-t','4'],{stdio:'ignore'});
const evidence:Record<string,unknown>={at:new Date().toISOString(),scope:'Synthetic local speech files -> actual persistent whisper-server. NOT live Meet transcription.'};
let started=false;
try{
  for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:18766',{signal:AbortSignal.timeout(300)});if(r.ok){started=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!started)throw Error('Local STT failed to start');
  const decode=localWhisper('http://127.0.0.1:18766'),results=[];
  for(const [i,reference]of ['Could we meet Thursday at four?','Actually, I meant Thursday at five.','The banner budget has increased to sixty dollars.'].entries()){
    const aiff=join(dir,`${i}.aiff`),raw=join(dir,`${i}.pcm`);
    await run('/usr/bin/say',['-v','Samantha','-o',aiff,reference]);
    await run('ffmpeg',['-hide_banner','-loglevel','error','-i',aiff,'-ar','16000','-ac','1','-f','s16le',raw]);
    const b=await readFile(raw),pcm=new Int16Array(b.length/2);for(let j=0;j<pcm.length;j++)pcm[j]=b.readInt16LE(j*2);
    const start=Date.now(),text=await decode(pcm,AbortSignal.timeout(8000));pcm.fill(0);
    results.push({reference,text,decodeMs:Date.now()-start,audioSeconds:b.length/32000});
  }
  evidence.results=results;
}catch(e){evidence.error=(e as Error).message;}
finally{
  child.kill();await rm(dir,{recursive:true,force:true});const out=fileURLToPath(new URL('../../../../evidence/',import.meta.url));await mkdir(out,{recursive:true});await writeFile(resolve(out,'local-stt-lab.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
