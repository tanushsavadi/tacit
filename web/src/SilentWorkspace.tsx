import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Camera, CameraSlash, ChatCircle, Pause, Phone, PhoneDisconnect, Play, ShieldCheck, SlidersHorizontal, SpeakerHigh, Stop, Waveform, X } from '@phosphor-icons/react';
import { useTacit } from './useTacit.ts';
import { useVision } from './vision/useVision.ts';
import { Button } from './components/ui/button.tsx';
import { unavailableSilentSpeechPort, activationBlock, type RecognitionMode, type VisualUtterance } from './silent/port.ts';
import { LiveSpeechSession, type LiveSessionState } from './silent/session.ts';
import { useSilentCapture } from './silent/useSilentCapture.ts';
import { inputCapabilities, type InputSource } from './silent/capabilities.ts';
import { ARTICULATION_CONFIG } from './silent/articulation.ts';
import './silent/workspace.css';

const VISION_LABEL = { off: 'Camera off', loading: 'Starting camera', searching: 'Looking for your face', tracking: 'Face tracked', error: 'Camera unavailable' };
const DELIVERY_LABEL = { requested: 'Synthesizing', first_audio: 'Preparing delivery', sent: 'Sent · awaiting playback acknowledgment', played: 'Caller device reported playback complete', cancelled: 'Speech interrupted', failed: 'Audio delivery failed' };
const initial: LiveSessionState = { phase: 'inactive', hypothesis: null, reason: null };

