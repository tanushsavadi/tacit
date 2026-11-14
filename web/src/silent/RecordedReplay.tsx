import { useEffect, useMemo, useRef, useState } from 'react';
import { useVision } from '../vision/useVision.ts';
import { useSilentCapture } from './useSilentCapture.ts';
import { evaluateBoundaries, parseReplayLabels, type ReplayLabel, type ReplayPlan } from './replay.ts';
import type { VisualUtterance } from './port.ts';
import { Button } from '../components/ui/button.tsx';
import './workspace.css';

/** Isolated evaluation route: no useTacit, sockets, recognizer, TTS, or microphone. */
export function RecordedReplay() {
  const [url, setUrl] = useState('');
  const [rate, setRate] = useState(1);
  const [dropEvery, setDropEvery] = useState(0);
  const [interruption, setInterruption] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(0);
  const [labels, setLabels] = useState<ReplayLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<{ startMs: number; endMs: number; endpointMs: number; frames: number }[]>([]);
  const origin = useRef<number | null>(null);
  const plan = useMemo<ReplayPlan | null>(() => url ? { url, rate, dropEvery, interruptions: interruption ? [{ startMs: 1000, endMs: 1600 }] : [] } : null, [url, rate, dropEvery, interruption, run]);
  const vision = useVision(running, plan);
  const [processed, setProcessed] = useState(0);
  const capture = useSilentCapture(running, vision.videoRef, vision.frame, (u: VisualUtterance) => {
    if (origin.current == null) return;
    setWindows(old => [...old.slice(-199), { startMs: u.startMs - origin.current!, endMs: u.endMs - origin.current!, endpointMs: u.endpointMs, frames: u.frames.length }]);
  }, true, dropEvery);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (vision.frame.mediaTimeMs !== undefined) {
      origin.current = vision.frame.t - vision.frame.mediaTimeMs;
      setProcessed(n => n + 1);
    }
  }, [vision.frame]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setRunning(false); };
    const hide = () => setRunning(false);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setRunning(false); };
    document.addEventListener('visibilitychange', pause); addEventListener('pagehide', hide); addEventListener('keydown', key);
    return () => { document.removeEventListener('visibilitychange', pause); removeEventListener('pagehide', hide); removeEventListener('keydown', key); };
  }, []);
  const reset = () => { setWindows([]); setProcessed(0); origin.current = null; setRun(n => n + 1); setRunning(true); };
  const report = { provenance: 'RECORDED INPUT · genuine MediaPipe · experimental motion windows · no recognition or speech',
    rate, actualPlaybackRate: vision.videoRef.current?.playbackRate ?? null, sourceTimeMs: vision.frame.mediaTimeMs ?? null,
    dropEvery, interruption, processed, capture: capture.telemetry, buffer: capture.stats, trackingDiscards: capture.drops, windows,
    boundaries: labels.length ? evaluateBoundaries(labels, windows) : null };
  return <div className="app-shell silent-app"><main className="workspace replay-workspace">
    <h1>Recorded-input evaluation</h1>
    <p className="notice" role="status">Recorded video only. Real MediaPipe and the shared capture pipeline; no recognition predictions, microphone, network upload or speech.</p>
    <p><a href="/">Return to communication workspace</a></p>
    <div className="replay-controls">
      <label>Recorded video<input type="file" accept="video/*" onChange={e => { setRunning(false); setError(null); const file = e.target.files?.[0]; setUrl(file ? URL.createObjectURL(file) : ''); }} /></label>
      <label>Boundary labels (optional JSON)<input type="file" accept="application/json,.json" onChange={async e => { try { const file = e.target.files?.[0]; setLabels(file ? parseReplayLabels(JSON.parse(await file.text())) : []); setError(null); } catch (e) { setLabels([]); setError(e instanceof Error ? e.message : String(e)); } }} /></label>
      <label>Delivery speed<select aria-label="Delivery speed" value={rate} disabled={running} onChange={e => setRate(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
      <label>Drop frames<select aria-label="Drop frames" value={dropEvery} disabled={running} onChange={e => setDropEvery(Number(e.target.value))}><option value={0}>None</option><option value={3}>Every third</option><option value={5}>Every fifth</option></select></label>
      <label><input type="checkbox" checked={interruption} disabled={running} onChange={e => setInterruption(e.target.checked)} />Inject tracking loss at source 1.0–1.6 s</label>
      <Button onClick={reset} disabled={!url || running}>Replay from start</Button><Button variant="secondary" disabled={!running} onClick={() => setRunning(false)}>Pause replay and clear capture</Button>
    </div>
    {(error || vision.error || capture.captureError) && <p role="alert">{error ?? vision.error ?? capture.captureError}</p>}
    <div className="camera-preview replay-preview"><video ref={vision.videoRef} muted playsInline aria-label="Recorded video preview" /><canvas ref={vision.canvasRef} aria-hidden="true" /></div>
    <p role="status">{running ? `Recorded input · ${vision.status}` : 'Replay paused'} · source timestamps preserved. {processed} tracking samples processed.</p>
    <p>Boundary labels describe source time in milliseconds. Slow/fast playback changes delivery; source time remains unchanged. Injected interruptions mask tracking; they are test faults. No final quiet interval is invented after a clip ends.</p>
    <p>{windows.length} motion windows. Reports retain at most 200 windows and aggregate capture statistics, never images. Actual JavaScript heap usage is not measured.</p>
    <Button variant="secondary" onClick={() => { const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); const object = URL.createObjectURL(blob); link.href = object; link.download = 'tacit-recorded-evaluation.json'; link.click(); setTimeout(() => URL.revokeObjectURL(object), 0); }}>Export evaluation report</Button>
    <pre id="replay-report" aria-label="Recorded-input evaluation report">{JSON.stringify(report, null, 2)}</pre>
  </main></div>;
}
