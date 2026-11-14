import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowClockwise, ArrowRight, ArrowUpRight, Camera, CameraSlash, CaretDown, Check, ChatCircle, Flask, Keyboard, Phone, PhoneDisconnect, ShieldCheck, SlidersHorizontal, SpeakerHigh, Spinner, Waveform, X } from '@phosphor-icons/react';
import type { Snapshot } from '../../shared/protocol.ts';
import { useTacit } from './useTacit.ts';
import { canConfirm, canSelect, validProposal } from './candidateState.ts';
import { useMouthControl } from './vision/useMouthControl.ts';
import { GestureTrials } from './vision/GestureTrials.tsx';
import { turnStages } from '../../shared/metrics.ts';
import { GESTURES } from './vision/recognizer.ts';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';

const PHASE_LABEL: Record<Snapshot['phase'], string> = {
  DISCONNECTED: 'Ready when you are', LISTENING: 'Listening to caller', TRANSCRIBING: 'Caller is speaking',
  GENERATING: 'Preparing your replies', OPTIONS_READY: 'Your turn', SELECTING: 'Reading selection',
  AWAITING_CONFIRMATION: 'Ready for your confirmation', SYNTHESIZING: 'Preparing your voice', SPEAKING: 'Sending your reply',
  ABSTAINED: 'Choose again', CANCELLED: 'Choose again', ERROR: 'Needs attention',
};
const VISION_LABEL = { off: 'Camera off', loading: 'Starting camera & model', searching: 'Looking for your face', tracking: 'Face tracked', error: 'Camera unavailable' };
const SPEECH_LABEL: Record<string, string> = { requested: 'Synthesizing your confirmed reply', first_audio: 'Audio is being prepared for delivery', sent: 'Audio sent · playback not yet confirmed', played: 'Caller device reported playback complete', cancelled: 'Speech cancelled', failed: 'Audio delivery failed' };

