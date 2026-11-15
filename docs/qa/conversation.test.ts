// SYNTHETIC integration fixtures. Real production state machines; fake inference, synthesis and output route.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from '../../server/node_modules/vitest/dist/index.js';
import { LiveSession, sha256Hex, type RecognizerResult } from '../../server/src/live.ts';
import { SpeechOutput } from '../../server/src/speech.ts';
import { buildReviewedRequest } from '../../server/src/reviewed.ts';
import type { VoiceBinding } from '../../server/src/voices.ts';
import type { VoiceRouteStatus, SpeechDelivery, ServerMessage } from '../../shared/protocol.ts';
import type { PlayOutcome } from '../../server/src/route.ts';

const tick = () => new Promise<void>(r => setImmediate(r));
const ready: VoiceRouteStatus = { state:'ready',deviceName:'SYNTHETIC ROUTE',deviceUid:'fixture',sampleRate:48000,
  gainDb:0,calibrated:true,readers:[],warnings:[],reason:null };
class RecorderRoute extends EventEmitter {
  pending = new Map<string,(r:PlayOutcome)=>void>();
  reached: string[] = [];
  status() { return ready; }
  play(id:string) { this.reached.push(id); return new Promise<PlayOutcome>(r => this.pending.set(id,r)); }
  stop(reason:string) { for (const r of this.pending.values()) r({state:'interrupted',reason}); this.pending.clear(); }
  finish() { for (const r of this.pending.values()) r({state:'rendered',startedAt:1,renderedAt:2}); this.pending.clear(); }
}
function rig(hold = false) {
  const route = new RecorderRoute(), deliveries: SpeechDelivery[] = [], messages: ServerMessage[] = [];
  const inference: ((r:RecognizerResult)=>void)[] = [], synth: {text:string;signal?:AbortSignal;voice?:VoiceBinding}[] = [];
  const releases: (()=>void)[] = [];
  let revision = 1;
  const binder = {
    status: () => ({ revision,effective:{voiceId:`qa:${revision}`,label:`QA voice ${revision}`} }),
    bind: (seen:unknown) => seen !== undefined && seen !== revision ? {ok:false as const,reason:'Your voice changed'} :
      {ok:true as const,binding:{voiceId:`qa:${revision}`,label:`QA voice ${revision}`} as VoiceBinding},
  };
  const speech = new SpeechOutput({label:'QA synthetic',synth:async (text,_format,signal,voice) => {
    synth.push({text,signal,voice}); if (hold) await new Promise<void>(r=>releases.push(r));
    return {audio:Buffer.from('FAKE'),mime:'audio/wav',voice:voice?.label ?? 'QA',requestTs:0,firstByteTs:0};
  }},()=>route,()=>ready,undefined,undefined,binder);
  speech.on('delivery',(d:SpeechDelivery)=>deliveries.push(d));
  const live = new LiveSession(()=>new Promise(r=>inference.push(r)),m=> {
    messages.push(m);
    if (m.type === 'review_invalidated') speech.invalidateReviewed(); // same composition as index.ts
  });
  speech.control('enable'); live.control({type:'live_control',action:'activate'});
  const header = (id:string,auth=live.current.authorizationId!) => live.utterance({type:'visual_utterance',utteranceId:id,
    authorizationId:auth,startMs:0,endMs:40,endpointMs:50,frameTimesMs:[0]});
  const submit = (id:string) => { header(id); live.frame(Buffer.from('SYNTHETIC—not an image')); };
  const shown = async (id='A') => { submit(id); inference.at(-1)!({text:`QA words ${id}`}); await tick(); };
  const request = (id:string,edited?:string) => {
    const req = buildReviewedRequest(live.reviewTarget()!,edited===undefined?{index:0}:{index:0,edited},speech.status(),live.current,id);
    if (typeof req === 'string') throw new Error(req);
    return req;
  };
  const terminal = (id:string) => deliveries.filter(d=>d.requestId===id&&['refused','interrupted','rendered','failed'].includes(d.state));
  const typed = (id:string,text=id) => speech.speakTyped({requestId:id,text,outputAuthorizationId:speech.status().authorizationId,
    outputGeneration:speech.status().generation,voiceRevision:revision});
  const close = () => { live.close(); speech.control('stop'); };
  return {route,speech,live,inference,messages,deliveries,synth,releases,header,submit,shown,request,typed,terminal,close,
    changeVoice:()=>++revision};
}