/** Mode 2 only. Legacy UserPage is preserved as dormant infrastructure, never rendered by this route. */
export function SilentWorkspace() {
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const { snapshot: s, connected, send, accessRequired, connectionError, callerInvite, authenticate, clockOffset } = useTacit(preview);
  const [camera, setCamera] = useState(false);
  const cameraEnabled = useRef(camera); cameraEnabled.current = camera;
  const [input, setInput] = useState<InputSource>('airpods');
  const [activationRequested, setActivationRequested] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [access, setAccess] = useState('');
  const [live, setLive] = useState(initial);
  const [, setTick] = useState(0);
  const vision = useVision(camera && !localPaused);
  // Only replace this port after Claude publishes the shared live-speech contract.
  const port = useMemo(() => unavailableSilentSpeechPort(connected && !preview), [connected, preview]);
  const session = useMemo(() => new LiveSpeechSession(port, setLive), [port]);
  const onWindow = useCallback((u: VisualUtterance) => { if (session.active) void session.submit(u); }, [session]);
  const capture = useSilentCapture(camera && !localPaused, vision.videoRef, vision.frame, onWindow);
  const fresh = camera && !localPaused && vision.frame.tracked && performance.now() - vision.frame.t < 600 && (vision.frame.faceCount ?? 1) === 1;
  const visionLabel = camera && (vision.frame.faceCount ?? 0) > 1 ? 'Multiple faces · capture blocked' : fresh ? 'Face tracked' : VISION_LABEL[vision.status === 'tracking' ? 'searching' : vision.status];
  const callId = connected ? s?.sessionId ?? null : null;
  const previousCall = useRef<string | null>(null);
  const paused = localPaused || live.phase === 'paused';
  const active = session.active && connected && !!callId && !paused;
  const speaking = !!callId && (s?.phase === 'SPEAKING' || s?.phase === 'SYNTHESIZING');
  const mode: RecognitionMode = port.availability.automaticSpeechValidated && port.availability.validatedInputs.includes(input) && port.availability.validationEvidence ? 'automatic' : 'display-only';
  const capabilities = inputCapabilities(connected && !preview ? s?.airpods ?? null : null, connected && s ? Date.now() + clockOffset : null, { connected: camera && vision.status !== 'error' && vision.status !== 'off' && vision.status !== 'loading', streaming: camera && !localPaused && (vision.status === 'tracking' || vision.status === 'searching'), articulation: fresh && capture.motion.phase === 'capturing', supported: !!navigator.mediaDevices?.getUserMedia }, port.availability, active && session.automaticSpeechAuthorized ? input : null);
  const selectedInput = capabilities.find(c => c.id === input)!;
  const inputReady = input === 'camera' ? fresh : selectedInput.streaming === 'yes';
  const block = activationBlock(port, callId, input, mode);
  const chooseInput = (next: InputSource) => { setActivationRequested(false); session.stop(); if (connected && callId) send({ type: 'cancel', source: 'tap' }); setInput(next); setCamera(false); setLocalPaused(false); };
  const caller = callId ? s?.callerInterim || [...(s?.transcript ?? [])].reverse().find(e => e.role === 'caller')?.text : null;
  const hypothesis = live.hypothesis;
  const stateLabel = speaking ? s?.phase === 'SYNTHESIZING' ? 'Synthesizing' : 'Speaking' : paused ? 'Paused' : activationRequested ? 'Preparing input' : active ? !inputReady ? 'Input interrupted' : live.phase === 'recognizing' ? 'Recognizing' : live.phase === 'uncertain' ? 'Uncertain · not sent' : 'Listening for your words' : 'Live speech inactive';
  const pause = useCallback(() => { setActivationRequested(false); session.pause(); setLocalPaused(true); if (connected && callId) send({ type: 'cancel', source: 'tap' }); }, [session, connected, callId, send]);
  const stop = useCallback(() => { setActivationRequested(false); session.stop(); setLocalPaused(true); if (connected && callId) send({ type: 'cancel', source: 'tap' }); }, [session, connected, callId, send]);

  useEffect(() => { const timer = setInterval(() => setTick(n => n + 1), 250); return () => clearInterval(timer); }, []);
  useEffect(() => () => session.stop(), [session]);
  useEffect(() => {
    if (!connected || previousCall.current !== callId) { setActivationRequested(false); session.stop(); if (cameraEnabled.current || previousCall.current) setLocalPaused(true); }
    previousCall.current = callId;
  }, [callId, connected, session]);
  useEffect(() => {
    if (!activationRequested) return;
    if (block || vision.error) { setActivationRequested(false); return; }
    if (fresh && !localPaused) { setActivationRequested(false); void session.start(callId, input, mode); }
  }, [activationRequested, block, vision.error, fresh, localPaused, session, callId, input, mode]);
  useEffect(() => { if (active && !inputReady) session.trackingLost(); }, [inputReady, active, session]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) pause(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.repeat) { e.preventDefault(); pause(); } };
    document.addEventListener('visibilitychange', hidden); addEventListener('pagehide', pause); addEventListener('keydown', key);
    return () => { document.removeEventListener('visibilitychange', hidden); removeEventListener('pagehide', pause); removeEventListener('keydown', key); };
  }, [pause]);

  return <div className="app-shell silent-app">
    <a className="skip-link" href="#main">Skip to communication workspace</a>
    <header className="app-header"><a href="/" className="brand-lockup"><span className="brand-icon"><Waveform size={25} /></span><span className="brand">tacit<span className="brand-period">.</span></span><span className="brand-tagline">Your voice. Beyond speech.</span></a><div className="header-actions"><span className={`connection-status ${connected && !preview ? 'is-connected' : ''}`}><span className="status-dot" />{preview ? 'UI preview' : connected ? 'System connected' : 'Disconnected'}</span>{(camera || active || speaking) && <Button variant="secondary" className="header-pause" aria-label="Pause live speech and stop audio" onClick={pause}><Pause size={18} /><span>Pause</span></Button>}<Button variant="ghost" aria-label="Diagnostics" aria-expanded={diagnostics} aria-controls="silent-diagnostics" onClick={() => setDiagnostics(v => !v)}><SlidersHorizontal size={18} /><span className="diagnostics-label">Diagnostics</span></Button></div></header>
    <main id="main" className="workspace silent-workspace">
      {preview && <div className="environment-banner" role="status">UI preview · conversation fixtures only. No recognition service, frame upload or audio transmission.<a href="/">Connect to backend <ArrowUpRight size={14} /></a></div>}
      {!connected && (accessRequired ? <section className="access-panel card"><div><h2>Connect your workspace</h2><p>Use your private TACIT link, or enter its access code.</p></div><form onSubmit={e => { e.preventDefault(); authenticate(access); setAccess(''); }}><label htmlFor="silent-access">User access code</label><div><input id="silent-access" type="password" autoComplete="off" value={access} onChange={e => setAccess(e.target.value)} /><Button disabled={!access.trim()}>Connect <ArrowRight size={16} /></Button></div></form>{connectionError && <p role="alert">{connectionError}</p>}</section> : <div className="notice" role="status">{connectionError ?? 'Connecting to TACIT…'} Live speech is inactive.</div>)}
      <div className="workspace-heading"><div><h1>Your voice, in the conversation.</h1><p className="heading-description">Continuous silent speech. Your words, as you express them.</p></div><div className="call-controls">{callId ? <><div className="call-status"><Phone size={18} /><div><strong>{s?.transport === 'simulated' ? 'Simulated call' : 'Call connected'}</strong><span>{s?.transport} · {Math.floor(Math.max(0, Date.now() - (s?.callStartedAt ?? Date.now())) / 60000)}:{String(Math.floor(Math.max(0, Date.now() - (s?.callStartedAt ?? Date.now())) / 1000) % 60).padStart(2, '0')}</span></div></div><Button variant="destructive" size="icon" aria-label="End call" onClick={() => { session.stop(); send({ type: 'hangup' }); }}><PhoneDisconnect size={20} /></Button></> : <Button variant="secondary" disabled={!connected || preview} onClick={() => window.open(callerInvite ?? '/#caller', '_blank', 'noopener,noreferrer')}><Phone size={18} />Open caller <ArrowUpRight size={16} /></Button>}</div></div>

      <div className="silent-layout">
        <div className="silent-primary">
          <section className={`voice-instrument ${active ? 'is-live' : ''}`} aria-labelledby="live-title">
            <div className="instrument-top"><h2 id="live-title">Live Silent Speech</h2><span className={`live-state ${active ? 'is-live' : ''}`} role="status"><span className="status-dot" />{stateLabel}</span></div>
            <div className="instrument-input"><label className="input-label" htmlFor="communication-input">Input source</label>
          <select id="communication-input" className="input-select" value={input} onChange={e => chooseInput(e.target.value as InputSource)}><option value="airpods">AirPods · camera-free research</option><option value="camera">Camera · optional visual check</option><option value="combined" disabled>Combined sensing · unavailable</option></select></div>
            <div className="recognized-space" aria-live="polite" aria-atomic="true" aria-busy={live.phase === 'recognizing'}>
              {hypothesis?.rawText ? <><p className="recognized-words">{hypothesis.rawText}</p><p className="recognition-origin">Raw recognition output · {hypothesis.model}{hypothesis.decision !== 'accepted' ? ' · not sent' : ''}</p></> : <><p className="recognized-words placeholder">Your words will<br className="wide-only" /> appear here.</p><p className="recognition-origin">No recognized utterance yet.</p></>}
            </div>
            <div className="instrument-feedback"><span className="motion-signal" aria-hidden="true">{[0.35,0.65,1,0.65,0.35].map((scale,i) => <span key={i} style={{ height: `${4 + Math.min(capture.motion.velocity, 4) * 7 * scale}px` }} />)}</span><p>{paused ? 'Input paused. Nothing is being transmitted.' : camera ? fresh ? capture.motion.phase === 'tracking_lost' ? 'Tracking changed · incomplete capture discarded' : capture.motion.phase === 'capturing' ? active ? 'Capturing your articulation' : 'Mouth movement detected · local capture only' : active ? mode === 'display-only' ? 'Recognizing your words · speech disabled' : 'Ready for your next words' : 'Face tracked · local camera check' : (vision.frame.faceCount ?? 0) > 1 ? 'Multiple faces detected · capture discarded' : 'Waiting for a clear view of your face' : `${selectedInput.label} · ${selectedInput.streaming === 'yes' ? 'sensor streaming; word recognition unavailable' : 'word recognition unavailable'}`}</p></div>
            <div className="instrument-controls">{input === 'camera' && !camera && <Button variant="secondary" onClick={() => { chooseInput('camera'); setCamera(true); }}><Camera size={18} />Set up camera</Button>}<Button variant="default" disabled={!!block || (input !== 'camera' && !inputReady) || speaking || live.phase === 'starting' || active || activationRequested} aria-describedby="activation-reason" onClick={() => { setLocalPaused(false); if (input === 'camera') { setCamera(true); setActivationRequested(true); } else void session.start(callId, input, mode); }}><Play size={18} weight="fill" />{activationRequested ? 'Preparing input…' : port.availability.recognitionReady && mode === 'display-only' ? 'Start recognition only' : paused ? 'Resume live speech' : 'Start live speech'}</Button>{(camera || active || speaking) && <><Button variant="secondary" onClick={pause}><Pause size={18} />Pause</Button><Button variant="ghost" disabled={!camera && !speaking && !active && !activationRequested} onClick={stop}><Stop size={18} />Stop session</Button><span className="escape-hint"><kbd>esc</kbd> pause & stop</span></>}</div>
            <p id="activation-reason" className="activation-reason">{block ?? (!inputReady ? 'Connect your selected input before activating.' : mode === 'display-only' ? 'Recognition only. Words will be shown; automatic speech remains disabled.' : 'Starting authorizes eligible recognized speech for this call. Pause at any time.')}</p>
          </section>

          {selectedInput.validated !== 'yes' && <section className="readiness-note" aria-labelledby="readiness-heading"><ShieldCheck size={21} /><div><h2 id="readiness-heading">Automatic speech is not enabled yet.</h2><p>{port.availability.recognitionReady ? 'Recognition results can be displayed, but this input has no authorized automatic delivery until its reliability is validated.' : 'No input has a connected, validated silent-word service yet. AirPods motion and optional camera tracking remain separate research paths. No words are sent automatically.'}</p></div></section>}
          {(live.reason || capture.captureError) && <div className="notice" role="status">{capture.captureError ?? live.reason}</div>}
          {callId && s?.speech && <div className="silent-delivery" role="status"><SpeakerHigh size={18} /><div><strong>{DELIVERY_LABEL[s.speech.state]}</strong><p>{s.speech.voice ?? 'Voice not reported'} · {s.transport === 'simulated' ? 'simulated transport, no remote listener' : 'Device acknowledgment does not establish human audibility.'}</p></div></div>}

          <section className="silent-caller" aria-labelledby="caller-heading"><div><Phone size={17} /><h2 id="caller-heading">{callId ? 'Caller' : 'Caller · no active call'}</h2>{callId && <span>{s?.callerInterim ? 'Transcribing' : 'Conversation transcript'}</span>}</div><p className={caller ? 'caller-quote' : 'muted'}>{caller === '…' ? 'Speech detected · transcribing with Whisper…' : caller ? `“${caller}”` : callId ? 'Listening for the caller’s words…' : 'Connect a caller to begin a conversation.'}</p></section>
          <section className="silent-history" aria-labelledby="history-heading"><div><ChatCircle size={19} /><h2 id="history-heading">Conversation</h2><span>{callId ? s?.transcript.length ?? 0 : 0} messages</span></div>{callId && s?.transcript.length ? <ol>{s.transcript.map((entry,i) => <li key={`${entry.ts}-${i}`} className={entry.role}><span>{entry.role === 'caller' ? 'Caller' : 'You'}</span><p>{entry.text}</p></li>)}</ol> : <p>Recognized words and the caller’s replies will stay together here.</p>}</section>
        </div>

        <aside className="silent-vision" aria-labelledby="input-title">
          <div className="silent-camera-heading"><h2 id="input-title">Communication input</h2></div>

          <p className="silent-camera-copy">{selectedInput.detail}</p>
          <dl className="input-facts">
            <div><dt>Device connected</dt><dd>{selectedInput.device === 'yes' ? 'Yes' : selectedInput.device === 'unknown' ? 'Not reported' : selectedInput.device === 'unavailable' ? 'Unsupported' : 'No'}</dd></div>
            <div><dt>Sensor streaming</dt><dd>{selectedInput.streaming === 'yes' ? 'Yes' : selectedInput.streaming === 'unknown' ? 'Not reported' : selectedInput.streaming === 'unavailable' ? 'Unavailable' : 'No'}</dd></div>
            <div><dt>Articulation detected</dt><dd>{selectedInput.articulation === 'yes' ? 'Motion only · experimental' : selectedInput.articulation === 'unavailable' ? 'Unavailable' : 'No'}</dd></div>
            <div><dt>Word recognition</dt><dd>{selectedInput.recognition === 'yes' ? 'Service available' : 'Unavailable'}</dd></div>
            <div><dt>Silent-word validation</dt><dd>{selectedInput.validated === 'yes' ? 'Backend evidence available' : 'Not established'}</dd></div>
            <div><dt>Automatic speech authorized</dt><dd>{selectedInput.automaticSpeech === 'yes' ? 'Session authorized' : 'No'}</dd></div>
          </dl>
          {input === 'airpods' && <p className="camera-privacy">AirPods status comes from the connected native helper. This browser does not access headphone motion directly.</p>}
          <div hidden={input !== 'camera'}>
          <div className={`camera-preview ${fresh ? 'face-tracked' : ''}`}><video ref={vision.videoRef} muted playsInline aria-label="Live webcam preview" className={camera ? '' : 'camera-hidden'} /><canvas ref={vision.canvasRef} aria-hidden="true" />{(!camera || vision.status === 'error') && <div className="camera-placeholder"><CameraSlash size={30} weight="light" /><span>{vision.status === 'error' ? 'Camera unavailable' : 'Your camera is off'}</span></div>}<span className={`camera-state ${fresh ? 'tracking' : ''}`}><span className="status-dot" />{visionLabel}</span></div>
          <p className="silent-camera-copy">{camera ? 'Keep your face and mouth in view. Continuous tracking does not require a gesture or a button for each sentence.' : 'Turn on your camera to check face tracking and natural mouth movement.'}</p>
          <Button variant={camera ? 'secondary' : 'default'} className="full-width" onClick={() => { session.stop(); setLocalPaused(false); setCamera(v => !v); }}>{camera ? <CameraSlash size={18} /> : <Camera size={18} />}{camera ? 'Turn camera off' : 'Turn camera on'}</Button>
          {paused && camera && <Button variant="ghost" className="full-width" onClick={() => setLocalPaused(false)}>Resume local camera check</Button>}
          {vision.error && <p className="camera-error" role="alert">{vision.error} Turn the camera off, then on to retry.</p>}
          <p className="camera-privacy"><ShieldCheck size={16} />No frame upload while live speech is inactive. This check uses no microphone.</p>
          </div><p className="camera-privacy">Keep TACIT visible and your phone unlocked. Leaving the page pauses input and speech; returning requires an explicit resume.</p>
          <div className="silent-guide"><h3>One session. Your control.</h3><p>When validated recognition is available, start once. Eligible utterances can then be spoken automatically.</p><p>Uncertain words stay unsent. Pause and stop remain within reach.</p></div>
        </aside>
      </div>

      {diagnostics && <section className="silent-diagnostics" id="silent-diagnostics" aria-labelledby="diagnostics-title"><div className="section-heading"><h2 id="diagnostics-title">Recognition diagnostics</h2><Button variant="ghost" size="icon" aria-label="Close diagnostics" onClick={() => setDiagnostics(false)}><X size={20} /></Button></div><div className="silent-diagnostic-grid"><section><h3>Visual capture · measured locally</h3><dl><div><dt>Tracking</dt><dd>{fresh ? 'One face tracked' : visionLabel}</dd></div><div><dt>Processed frames / second</dt><dd>{vision.fps?.toFixed(1) ?? '—'}</dd></div><div><dt>Last inference</dt><dd>{fresh ? `${vision.frame.inferenceMs.toFixed(1)} ms` : '—'}</dd></div><div><dt>Mouth motion rate</dt><dd>{camera && !paused ? capture.motion.velocity.toFixed(3) : '—'}</dd></div><div><dt>Captured frames in RAM</dt><dd>{capture.stats.frames}</dd></div><div><dt>Buffer size</dt><dd>{(capture.stats.bytes / 1024).toFixed(0)} KiB / 12 MiB max</dd></div><div><dt>Detected windows</dt><dd>{capture.windows}</dd></div><div><dt>Last window</dt><dd>{capture.lastWindow ? `${capture.lastWindow.capturedFrames} frames` : '—'}</dd></div><div><dt>Captured frames / second</dt><dd>{capture.telemetry.fps?.toFixed(1) ?? '—'}</dd></div><div><dt>Sampling jitter (SD)</dt><dd>{capture.telemetry.jitterMs == null ? '—' : `${capture.telemetry.jitterMs.toFixed(1)} ms`}</dd></div><div><dt>Source callback gaps</dt><dd>{capture.telemetry.sourceDrops}</dd></div><div><dt>Browser-reported video drops</dt><dd>{capture.telemetry.browserDrops ?? '—'}</dd></div><div><dt>Encoder busy skips</dt><dd>{capture.telemetry.busySkips}</dd></div><div><dt>Rejected captures</dt><dd>{capture.telemetry.rejected}</dd></div><div><dt>Tracking rejections</dt><dd>{capture.drops}</dd></div><div><dt>Last window duration</dt><dd>{capture.lastWindow ? `${Math.round(capture.lastWindow.endMs - capture.lastWindow.startMs)} ms` : '—'}</dd></div><div><dt>Recognition queue</dt><dd>{session.metrics.queueDepth} / 2</dd></div><div><dt>Recognition evidence in RAM</dt><dd>{(session.metrics.heldBytes / 1024).toFixed(0)} KiB / 24 MiB max</dd></div><div><dt>Overload discards</dt><dd>{session.metrics.overloads}</dd></div><div><dt>Last motion → endpoint</dt><dd>{capture.lastWindow ? `${Math.round(capture.lastWindow.endpointMs)} ms` : '—'}</dd></div></dl><p>Experimental motion endpointing: {ARTICULATION_CONFIG.quietMs} ms quiet interval, not a validated speech detector. Smiling or swallowing may also produce motion windows.</p></section><section><h3>Recognition & delivery</h3><dl><div><dt>Recognition model</dt><dd>{port.availability.model ?? 'Not connected'}</dd></div><div><dt>Automatic speech gate</dt><dd>Blocked · validation required</dd></div><div><dt>Validation evidence</dt><dd>{port.availability.validationEvidence ?? 'Not available'}</dd></div><div><dt>Recognition latency</dt><dd>{hypothesis ? `${Math.round(hypothesis.recognitionMs)} ms` : '—'}</dd></div><div><dt>Calibrated uncertainty</dt><dd>{hypothesis?.uncertainty?.calibrated ? `${hypothesis.uncertainty.value} (${hypothesis.uncertainty.kind})` : 'Unavailable'}</dd></div><div><dt>Unseen silent-speech WER</dt><dd>Not measured</dd></div><div><dt>Incorrect transmissions</dt><dd>Not measured in human trials</dd></div><div><dt>Voice</dt><dd>{s?.speech?.voice ?? s?.services.voicePolicy?.personalVoice ?? s?.services.voicePolicy?.systemVoice ?? 'Not reported'}</dd></div></dl><p>MediaPipe extracts landmarks and expression signals. It does not transcribe words. No Gemini replies, language-model corrections or mouth-gesture mappings enter this workspace’s speech path.</p></section></div><div className="silent-logging"><label htmlFor="silent-logging">Conversation storage</label><select id="silent-logging" value={s?.services.logging?.mode ?? 'off'} disabled={!connected || preview} onChange={e => send({ type: 'set_turn_logging', mode: e.target.value as 'off' | 'timings' | 'full' })}><option value="off">Off</option><option value="timings">Timings only</option><option value="full">Full conversation · opt in</option></select><p>Current mode: {s?.services.logging?.mode ?? 'off'}. Camera frames and local capture buffers are never stored on disk.</p></div></section>}
      <footer className="silent-footer"><span>Built for connection. Designed for your control.</span><span>Silent speech · reliability validation pending</span></footer>
    </main>
  </div>;
}
