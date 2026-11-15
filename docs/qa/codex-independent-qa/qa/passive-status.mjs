// Read-only supplemental runtime observation. Never logs raw health, tokens, private URLs or transcripts.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(process.argv[2]??'.');
try {
  if(existsSync(join(root,'server/.env'))) process.loadEnvFile(join(root,'server/.env'));
  const stored=JSON.parse(readFileSync(join(root,'server/data/secrets.json'),'utf8'));
  const token=process.env.TACIT_USER_TOKEN||stored.userToken;
  if(!token||token!==stored.userToken) throw new Error();
  const port=Number(process.env.PORT??8790);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error();
  const started=performance.now();
  const res=await fetch(`http://127.0.0.1:${port}/api/health`,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(2500)});
  const h=await res.json(),route=h.services?.voiceRoute,rec=h.services?.recognition;
  const ready=res.ok&&!!h.services&&h.myVoice?.engine?.state==='ready';
  console.log(JSON.stringify({observedAt:new Date().toISOString(),scope:'Passive local health; no control session or physical audio',
    authenticated:res.ok&&!!h.services,healthRequestMs:Math.round(performance.now()-started),
    recognitionReachable:rec?.reachable??null,automaticSpeechValidated:rec?.live?.automaticSpeechValidated??null,
    route:{state:route?.state??null,deviceName:route?.deviceName??null,readers:route?.readers??null},
    myVoice:h.myVoice?{engineState:h.myVoice.engine?.state??null,effectiveId:h.myVoice.effective?.voiceId??null,
      revision:h.myVoice.revision??null,disabled:h.myVoice.disabled??null}:null},null,2));
  process.exitCode=ready?0:1;
} catch {
  console.log(JSON.stringify({observedAt:new Date().toISOString(),state:'UNAVAILABLE',reason:'Missing/mismatched existing credentials, invalid port or health unavailable; no writes attempted'}));
  process.exitCode=1;
}