describe('independent adversarial conversation sequences',()=> {
  it('repeated recognition and reversed completion never publish stale words',async()=> {
    const r=rig();
    try {
      r.submit('A'); r.submit('B'); r.inference[1]!({text:'Current B'}); await tick();
      r.inference[0]!({text:'Old A'}); await tick();
      r.submit('B');
      expect(r.live.reviewTarget()?.utteranceId).toBe('B');
      expect(r.messages.filter(m=>m.type==='recognition_hypothesis'&&m.hypothesis.decision==='shown')).toHaveLength(1);
      expect(r.synth).toEqual([]); expect(r.live.current.autoTransmitAllowed).toBe(false);
    } finally {r.close();}
  });
  it.each(['synthesis','playback'] as const)('new utterance revokes approved review during %s',async phase=> {
    const r=rig(phase==='synthesis');
    try {
      await r.shown(); r.speech.speakReviewed(r.request('approved'),r.live.current,r.live.reviewTarget()); await tick();
      r.header('B'); r.releases[0]?.(); await tick();
      expect(r.terminal('approved')).toMatchObject([{state:'interrupted'}]);
      expect(r.route.pending.size).toBe(0);
      if(phase==='synthesis') expect(r.route.reached).toEqual([]);
    } finally {r.close();}
  });
  it.each(['synthesis','playback'] as const)('Stop during %s cancels active and queued messages without resurrection',async phase=> {
    const r=rig(phase==='synthesis');
    try {
      r.typed('first'); r.typed('queued'); await tick(); r.speech.control('stop');
      r.releases[0]?.(); await tick(); r.speech.control('enable'); await tick();
      for(const id of ['first','queued']) expect(r.terminal(id)).toMatchObject([{state:'interrupted'}]);
      expect(r.route.pending.size).toBe(0); expect(r.speech.status().queued).toBe(0);
    } finally {r.close();}
  });
  it('20 rapid Pause/Resume cycles refuse every earlier output generation',async()=> {
    const r=rig();
    try {
      for(let i=0;i<20;i++) {
        const old=r.speech.status(); r.speech.control('pause'); r.speech.control('resume');
        r.speech.speakTyped({requestId:`old-${i}`,text:'revoked',outputAuthorizationId:old.authorizationId,outputGeneration:old.generation});
        expect(r.terminal(`old-${i}`)).toMatchObject([{state:'refused'}]);
      }
      expect(r.synth).toEqual([]);
    } finally {r.close();}
  });
  it('Hold followed by longer authored message and expressive phrase preserves order and review identity',async()=> {
    const r=rig();
    try {
      await r.shown();
      r.typed('hold',"One moment, I'm responding.");
      r.typed('long','Here is the longer message I deliberately finished and approved.');
      r.typed('phrase','Could you repeat that?'); await tick();
      expect(r.route.reached).toEqual(['hold','long','phrase']);
      expect(r.live.reviewTarget()?.utteranceId).toBe('A');
      r.route.finish(); await tick();
      expect(r.terminal('long')).toMatchObject([{state:'rendered',source:'typed',remoteAudibility:'unknown'}]);
    } finally {r.close();}
  });
  it('voice switch binds queued requests to approval-time voice and refuses stale voice approval',async()=> {
    const r=rig(true);
    try {
      r.typed('A'); r.typed('B'); r.changeVoice();
      r.speech.speakTyped({requestId:'stale',text:'stale',outputAuthorizationId:r.speech.status().authorizationId,
        outputGeneration:r.speech.status().generation,voiceRevision:1});
      expect(r.terminal('stale')).toMatchObject([{state:'refused'}]);
      r.releases[0]!(); await tick(); r.releases[1]!(); await tick();
      expect(r.synth.map(c=>c.voice?.voiceId)).toEqual(['qa:1','qa:1']);
    } finally {r.close();}
  });
  it('ten rapid reviewed Speak clicks with different IDs send one approved utterance',async()=> {
    const r=rig();
    try {
      await r.shown(); for(let i=0;i<10;i++) r.speech.speakReviewed(r.request(`s${i}`),r.live.current,r.live.reviewTarget());
      await tick(); expect(r.synth).toHaveLength(1); expect(r.route.reached).toHaveLength(1);
      for(let i=1;i<10;i++) expect(r.terminal(`s${i}`)).toMatchObject([{state:'refused'}]);
    } finally {r.close();}
  });
  it.each(['utteranceId','text','textHash','liveGeneration','liveAuthorizationId','outputGeneration','outputAuthorizationId'])(
    'tampered %s reaches no synthesis',async field=> {
      const r=rig();
      try {
        await r.shown(); const req:Record<string,unknown>={...r.request('tamper')};
        req[field]=typeof req[field]==='number'?-100:'wrong';
        r.speech.speakReviewed(req,r.live.current,r.live.reviewTarget()); await tick();
        expect(r.terminal('tamper')).toMatchObject([{state:'refused'}]); expect(r.synth).toEqual([]);
      } finally {r.close();}
    });
  it('capture-owner disconnect composition cancels pending review and late inference',async()=> {
    const r=rig(true);
    try {
      await r.shown(); r.speech.speakReviewed(r.request('approved'),r.live.current,r.live.reviewTarget());
      // Mirrors index.ts capture-owner close, without touching a live WebSocket.
      r.live.disconnect(null); r.live.close(); r.speech.interrupt('Live ended: the capturing client disconnected.');
      r.releases[0]!(); await tick();
      expect(r.terminal('approved')).toMatchObject([{state:'interrupted'}]); expect(r.route.reached).toEqual([]);
    } finally {r.close();}
  });
  it('native recorded requests are accepted by backend contracts, then Stop cuts them',async()=> {
    const path=process.env.TACIT_QA_WIRE_PATH;
    if(!path) throw new Error('Run docs/qa/acceptance.mjs with --native-root; native recorder artifact is required');
    const fixture=JSON.parse(readFileSync(path,'utf8'));
    const requests=fixture.requests as Record<string,unknown>[];
    expect(requests.map(m=>m.type)).toEqual(['speak_typed','speak_typed','speak_typed','speak_reviewed','live_control','output_control']);
    const r=rig();
    try {
      await r.shown('A');
      // Translate session identities between independent native/backend fixture sessions. Text, kind, hash, index,
      // request IDs and optional voiceRevision stay exactly as the native action emitted them.
      for(const original of requests) {
        if(original.type==='speak_typed'||original.type==='speak_reviewed') {
          expect(original.outputAuthorizationId).toBe('QA-output'); expect(original.outputGeneration).toBe(4);
          const m: Record<string,unknown>={...original,outputAuthorizationId:r.speech.status().authorizationId,outputGeneration:r.speech.status().generation};
          if(m.type==='speak_typed') r.speech.speakTyped(m as Parameters<SpeechOutput['speakTyped']>[0]);
          else {
            expect(original.liveAuthorizationId).toBe('QA-live'); expect(original.liveGeneration).toBe(2);
            // Match the native synthetic candidate, independently hashing the actual recorded string.
            const text=String(original.text), target={...r.live.reviewTarget()!,rawText:text,
              reviewCandidates:[{index:0,kind:'raw' as const,text,textHash:sha256Hex(text)}]};
            r.speech.speakReviewed({...m,liveAuthorizationId:r.live.current.authorizationId,liveGeneration:r.live.current.generation},r.live.current,target);
          }
          await tick();
        }
      }
      expect(r.synth).toHaveLength(4); expect(r.route.reached).toHaveLength(4);
      r.live.close(); r.speech.control('stop'); await tick();
      expect(r.route.pending.size).toBe(0); expect(r.speech.status().state).toBe('off');
    } finally {r.close();}
  });
  it.each(['draft','hold','phrase'])('native rapid %s Speak must reach output once, not three times',async mode=> {
    const fixture=JSON.parse(readFileSync(process.env.TACIT_QA_WIRE_PATH!+'.rapid.json','utf8'));
    const r=rig();
    try {
      for(const m of fixture[mode]) {
        expect(m.type).toBe('speak_typed'); expect(m.outputAuthorizationId).toBe('QA-output');
        r.speech.speakTyped({...m,outputAuthorizationId:r.speech.status().authorizationId,outputGeneration:r.speech.status().generation});
      }
      await tick();
      expect(r.route.reached,'P1 QA-01: independent native actions reach real SpeechOutput three times').toHaveLength(1);
    } finally {r.close();}
  });
});

