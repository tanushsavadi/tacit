import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button.tsx';
import type { VisionFrame } from './features.ts';
import { GESTURES } from './recognizer.ts';
import { GestureTrialSession, type GestureTrial } from './trials.ts';

const OUTCOME = { correct: 'Correct', wrong: 'Wrong selection', abstained: 'Abstained', tracking_failure: 'Tracking failure', interrupted: 'Interrupted' };
export function GestureTrials({ frame, calibration, cameraEnabled }: { frame: VisionFrame; calibration: VisionFrame[]; cameraEnabled: boolean }) {
  const session = useRef(new GestureTrialSession());
  const frameRef = useRef(frame); frameRef.current = frame;
  const [target, setTarget] = useState(0);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(8);
  const [armed, setArmed] = useState(false);
  const [trials, setTrials] = useState<GestureTrial[]>([]);
  const started = useRef(0);
  useEffect(() => {
    const result = session.current.interrupt(performance.now(), Date.now());
    if (result) setTrials(ts => [...ts, result]);
    setRunning(false); session.current.calibrate(calibration);
  }, [calibration]);
  useEffect(() => {
    if (cameraEnabled) return;
    const result = session.current.interrupt(performance.now(), Date.now());
    if (result) setTrials(ts => [...ts, result]);
    setRunning(false);
  }, [cameraEnabled]);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const now = performance.now();
      const result = session.current.update(frameRef.current, now, Date.now());
      setArmed(session.current.isArmed);
      setRemaining(Math.max(0, (8000 - (now - started.current)) / 1000));
      if (result) { setTrials(ts => [...ts, result]); setRunning(false); setTarget((result.target + 1) % 3); }
    };
    const timer = setInterval(tick, 50);
    const onVisibility = () => {
      if (document.hidden) { const result = session.current.interrupt(performance.now(), Date.now()); if (result) setTrials(ts => [...ts, result]); setRunning(false); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [running]);
  const ready = cameraEnabled && calibration.length >= 10 && frame.tracked && performance.now() - frame.t < 600;
  return <details className="gesture-trials">
    <summary>Webcam gesture experiment <span>{trials.length} recorded trials</span></summary>
    <div className="trial-content"><h3>One gesture. One measured trial.</h3><p>This experiment only measures gesture selection. It cannot propose a reply or speak. Results stay in memory until this page closes.</p>
      <ol><li>Enable your camera and calibrate your relaxed expression above.</li><li>Start a trial. Stay relaxed until “Go”, then hold the target gesture for 0.9 seconds.</li><li>Repeat each target at least three times. An unselected trial is recorded too.</li></ol>
      <div className="trial-controls"><label>Target gesture<select aria-label="Target gesture" value={target} disabled={running} onChange={e => setTarget(Number(e.target.value))}>{GESTURES.map((g,i)=><option key={g} value={i}>{i+1} · {g}</option>)}</select></label><Button disabled={!ready || running} onClick={() => { started.current = performance.now(); session.current.start(target, started.current, Date.now()); setArmed(false); setRemaining(8); setRunning(true); }}>Start 8-second trial</Button>{running && <Button variant="secondary" onClick={() => { const result = session.current.interrupt(performance.now(), Date.now()); if (result) setTrials(ts => [...ts,result]); setRunning(false); }}>Stop trial</Button>}</div>
      <p className="trial-tracking">{cameraEnabled && frame.tracked && performance.now() - frame.t < 600 ? 'Face tracked' : 'Tracking unavailable · keep your face in view'}</p><p className="trial-instruction" role="status">{running ? armed ? `Go: ${GESTURES[target]}.` : 'Relax your mouth first.' : !ready ? 'Waiting for a calibrated, tracked face.' : trials.length ? `${OUTCOME[trials.at(-1)!.outcome]}. Next target: ${GESTURES[target]}.` : 'Ready. Choose your first target.'}</p>{running && <p className="trial-countdown" aria-live="off">{remaining.toFixed(1)} seconds left</p>}
      <div className="trial-counts">{Object.entries(OUTCOME).map(([key,label])=><span key={key}>{label}: <strong>{trials.filter(t=>t.outcome===key).length}</strong></span>)}</div>
      {trials.length > 0 && <div className="trial-table-wrap"><table><caption>Latest {Math.min(12,trials.length)} trials · no accuracy estimate from an unvalidated sample</caption><thead><tr><th>Target</th><th>Selected</th><th>Outcome</th><th>Tracked / frames</th><th>Tracking losses</th><th>Elapsed</th></tr></thead><tbody>{trials.slice(-12).map((t,i)=><tr key={`${t.startedAt}-${i}`}><td>{GESTURES[t.target]}</td><td>{t.selected===null?'None':GESTURES[t.selected]}</td><td>{OUTCOME[t.outcome]}</td><td>{t.trackedFrames} / {t.frames}</td><td>{t.trackingLosses}</td><td>{Math.round(t.durationMs)} ms</td></tr>)}</tbody></table></div>}
    </div>
  </details>;
}
