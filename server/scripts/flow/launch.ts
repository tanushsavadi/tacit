/** Foreground candidate supervisor: distinct ports, own secrets, no stable launcher/restart/Git/device writes. */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import net from 'node:net';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=process.env.TACIT_FLOW_SOURCE_ROOT;
if(!source)throw Error('Set TACIT_FLOW_SOURCE_ROOT to the stable checkout for read-only local model/config references.');
const externalEnv=resolve(source,'server/.env');if(existsSync(externalEnv))process.loadEnvFile(externalEnv);
for(const port of [18890,18892,18766])await new Promise<void>((r,j)=>{const s=net.createServer();s.once('error',()=>j(Error(`Candidate port ${port} is occupied; no process was stopped.`)));s.listen(port,'127.0.0.1',()=>s.close(()=>r()));});
const children:ReturnType<typeof spawn>[]=[];
const stop=()=>{for(const p of children)p.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',stop);
const model=process.env.WHISPER_MODEL??resolve(source,'server/models/ggml-base.en.bin');
if(!existsSync(model))throw Error('Local whisper model unavailable; no cloud fallback.');
// In-memory WAV requests, no --convert; suppress decoder stdout/stderr which may contain transcribed content.
const whisper=spawn(process.env.WHISPER_SERVER_BIN??'whisper-server',['-m',model,'--host','127.0.0.1','--port','18766','-l','en','-nt','-ng','-t','4'],{stdio:'ignore'});children.push(whisper);
let ready=false;
for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:18766',{signal:AbortSignal.timeout(300)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
if(!ready){stop();throw Error('Candidate local whisper-server did not become ready.');}
const output=process.argv.includes('--with-output');
const env:NodeJS.ProcessEnv={...process.env,PORT:'18890',TACIT_HOST:'127.0.0.1',TACIT_FLOW:'1',TACIT_FLOW_PORT:'18892',TACIT_FLOW_STT_URL:'http://127.0.0.1:18766',
  TACIT_AUTH:'on',PUBLIC_URL:'',TACIT_LOG_TURNS:'off',RECOGNITION_AUTOSTART:'off',RECOGNITION_URL:process.env.RECOGNITION_URL??'http://127.0.0.1:8765',
  WHISPER_SERVER:'off',TACIT_ROUTE:output?'on':'off',TACIT_REALTIME:'off'};
// New candidate credentials are generated in candidate/server/data, never copied from the stable checkout.
delete env.TACIT_USER_TOKEN;delete env.TACIT_CALLER_TOKEN;
const server=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:resolve(root,'server'),env,stdio:['ignore','ignore','ignore']});children.push(server);
server.on('error',()=>{console.error('Candidate server failed to start.');stop();process.exitCode=1;});
server.on('exit',()=>{stop();});
whisper.on('error',()=>{console.error('Local STT unavailable. Stop candidate and retry.');stop();process.exitCode=1;});
whisper.on('exit',()=>{server.kill();});
for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:18890/api/health',{signal:AbortSignal.timeout(300)});if(r.ok){console.log('Flow candidate ready: native :18890, capture :18892, local STT :18766. Capture OFF until consent.');console.log(output?'Output route enabled; user must still enable voice and press Speak.':'Output disabled. Use --with-output only for a deliberate candidate audio test.');break;}}catch{}await new Promise(r=>setTimeout(r,200));}
// Do not open the app automatically. The user decides when to inspect the separately named candidate.