describe('native correction recovery through production speech and My Voice contracts',()=> {
  it.each(['unacknowledged','queued','synthesizing','routing','rendered','failed','refused','interrupted'])(
    'preserves exact correction and requires fresh explicit approval after %s',async stage=> {
      const fixture=JSON.parse(readFileSync(process.env.TACIT_QA_WIRE_PATH!+'.correction.json','utf8'));
      const requests=fixture[stage] as Record<string,unknown>[];
      expect(requests).toHaveLength(2);
      expect(requests.every(m=>m.type==='speak_reviewed'&&m.candidate==='edited')).toBe(true);
      expect(requests.map(m=>m.utteranceId)).toEqual(['A','B']);
      expect(requests.map(m=>m.voiceRevision)).toEqual([7,8]);
      const r=rig();
      try {
        for(let n=1;n<7;n++) r.changeVoice();
        await r.shown('A');
        const translate=(m:Record<string,unknown>)=>({...m,outputAuthorizationId:r.speech.status().authorizationId,
          outputGeneration:r.speech.status().generation,liveAuthorizationId:r.live.current.authorizationId,
          liveGeneration:r.live.current.generation});
        const original=requests[0]!;
        expect(original.outputGeneration).toBe(4); expect(original.liveGeneration).toBe(2);
        r.speech.speakReviewed(translate(original),r.live.current,r.live.reviewTarget()); await tick();
        expect(r.synth).toHaveLength(1);
        expect(r.synth[0]!.text).toBe(original.text);
        expect(r.synth[0]!.voice?.voiceId).toBe('qa:7');
        r.live.close(); r.speech.control('stop'); await tick();
        r.live.control({type:'live_control',action:'activate'}); r.speech.control('enable');
        await r.shown('B'); r.changeVoice(); await tick();
        expect(r.synth,'Fresh authorization/recognition never replays an old correction').toHaveLength(1);
        // A replay of the original identity is still refused, even with fresh session fields.
        r.speech.speakReviewed(translate(original),r.live.current,r.live.reviewTarget()); await tick();
        expect(r.synth).toHaveLength(1);
        const next=requests[1]!;
        expect(next.requestId).not.toBe(original.requestId);
        expect(next.outputGeneration).toBe(6); expect(next.liveGeneration).toBe(4);
        expect(next.textHash).toBe(sha256Hex(String(next.text)));
        r.speech.speakReviewed(translate(next),r.live.current,r.live.reviewTarget()); await tick();
        expect(r.synth.map(s=>s.text)).toEqual([original.text,next.text]);
        expect(r.synth.map(s=>s.voice?.voiceId)).toEqual(['qa:7','qa:8']);
        expect(r.deliveries.filter(d=>d.state==='queued').every(d=>d.source==='user-corrected')).toBe(true);
        expect(r.live.current.autoTransmitAllowed).toBe(false);
      } finally {r.close();}
    });
});
