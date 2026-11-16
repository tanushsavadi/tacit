import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { WebSocket } from 'ws';
import { fixturesSchema } from './provider.ts';
import { DemoService } from './service.ts';
import { mockSpeechServer } from './mock-speech.ts';
import { loadSecrets } from '../candidate/server/src/auth.ts';
import { geminiModel } from '../candidate/server/src/flow/semantic.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.TACIT_FLOW_SOURCE_ROOT??"/Users/tanushsavadi/Documents/Hackathons/HackUMass 26'";
if(existsSync(resolve(source,'server/.env')))process.loadEnvFile(resolve(source,'server/.env'));
const fixtures=fixturesSchema.parse(JSON.parse(readFileSync(resolve(root,'demo/flow/scenarios.json'),'utf8')));
for(const port of [19890,19892])await new Promise<void>((r,j)=>{const s=net.createServer();s.once('error',()=>j(Error(`Port ${port} occupied. No process was stopped.`)));s.listen(port,'127.0.0.1',()=>s.close(()=>r()));});
const withOutput=process.argv.includes('--with-output');
const localOutput=process.argv.includes('--local-output');
if(withOutput&&localOutput)throw Error('Choose one audio route.');
let localDevice:string|undefined;
if(localOutput){const inventory=JSON.parse(execFileSync(resolve(root,'candidate/macos/TacitRoute/.build/release/tacit-route'),['list'],{encoding:'utf8'}));const dev=inventory.devices.find((d:any)=>d.uid===inventory.defaultOutput&&d.outputChannels>0&&['built-in','usb','bluetooth'].includes(d.transport));if(!dev)throw Error('No physical default output suitable for local rehearsal. No audio settings changed.');localDevice=dev.uid;}

if(withOutput){try{execFileSync('pgrep',['-f','tacit-route serve'],{stdio:'ignore'});throw Error('A speech router already exists. Close the other runtime yourself before starting --with-output.');}catch(e){if((e as {status?:number}).status!==1)throw e;}}
const data=resolve(root,'data');mkdirSync(data,{recursive:true,mode:0o700});
const env:NodeJS.ProcessEnv={...process.env,PORT:'19890',TACIT_HOST:'127.0.0.1',TACIT_FLOW:'0',TACIT_AUTH:'on',PUBLIC_URL:'',TACIT_LOG_TURNS:'off',RECOGNITION_AUTOSTART:'off',RECOGNITION_URL:'http://127.0.0.1:19995',WHISPER_SERVER:'off',TACIT_ROUTE:withOutput||localOutput?'on':'off',TACIT_REALTIME:'off'};
if(localOutput){env.TACIT_ROUTE_DEVICE_UID=localDevice;env.TACIT_ROUTE_GAIN_DB='0';}
delete env.TACIT_USER_TOKEN;delete env.TACIT_CALLER_TOKEN;
// Owner-managed code is an unchanged snapshot. Its output authorization is used verbatim.
const mock=process.argv.includes('--mock-speech');
const mockToken=mock?loadSecrets(resolve(root,'candidate/server/data/secrets.json')).userToken:null;
const mockServer=mock?await mockSpeechServer(mockToken!):null;
const server=mock?null:spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:resolve(root,'candidate/server'),env,stdio:'ignore'});
let service:DemoService|undefined,observer:WebSocket|undefined,app:ReturnType<typeof spawn>|undefined,stopping=false;
const pidFile=resolve(data,'processes.json');
async function stop(){if(stopping)return;stopping=true;observer?.send(JSON.stringify({type:'output_control',action:'stop'}));await service?.close();observer?.close();app?.kill('SIGTERM');server?.kill('SIGTERM');await mockServer?.close();try{unlinkSync(pidFile);}catch{}setTimeout(()=>process.exit(0),200);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());server?.on('exit',()=>{if(!stopping)void stop();});
server?.on('error',()=>{console.error('Demo backend failed to launch');void stop();});
let ready=false;for(let i=0;i<120;i++){try{const r=await fetch('http://127.0.0.1:19890/api/health',{signal:AbortSignal.timeout(300)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}
if(!ready){await stop();throw Error('Demo backend did not become ready.');}
const token=mockToken??JSON.parse(readFileSync(resolve(root,'candidate/server/data/secrets.json'),'utf8')).userToken as string;
observer=new WebSocket(`ws://127.0.0.1:19890/ws?token=${encodeURIComponent(token)}`);
await new Promise<void>((r,j)=>{observer!.once('open',r);observer!.once('error',j);});
service=new DemoService(token,fixtures,process.env.GEMINI_API_KEY?geminiModel(process.env.GEMINI_API_KEY,process.env.TACIT_FLOW_MODEL??'gemini-3.5-flash-lite'):null,()=>{if(observer?.readyState===WebSocket.OPEN)observer.send(JSON.stringify({type:'output_control',action:'stop'}));});
const speechEpochs=new Map<string,number>();
observer.on('message',raw=>{try{const m=JSON.parse(raw.toString());if(m.type!=='speech_delivery'||!service)return;const d=m.delivery,p=service.provider;
 if(d.state==='queued'&&p.running){speechEpochs.set(d.requestId,p.state.epoch);if(speechEpochs.size>32)speechEpochs.delete(speechEpochs.keys().next().value!);}
 if(d.state==='rendered'&&p.running&&speechEpochs.get(d.requestId)===p.state.epoch){p.lastOutgoing={text:d.text,requestId:d.requestId,state:'rendered'};service.notify();}
 if(['rendered','failed','refused','interrupted'].includes(d.state))speechEpochs.delete(d.requestId);
}catch{}});
service.provider.audioMode=mock?'mock':localOutput?'local':withOutput?'blackhole':'off';
await service.listen();
writeFileSync(pidFile,JSON.stringify({supervisor:process.pid,server:server?.pid,root,withOutput}),{mode:0o600});
if(!process.argv.includes('--no-app')){const binary=resolve(root,'candidate/macos/TacitCompanion/.build/TACIT Flow Demo.app/Contents/MacOS/TacitCompanion');if(!existsSync(binary)){await stop();throw Error('Build the demo app first.');}app=spawn(binary,[],{env:{...process.env,TACIT_FLOW_PORT:'19892'},stdio:'ignore'});app.on('error',()=>{console.error('Native demo failed to launch');void stop();});writeFileSync(pidFile,JSON.stringify({supervisor:process.pid,server:server?.pid,app:app.pid,root,withOutput}),{mode:0o600});}
if(mock)console.log('AUTOMATED TEST ONLY · MOCK TTS AND MOCK ROUTE · NO AUDIO');
console.log('TACIT Flow Demo: backend :19890 · presenter/Flow :19892 · Scenario A loaded · manual advance.');
console.log(`Input: SIMULATED. Analysis: ${process.env.GEMINI_API_KEY?'Gemini live, bounded; deterministic fallback':'deterministic'}. Review First. Voice authorization OFF.`);
console.log(localOutput?'LOCAL REHEARSAL OUTPUT · physical speakers/headphones. No Meet delivery. Enable voice and press Speak.':withOutput?'Real route enabled. Choose voice, enable output, then Speak. Remote listener UNVERIFIED.':'Output disabled: stable audio runtime preserved. Restart --with-output after closing competing runtime.');
