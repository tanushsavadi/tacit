/** Far-end browser. Speech recognition and playback are device/browser dependent. */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Microphone, MicrophoneSlash, Phone, PhoneDisconnect, SpeakerHigh, Waveform } from '@phosphor-icons/react';
import type { CallerClientMessage, CallerServerMessage } from '../../shared/protocol.ts';
import { readAccess, socketUrl, storeAccess } from './access.ts';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';
import { MicrophoneCapture } from './audio/microphone.ts';

type Line = { who: 'you' | 'tacit' | 'system'; text: string };

export function CallerPage() {
  const [state, setState] = useState<'idle' | 'connecting' | 'on' | 'ended'>('idle');
  const [invite, setInvite] = useState(() => readAccess('caller'));
  const [lines, setLines] = useState<Line[]>([]);
  const [micStarting, setMicStarting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micFrames, setMicFrames] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef(new MicrophoneCapture());
  const micAttempt = useRef(0);
  const frameCount = useRef(0);
  const lastLevelAt = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAudio = useRef<{ replyId: string; text: string; mime: string; voice: string } | null>(null);
  const playing = useRef<{ id: string; url: string } | null>(null);
  const active = useRef(false);
  const wantsMic = useRef(false);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const n = useRef(0);
  const add = (line: Line) => setLines(ls => [...ls, line]);
  const send = (m: CallerClientMessage) => { const ws = wsRef.current; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  async function startRecognition() {
    if (!active.current || playing.current || !wantsMic.current) return;
    const attempt = ++micAttempt.current;
    setMicStarting(true); setMicError(null); frameCount.current = 0; setMicFrames(0);
    try {
      await micRef.current.start((pcm, rms) => {
        const ws = wsRef.current;
        if (!active.current || !wantsMic.current || playing.current || ws?.readyState !== WebSocket.OPEN) return;
        // Do not queue old speech behind a slow connection.
        if (ws.bufferedAmount > 128000) {
          wantsMic.current = false; stopRecognition();
          setMicError('Audio connection is too slow. Microphone paused; retry or type instead.'); return;
        }
        ws.send(pcm); frameCount.current++;
        if (performance.now() - lastLevelAt.current > 100) { lastLevelAt.current = performance.now(); setMicLevel(rms); setMicFrames(frameCount.current); }
      }, reason => { wantsMic.current = false; stopRecognition(); setMicError(reason); });
      if (attempt !== micAttempt.current || !active.current || !wantsMic.current) return;
      send({ type: 'audio_start', sampleRate: 16000, encoding: 'pcm_s16le' });
      micRef.current.setEnabled(true); setMicOn(true);
    } catch (error) {
      if (attempt !== micAttempt.current) return;
      wantsMic.current = false;
      setMicError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access denied. Allow it in browser settings, then retry; typing remains available.' : error instanceof Error ? error.message : 'Microphone could not start. You can type instead.');
    } finally { if (attempt === micAttempt.current) setMicStarting(false); }
  }
  function stopRecognition() {
    micAttempt.current++;
    if (restart.current) clearTimeout(restart.current);
    micRef.current.stop(); send({ type: 'audio_stop' });
    setMicOn(false); setMicStarting(false); setMicLevel(0);
  }
  function stopReply() {
    const audio = audioRef.current;
    if (audio) { audio.onplaying = null; audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); }
    if (playing.current) URL.revokeObjectURL(playing.current.url);
    playing.current = null; pendingAudio.current = null; setAudioPlaying(false);
  }
  function endSession() {
    active.current = false; wantsMic.current = false;
    stopRecognition(); stopReply(); setState('ended');
  }
  function playReply(blob: Blob, meta: { replyId: string; text: string; voice: string }) {
    stopRecognition(); stopReply();
    const url = URL.createObjectURL(blob);
    playing.current = { id: meta.replyId, url };
    const audio = audioRef.current!;
    audio.src = url;
    const done = (outcome: 'ended' | 'failed', detail?: string) => {
      if (playing.current?.id !== meta.replyId) return;
      send({ type: 'playback', replyId: meta.replyId, state: outcome, detail });
      stopReply();
      if (outcome === 'failed') add({ who: 'system', text: 'Reply playback failed. Check this device’s audio settings.' });
      restart.current = setTimeout(startRecognition, 300);
    };
    audio.onplaying = () => { setAudioPlaying(true); send({ type: 'playback', replyId: meta.replyId, state: 'started' }); };
    audio.onended = () => done('ended');
    audio.onerror = () => done('failed', 'audio element error');
    void audio.play().catch(() => done('failed', 'Browser blocked or could not play audio'));
    add({ who: 'tacit', text: meta.text });
    add({ who: 'system', text: `Voice: ${meta.voice}` });
  }
  function connect() {
    if (state === 'connecting' || state === 'on') return;
    storeAccess('caller', invite);
    setState('connecting');
    const ws = new WebSocket(socketUrl(location.origin, '/ws/caller', invite));
    ws.binaryType = 'blob'; wsRef.current = ws;
    ws.onmessage = ev => {
      if (wsRef.current !== ws) return;
      if (typeof ev.data !== 'string') {
        const meta = pendingAudio.current; pendingAudio.current = null;
        if (meta && active.current) playReply(new Blob([ev.data], { type: meta.mime }), meta);
        return;
      }
      let msg: CallerServerMessage;
      try { msg = JSON.parse(ev.data) as CallerServerMessage; } catch { return; }
      if (msg.type === 'accepted') { active.current = true; setState('on'); add({ who: 'system', text: 'Connected to TACIT. Enable your microphone or type a message.' }); }
      else if (msg.type === 'rejected') { add({ who: 'system', text: `Call unavailable: ${msg.reason}` }); endSession(); ws.close(); }
      else if (msg.type === 'audio' && active.current) pendingAudio.current = msg;
      else if (msg.type === 'stop' && playing.current?.id === msg.replyId) { stopReply(); restart.current = setTimeout(startRecognition, 300); }
      else if (msg.type === 'ended') { add({ who: 'system', text: `Call ended: ${msg.reason}` }); endSession(); ws.close(); }
    };
    ws.onerror = () => add({ who: 'system', text: 'Could not connect. Check the caller invite and server connection, then try again.' });
    ws.onclose = () => { if (wsRef.current === ws) endSession(); };
  }
  function hangup() { send({ type: 'hangup' }); endSession(); wsRef.current?.close(); }
  useEffect(() => () => {
    active.current = false; wantsMic.current = false;
    if (restart.current) clearTimeout(restart.current);
    micAttempt.current++; micRef.current.stop(); wsRef.current?.close();
    audioRef.current?.pause();
    if (playing.current) URL.revokeObjectURL(playing.current.url);
  }, []);

  return <div className="caller-workspace">
    <header className="app-header"><a className="brand-lockup" href="/"><span className="brand-icon"><Waveform weight="bold" size={24} /></span><span className="brand">tacit<span className="brand-period">.</span></span></a><span className="caller-role">Caller companion</span></header>
    <main className="caller-body"><a className="back-link" href="/"><ArrowLeft size={15} />TACIT workspace</a><h1>A conversation, together.</h1><p className="caller-intro">Speak or type. Your partner’s silent words belong in the conversation.</p>
      <Card className="caller-connect"><div><span className={`connection-status ${state === 'on' ? 'is-connected' : ''}`} role="status"><span className="status-dot" />{state === 'on' ? audioPlaying ? 'Playing your partner’s reply' : micOn ? 'Microphone listening' : 'Call connected' : state === 'connecting' ? 'Connecting…' : 'Ready to connect'}</span><p>Browser call · audio plays on this device</p></div>{state === 'on' || state === 'connecting' ? <Button variant="destructive" onClick={hangup}><PhoneDisconnect size={19} />End call</Button> : <Button onClick={connect}><Phone size={19} />{state === 'ended' ? 'Call again' : 'Call TACIT'}</Button>}</Card>
      {(state === 'idle' || state === 'ended') && <details className="invite-settings"><summary>Caller invite code</summary><label htmlFor="caller-invite">Use the invite from your partner’s TACIT workspace</label><input id="caller-invite" type="password" autoComplete="off" value={invite} onChange={e => setInvite(e.target.value)} /></details>}
      {state === 'on' && <div className="caller-mic"><Button variant="secondary" disabled={audioPlaying} onClick={() => { wantsMic.current = !wantsMic.current; if (wantsMic.current) startRecognition(); else { stopRecognition();  } }}>{micOn ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}{micStarting ? 'Cancel microphone setup' : micOn ? 'Pause microphone' : 'Enable microphone'}</Button><span>Server Whisper · live microphone to PCM16<br />{micOn ? `${micFrames} audio frames sent · input RMS ${micLevel.toFixed(3)}` : 'No browser speech service. Transcript appears in the TACIT workspace.'}</span></div>}
      {micError && <div className="notice error" role="alert">{micError}</div>}
      <section className="caller-messages" aria-label="Conversation" aria-live="polite">{lines.length ? lines.map((line,i)=><div key={i} className={`caller-message ${line.who}`}><span>{line.who==='you'?'You':line.who==='tacit'?'Your partner':'Call status'}</span><p>{line.text}</p></div>) : <div className="caller-empty"><ChatPlaceholder /><h2>Your conversation will appear here.</h2><p>Connect to your partner’s workspace to begin.</p></div>}</section>
      {state === 'on' && <form className="caller-compose" onSubmit={e=>{e.preventDefault();const text=typed.trim();if(!text||!active.current)return;send({type:'utterance',utteranceId:`t${++n.current}-${Date.now()}`,text});add({who:'you',text:`${text} (typed)`});setTyped('');}}><label htmlFor="caller-message">Or type your message</label><textarea id="caller-message" rows={2} value={typed} onChange={e=>setTyped(e.target.value)} placeholder="What would you like to say?" /><Button type="submit" disabled={!typed.trim()}>Send message <ArrowRight size={17} /></Button></form>}
      <p className="caller-disclosure"><SpeakerHigh size={16} />Playback status reports this device’s audio events. Verify audibility with your partner.</p>
      <audio ref={audioRef} />
    </main>
  </div>;
}
function ChatPlaceholder() { return <Waveform size={28} weight="light" />; }