export function UserPage() {
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const { snapshot: s, connected, send, clockOffset, accessRequired, connectionError, callerInvite, authenticate } = useTacit(preview);
  const [now, setNow] = useState(Date.now());
  const [camera, setCamera] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [simText, setSimText] = useState('Would you like me to pick up dinner on my way over?');
  const proposalRef = useRef<HTMLElement>(null);
  const displayedRef = useRef<string | null>(null);
  const selectable = canSelect(s, connected);
  const set = s?.candidateSet ?? null;
  const setId = set?.id ?? null;
  const vision = useMouthControl(camera, setId, selectable);
  const serverNow = now + clockOffset;
  const proposed = validProposal(s, connected, serverNow) ? s!.proposal : null;
  const confirmable = canConfirm(s, connected, serverNow);
  const visual = selectable && vision.selection?.candidateSetId === setId ? vision.selection : null;
  const onCall = !!s?.sessionId;
  const caller = s?.callerInterim || [...(s?.transcript ?? [])].reverse().find(e => e.role === 'caller')?.text;
  const busy = s?.phase === 'GENERATING' || s?.phase === 'SYNTHESIZING' || s?.phase === 'SPEAKING';
  const processedFresh = camera && vision.frame.t > 0 && performance.now() - vision.frame.t < 600;
  const freshFrame = vision.frame.tracked && performance.now() - vision.frame.t < 600;

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!connected || !setId || displayedRef.current === setId) return;
    let painted = false;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        painted = true; displayedRef.current = setId;
        send({ type: 'candidates_displayed', candidateSetId: setId, ts: Date.now() });
      });
    });
    return () => { if (!painted) { cancelAnimationFrame(first); cancelAnimationFrame(second); } };
  }, [setId, connected, send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Escape' && connected && onCall) { send({ type: 'cancel', source: 'key' }); vision.clearSelection(); return; }
      if ((e.target as HTMLElement).closest('input, textarea, select, button, a, summary, [contenteditable="true"]')) return;
      const option = set?.options.find(o => String(o.index + 1) === e.key);
      if (option && selectable && set) { e.preventDefault(); send({ type: 'tap_select', candidateSetId: set.id, index: option.index }); }
      if ((e.key === 'Enter' || e.key === ' ') && proposed && confirmable) { e.preventDefault(); send({ type: 'confirm', proposalId: proposed.id, source: 'key' }); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [set, selectable, proposed, confirmable, connected, onCall, send]);

  useEffect(() => {
    if (proposed?.id) proposalRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [proposed?.id]);

  const speechForPanel = s?.speech && !set && onCall ? s.speech : null;
  const panelCaption = proposed ? 'YOUR PROPOSED RESPONSE' : visual ? 'VISUAL SELECTION · NOT YET PROPOSED' : speechForPanel ? speechForPanel.state === 'played' ? 'REPLY COMPLETE' : speechForPanel.state === 'failed' ? 'DELIVERY FAILED' : 'CONFIRMED RESPONSE' : 'CONFIRMATION';
  const panelTitle = proposed ? `“${proposed.text}”` : visual ? `“${set?.options[visual.index]?.text ?? ''}”` : speechForPanel ? `“${speechForPanel.text}”` : 'Nothing is spoken until you confirm.';
  const panelDescription = proposed ? `Selected by ${proposed.source}${proposed.method ? ` · ${proposed.method}` : ''}. Expires in ${Math.max(0, Math.ceil((proposed.expiresAt - serverNow) / 1000))}s.` : visual ? 'Review this gesture selection, then confirm the proposal separately.' : speechForPanel ? SPEECH_LABEL[speechForPanel.state] : 'First choose a response. Then confirm to send it to the caller.';

  const duration = s?.callStartedAt ? Math.max(0, Math.floor((serverNow - s.callStartedAt) / 1000)) : 0;
  const durationText = `${Math.floor(duration / 60).toString().padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`;
  const turn = s?.turn ?? s?.lastCompletedTurn;
  const stages = turn ? turnStages(turn) : null;
  const voiceLabel = s?.speech?.voice ?? s?.services.voicePolicy?.personalVoice ?? s?.services.voicePolicy?.systemVoice ?? Object.keys(s?.services.voice.providers ?? {}).find(k => k.includes('say')) ?? 'Not reported';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#replies">Skip to replies</a>
      <header className="app-header">
        <a className="brand-lockup" href={preview ? '?preview=1' : '/'}>
          <span className="brand-icon"><Waveform weight="bold" size={24} /></span>
          <span className="brand">tacit<span className="brand-period">.</span></span>
          <span className="brand-tagline">Your voice. Beyond speech.</span>
        </a>
        <div className="header-actions">
          <span className={`connection-status ${connected ? 'is-connected' : ''}`}><span className="status-dot" />{preview ? 'UI preview' : connected ? 'System connected' : accessRequired ? 'Access required' : 'Connecting'}</span>
          <Button variant="ghost" size="sm" aria-label="Diagnostics" aria-expanded={diagnostics} aria-controls="diagnostics" onClick={() => setDiagnostics(!diagnostics)}><SlidersHorizontal size={18} /><span className="hide-mobile">Diagnostics</span></Button>
        </div>
      </header>

      <main className="workspace">
        {preview && <div className="environment-banner"><Flask size={18} /><span><strong>UI preview</strong> · Scripted replies. No call or audio. Camera signals, if enabled, are real.</span><a href="/">Connect to backend <ArrowUpRight /></a></div>}
        {!connected && (accessRequired ? <Card className="access-panel"><div><h2>Connect your TACIT workspace</h2><p>Open your private access link, or enter its user access code. Get the current link with <code>npm run links</code> in the server folder.</p></div><form onSubmit={e => { e.preventDefault(); if (accessCode.trim()) { authenticate(accessCode); setAccessCode(''); } }}><label htmlFor="user-access">User access code</label><div><input id="user-access" type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} /><Button type="submit" disabled={!accessCode.trim()}>Connect <ArrowRight size={16} /></Button></div></form>{connectionError && <p className="camera-error" role="alert">{connectionError}</p>}<a href="?preview=1">Explore labeled UI preview <ArrowUpRight size={14} /></a></Card> : <div className="notice" role="status">{connectionError ?? 'Connecting to your TACIT workspace…'} Selections and confirmation are paused. <a href="?preview=1">Open labeled UI preview</a></div>)}
        {connected && s?.notice && <div className={`notice ${s.notice.kind}`} role="status">{s.notice.message}</div>}
        <div className="workspace-heading">
          <div><h1>Your conversation</h1><p className="heading-description">Choose a reply. Confirm to speak.</p></div>
          <div className="call-controls">
            {onCall ? <><div className={`call-status ${s?.transport === 'simulated' ? 'simulated' : ''}`}><Phone size={17} weight="fill" /><div><strong>{s?.transport === 'simulated' ? 'Simulated call' : s?.transport?.startsWith('twilio') ? 'Phone call connected' : 'Browser call connected'}</strong><span>{s?.transport} <span aria-hidden="true">·</span> {durationText}</span></div></div><Button variant="destructive" size="icon" aria-label="End call" disabled={!connected} onClick={() => send({ type: 'hangup' })}><PhoneDisconnect size={20} /></Button></> : <Button variant="secondary" onClick={() => window.open(callerInvite ?? '/#caller', '_blank', 'noopener,noreferrer')}><Phone size={18} />Open caller <ArrowUpRight size={16} /></Button>}
          </div>
        </div>

        <div className="conversation-layout">
          <div className="conversation-main">
            <Card className={`caller-card ${s?.callerInterim ? 'is-interim' : ''}`}>
              <div className="caller-avatar"><Waveform size={24} /></div>
              <div className="caller-content"><div className="caller-label"><span className="eyebrow">{s?.callerInterim && onCall ? 'CALLER IS SPEAKING' : onCall ? 'CALLER SAID' : caller ? 'PREVIOUS CALL' : 'CALLER'}</span><span className="quiet-label">{onCall ? s?.transport === 'simulated' ? 'Simulated transcript' : 'Conversation transcript' : caller ? 'Last conversation · call ended' : 'Waiting for a call'}</span></div>
                <p className={caller ? 'caller-quote' : 'caller-quote placeholder-text'}>{s?.callerInterim === '…' ? 'Speech detected · transcribing with Whisper…' : caller ? `“${caller}”` : onCall ? 'Listening for the caller’s next words…' : 'Every conversation starts with a connection.'}</p>
              </div>
            </Card>

            <section className="reply-section" id="replies" aria-labelledby="reply-heading">
              <div className="section-heading"><div><h2 id="reply-heading">Choose your words</h2><p>Tap a reply, press <kbd>1</kbd>–<kbd>3</kbd>, or use a mouth gesture.</p></div><span className={`phase-label ${busy ? 'is-busy' : ''}`} role="status">{busy ? <Spinner className="spin" size={16} /> : <span className="status-dot" />}{visual ? 'Gesture selected · review below' : freshFrame && vision.ranking.bestIndex !== null ? `Hold: ${GESTURES[vision.ranking.bestIndex]}` : s ? PHASE_LABEL[s.phase] : 'Connecting'}</span></div>
              <div className="reply-grid" aria-busy={s?.phase === 'GENERATING'}>
                {set ? set.options.map((o, slot) => {
                  const selected = proposed?.candidateSetId === set.id && proposed.index === o.index;
                  const highlighted = visual?.index === slot;
                  const tracking = freshFrame && vision.ranking.candidateSetId === set.id && vision.ranking.bestIndex === slot;
                  const score = freshFrame && vision.calibrated ? vision.ranking.scores[slot] : undefined;
                  return <button key={`${set.id}-${o.index}`} className={`reply-card ${selected ? 'is-selected' : ''} ${highlighted ? 'is-visual' : ''} ${tracking ? 'is-tracking' : ''}`} disabled={!selectable} aria-pressed={selected || highlighted} onClick={() => send({ type: 'tap_select', candidateSetId: set.id, index: o.index })} style={{ '--hold': tracking ? vision.ranking.progress : 0 } as CSSProperties}>
                    <span className="reply-card-top"><span className="reply-number">0{o.index + 1}</span><span className="reply-intent">{o.intent}</span>{selected ? <Check size={20} weight="bold" /> : <ArrowUpRight className="reply-arrow" size={20} />}</span>
                    <span className="reply-text">{o.text}</span>
                    <span className="reply-card-bottom"><span>{selected ? 'Proposed · not spoken' : highlighted ? 'Visual selection · review below' : GESTURES[slot] ? GESTURES[slot] : 'Tap to select'}</span><kbd>{o.index + 1}</kbd></span>
                    {score !== undefined && <span className="gesture-score">Experimental gesture strength {score.toFixed(2)}</span>}
                    {tracking && <span className="hold-line" />}
                  </button>;
                }) : [0, 1, 2].map(i => <div key={i} className={`reply-card empty-reply ${s?.phase === 'GENERATING' ? 'is-loading' : ''}`}><span className="reply-number">0{i + 1}</span><div className="empty-lines"><span /><span /><span /></div><span className="quiet-label">{s?.phase === 'GENERATING' ? 'Preparing a reply…' : 'A reply will appear here'}</span></div>)}
              </div>
              <div className="reply-meta"><span>{set ? <><span className="semantic-dot" />{set.model}{!preview && ` · ${set.generationMs} ms`}</> : 'Contextual replies appear after the caller speaks.'}</span><div><Button size="sm" variant="ghost" disabled={!selectable} onClick={() => send({ type: 'request_alternatives' })}><ArrowClockwise size={15} />Other replies</Button><Button size="sm" variant="ghost" disabled={!selectable} onClick={() => send({ type: 'reject_all' })}>None of these</Button></div></div>
            </section>

            <Card ref={proposalRef} className={`proposal-panel ${proposed ? 'has-proposal' : ''} ${s?.phase === 'SYNTHESIZING' || s?.phase === 'SPEAKING' ? 'is-speaking' : ''}`}>
              <div className="proposal-symbol">{proposed ? <SpeakerHigh size={24} /> : visual ? <Check size={24} /> : <ShieldCheck size={24} />}</div>
              <div className="proposal-content" aria-live="polite" aria-atomic="true">
                <p className="state-caption">{panelCaption}</p>
                <h3>{panelTitle}</h3>
                <p aria-live="off">{panelDescription}</p>
              </div>
              <div className="proposal-actions">
                {proposed ? <><Button disabled={!confirmable} onClick={() => send({ type: 'confirm', proposalId: proposed.id, source: 'tap' })}><SpeakerHigh size={18} />{confirmable ? 'Confirm & speak' : 'Confirmation ready shortly'}{confirmable && <kbd>↵</kbd>}</Button><Button variant="ghost" onClick={() => send({ type: 'cancel', source: 'tap' })}><X size={16} />Cancel <kbd>esc</kbd></Button></> : visual ? <><Button onClick={() => { const option = set?.options[visual.index]; if (set && option && selectable && freshFrame) send({ type: 'tap_select', candidateSetId: set.id, index: option.index }); }} disabled={!freshFrame}>Review selection <ArrowRight size={17} /></Button><Button variant="ghost" onClick={vision.clearSelection}>Clear selection</Button></> : <span className="protected-label">{speechForPanel?.state === 'played' ? <><Check size={16} />Playback reported complete</> : speechForPanel ? <><SpeakerHigh size={16} />Confirmed by {speechForPanel.confirmedBy}</> : <><ShieldCheck size={16} />Confirmation protected</>}</span>}
              </div>
            </Card>
            {onCall && s?.speech && <div className={`speech-status ${s.speech.state === 'failed' ? 'error' : ''}`} role="status"><SpeakerHigh size={17} /><span>{SPEECH_LABEL[s.speech.state] ?? s.speech.state}{s.speech.voice && <span className="actual-voice-label">Voice: {s.speech.voice}</span>}{s.transport === 'simulated' ? ' · simulated transport, no remote listener' : ''}</span>{(s.phase === 'SYNTHESIZING' || s.phase === 'SPEAKING') && <Button size="sm" variant="ghost" onClick={() => send({ type: 'cancel', source: 'tap' })}>Stop</Button>}</div>}
            <details className="conversation-history"><summary><ChatCircle size={18} />Conversation history<span>{s?.transcript.length ?? 0} {(s?.transcript.length ?? 0) === 1 ? 'message' : 'messages'}</span><CaretDown size={16} /></summary><div className="history-list">{s?.transcript.length ? s.transcript.map((entry, i) => <div className={`history-entry ${entry.role}`} key={`${entry.ts}-${i}`}><span>{entry.role === 'caller' ? 'Caller' : 'You'}</span><p>{entry.text}</p>{entry.via && <small>{entry.via.selection} selection · {entry.via.confirm} confirmation</small>}</div>) : <p className="muted">Your conversation will appear here.</p>}</div></details>
          </div>

          <aside className="vision-sidebar" aria-labelledby="vision-heading">
            <Card className="vision-card">
              <div className="vision-heading"><h2 id="vision-heading">Visual input</h2><span className="local-badge">ON DEVICE</span></div>
              <div className={`camera-preview ${freshFrame ? 'face-tracked' : ''}`}>
                <video ref={vision.videoRef} muted playsInline aria-label="Live webcam preview" className={camera ? '' : 'camera-hidden'} />
                <canvas ref={vision.canvasRef} aria-hidden="true" />
                {!camera || vision.status === 'error' ? <div className="camera-placeholder"><CameraSlash size={30} weight="light" /><span>{vision.status === 'error' ? 'Camera unavailable' : 'Your camera is off'}</span></div> : <div className="face-guide" aria-hidden="true" />}
                {camera && vision.status === 'loading' && <div className="camera-loading"><Spinner className="spin" size={24} /><span>Loading local model…</span></div>}
                <span className="camera-corner top-left" /><span className="camera-corner bottom-right" />
                <span className={`camera-state ${freshFrame ? 'tracking' : ''}`}><span className="status-dot" />{freshFrame ? 'Face tracked' : VISION_LABEL[vision.status === 'tracking' ? 'searching' : vision.status]}</span>
              </div>
              <div className="vision-copy"><h3>Select with a gesture.</h3><p>Hold a gesture for 0.9 seconds to highlight its reply. Review it before confirming.</p></div>
              <div className="gesture-guide">{GESTURES.map((gesture, i) => <div key={gesture} className={freshFrame && vision.ranking.bestIndex === i ? 'active' : ''}><span>{i + 1}</span><strong>{gesture}</strong><span className="gesture-signal">{freshFrame && vision.calibrated ? vision.ranking.scores[i]?.toFixed(2) ?? '—' : '—'}</span></div>)}</div>
              <p className="vision-feedback" role="status">{vision.calibrating ? 'Keep your expression relaxed…' : visual ? 'Gesture highlighted. Review your reply.' : !freshFrame ? camera ? 'Keep your face in view.' : 'Enable the camera to begin.' : !vision.calibrated ? 'Face found. Calibrate to begin.' : vision.ranking.bestIndex !== null ? `Hold ${GESTURES[vision.ranking.bestIndex]?.toLowerCase()}…` : vision.ranking.scores.some(score => score > 0.35) ? 'Gesture unclear. Relax and try again.' : 'Ready for your gesture.'}</p><p className="experimental-label">Experimental gesture control · not lip-reading</p>
              <Button variant={camera ? 'secondary' : 'default'} className="full-width" onClick={() => setCamera(!camera)}>{camera ? <CameraSlash size={18} /> : <Camera size={18} />}{camera ? 'Turn camera off' : 'Enable camera'}</Button>
              {camera && <Button variant="ghost" className="full-width calibration-button" disabled={!freshFrame || vision.calibrating} onClick={vision.calibrate}>{vision.calibrating ? <><Spinner className="spin" size={16} />Relax your mouth. Hold still…</> : vision.calibrated ? <><Check size={16} />Neutral calibrated · recalibrate</> : 'Calibrate your relaxed expression'}</Button>}
              {camera && !vision.calibrated && !vision.calibrating && !vision.error && <p className="calibration-help">Calibrate before gesture selection. Tap and keyboard controls are always available.</p>}
              {(vision.error || vision.calibrationError) && <p className="camera-error" role="alert">{vision.error ?? vision.calibrationError}</p>}
              <div className="privacy-note"><ShieldCheck size={15} /><span>Camera frames stay in this browser.</span></div>
            </Card>
            <div className="keyboard-note"><Keyboard size={18} /><p><strong>Another way to connect</strong><br /><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> choose · <kbd>enter</kbd> confirm<br /><kbd>esc</kbd> cancel. Touch works too.</p></div>
          </aside>
        </div>

        <GestureTrials frame={vision.frame} calibration={vision.calibrationSamples} cameraEnabled={camera} />

        <section id="diagnostics" hidden={!diagnostics} className="diagnostics" aria-label="Technical diagnostics">
          <div className="section-heading"><div><h2>Diagnostics</h2></div><Button variant="ghost" size="icon" aria-label="Close diagnostics" onClick={() => setDiagnostics(false)}><X size={20} /></Button></div>
          <div className="diagnostic-grid">
            <div><h3>Vision · measured locally</h3><dl><div><dt>Tracking</dt><dd>{freshFrame ? 'Face present' : 'No fresh face data'}</dd></div><div><dt>Processed frames / second</dt><dd>{vision.fps !== null && processedFresh ? vision.fps.toFixed(1) : '—'}</dd></div><div><dt>Last inference</dt><dd>{processedFresh ? `${vision.frame.inferenceMs.toFixed(1)} ms` : '—'}</dd></div>{(['jaw', 'smile', 'pucker', 'mouthAspect', 'yaw', 'pitch'] as const).map(k => <div key={k}><dt>{k}</dt><dd>{freshFrame ? vision.frame[k].toFixed(3) : '—'}</dd></div>)}</dl><p>MediaPipe Face Landmarker · CPU worker. Expression coefficients and geometry, not speech probabilities. Scores use a neutral baseline, a 0.55 threshold, and a 0.18 winning margin.</p></div>
            <div><h3>Conversation · server authoritative</h3><dl><div><dt>Transport</dt><dd>{s?.transport ?? 'No call'}</dd></div><div><dt>Phase</dt><dd>{s?.phase ?? 'No snapshot'}</dd></div><div><dt>Candidate model</dt><dd>{set?.model ?? s?.services.gemini.model ?? '—'}</dd></div><div><dt>Voice</dt><dd>{preview ? 'No audio in UI preview' : voiceLabel}</dd></div><div><dt>Phrase-recognition service</dt><dd>{s?.services.recognition.reachable ? 'Reported reachable · not used by gesture prototype' : 'Unavailable'}</dd></div><div><dt>Selection method</dt><dd>Mouth gesture → local highlight → review tap</dd></div></dl><p>Mouth review uses the existing tap_select contract. Speech requires a separate confirmation of the current proposal ID.</p></div>
            <div><h3>Turn stages · measured timestamps</h3><dl>{([['Whisper / transcription',stages?.transcriptionMs],['Candidate generation',stages?.generationMs],['Display',stages?.displayMs],['Human selection',stages?.selectionMs],['Human confirmation',stages?.confirmationMs],['Synthesis (may overlap choosing)',stages?.synthesisMs],['After confirmation',stages?.postConfirmMs],['Audio send',stages?.sendMs],['Playback (includes audio)',stages?.playbackMs],['Reply audio duration',stages?.audioMs],['System processing subtotal',stages?.systemMs]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value === undefined ? '—' : `${value} ms`}</dd></div>)}</dl><p>Human selection and confirmation are separate from system processing. The system subtotal includes transcription, generation and the wait after confirmation; overlapping pre-synthesis is not added twice. Playback includes audio duration. {turn?.playbackAckKind ? `Acknowledgment: ${turn.playbackAckKind}.` : 'No playback acknowledgment recorded.'} A device acknowledgment does not establish that a person heard the audio.</p></div>
          </div>
          {s?.services.voicePolicy && <div className="voice-policy-controls"><h3>Voice and consent</h3><p>{s.services.voicePolicy.personalConfigured ? s.services.voicePolicy.personalAvailable ? `Personal voice available: ${s.services.voicePolicy.personalVoice}` : 'Your personal voice is unavailable. A confirmed reply will be refused unless you explicitly allow the system voice below.' : `Using ${s.services.voicePolicy.systemVoice}. No personal voice is configured.`}</p>{s.services.voicePolicy.personalError && <p className="camera-error" role="alert">{s.services.voicePolicy.personalError}</p>}<label><input type="checkbox" checked={s.services.voicePolicy.allowSystemFallback} disabled={!connected || preview || !s.services.voicePolicy.personalConfigured} onChange={e=>send({type:'set_voice_policy',allowSystemFallback:e.target.checked})} /><span>Allow the labeled system voice if my personal voice fails.</span></label><label><input type="checkbox" checked={s.services.voicePolicy.personalPresynth} disabled={!connected || preview || !s.services.voicePolicy.personalAvailable} onChange={e=>send({type:'set_voice_policy',personalPresynth:e.target.checked})} /><span>Allow personal-voice audio to be prepared before confirmation. Sending still requires confirmation.</span></label></div>}
          {s?.services.logging && <div className="logging-controls"><h3>Conversation storage</h3><p>Current mode: <strong>{s.services.logging.mode}</strong> · set by {s.services.logging.source} · {s.services.logging.storedTurns} stored turns · {s.services.logging.retentionDays}-day retention. Off writes nothing; timings stores no conversation text; full stores conversation text.</p><label>Persistent logging<select aria-label="Persistent logging" value={s.services.logging.mode} disabled={!connected || preview} onChange={e => send({type:'set_turn_logging',mode:e.target.value as 'off'|'timings'|'full'})}><option value="off">Off</option><option value="timings">Timing measurements only</option><option value="full">Full conversation (includes text)</option></select></label></div>}
        </section>

        <footer className="workspace-footer"><span><span className="footer-mark">t.</span> Built for connection. Designed for your control.</span><details className="demo-tools"><summary><Flask size={15} />Demo tools<CaretDown size={14} /></summary><div className="demo-panel"><h3>{preview ? 'Isolated UI preview' : 'Simulated call controls'}</h3><p>{preview ? 'Fixtures only. No backend or audio.' : 'These controls simulate the caller. No audio leaves the machine.'}</p>{!onCall ? <Button disabled={!connected} onClick={() => send({ type: 'sim_call_start' })}>Start simulated call</Button> : s?.transport === 'simulated' ? <form onSubmit={e => { e.preventDefault(); if (simText.trim()) send({ type: 'sim_caller_says', text: simText.trim() }); }}><label htmlFor="sim-text">Simulated caller says</label><textarea id="sim-text" rows={3} value={simText} onChange={e => setSimText(e.target.value)} /><Button disabled={!connected || !simText.trim()} type="submit">Send simulated transcript <ArrowRight size={16} /></Button></form> : <p>A browser call is active. End it before simulating.</p>}<a href={preview ? '/' : '?preview=1'}>{preview ? 'Use backend connection' : 'Open isolated UI preview'}<ArrowUpRight size={14} /></a></div></details></footer>
      </main>
    </div>
  );
}
