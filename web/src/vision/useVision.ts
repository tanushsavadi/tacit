import { useEffect, useRef, useState } from 'react';
import { emptyFrame, type VisionFrame } from './features.ts';
import { replayFault, type ReplayPlan } from '../silent/replay.ts';
import { SampleClock } from '../silent/captureTelemetry.ts';

export type VisionStatus = 'off' | 'loading' | 'searching' | 'tracking' | 'error';
export function useVision(enabled: boolean, replay: ReplayPlan | null = null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [restart, setRestart] = useState(0);
  const [status, setStatus] = useState<VisionStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<VisionFrame>(emptyFrame);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus('off'); setFrame(emptyFrame()); setFps(null); return; }
    let stopped = false, animation = 0, videoCallback = 0, busy = false, ready = false, lastVideo = -1;
    const clock = new SampleClock(1000 / 15);
    let stream: MediaStream | null = null;
    let watch = 0;
    let worker: Worker | null = null;
    let firstResult = 0, count = 0;
    let sourceIndex = 0, dispatchMediaTime = 0;
    const replayOrigin = performance.now();
    const startupTimeout = setTimeout(() => fail(new Error('Startup timed out. Check browser camera permission and try again.')), 20000);
    const cleanup = () => {
      clearInterval(watch);
      clearTimeout(startupTimeout);
      cancelAnimationFrame(animation);
      if (videoCallback) videoRef.current?.cancelVideoFrameCallback(videoCallback);
      stream?.getTracks().forEach(t => t.stop());
      worker?.terminate();
      const video = videoRef.current;
      if (video) { video.pause(); video.srcObject = null; if (replay) { video.removeAttribute('src'); video.load(); } }
      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    };
    const fail = (e: unknown) => {
      if (stopped) return;
      stopped = true;
      cleanup();
      const detail = e instanceof Error ? e.message : String(e);
      setError(detail.includes('Permission') || detail.includes('denied') ? 'Camera access was denied. Allow the camera in your browser, then try again.' : `Camera unavailable: ${detail}`);
      setStatus('error'); setFrame(emptyFrame()); setFps(null);
    };
    setStatus('loading'); setError(null);
    async function start() {
      try {
        const video = videoRef.current!;
        if (replay) { video.src = replay.url; video.defaultPlaybackRate = replay.rate; video.preload = 'auto'; video.load(); video.playbackRate = replay.rate; }
        else {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use localhost or HTTPS to access a camera.');
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
          if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = stream;
          stream.getVideoTracks().forEach(track => {
            track.onended = () => fail(new Error('Camera stream ended.'));
            track.onmute = () => fail(new Error('Camera capture was interrupted. Return to TACIT and enable the camera again.'));
          });
          watch = window.setInterval(() => {
            if (stream?.getVideoTracks().some(track => track.readyState === 'ended')) fail(new Error('Camera stream ended.'));
          }, 400);
          await video.play();
        }
        if (stopped) return;
        worker = new Worker(new URL('./landmarker.worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = e => fail(new Error(e.message));
        worker.onmessage = e => {
          if (stopped) return;
          if (e.data.type === 'error') { fail(new Error(e.data.message)); return; }
          if (e.data.type === 'ready') { clearTimeout(startupTimeout); ready = true; setStatus('searching'); if (replay) void video.play().catch(fail); return; }
          if (e.data.type !== 'result') return;
          busy = false;
          const f: VisionFrame = { ...e.data.frame, ...(replay ? { mediaTimeMs: dispatchMediaTime } : {}) };
          const stamp = performance.now();
          firstResult ||= stamp; count++;
          if (stamp - firstResult >= 1000) { setFps((count - 1) * 1000 / (stamp - firstResult)); firstResult = stamp; count = 1; }
          setFrame(f); setStatus(f.tracked ? 'tracking' : 'searching');
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            if (ctx) {
              ctx.fillStyle = '#b1f0d1';
              for (const p of e.data.mouth as { x: number; y: number }[]) {
                ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 2.5, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
        };
        worker.postMessage({ type: 'init', wasmPath: new URL('/mediapipe', location.origin).href, modelPath: new URL('/models/face_landmarker.task', location.origin).href });
        const dispatch = async (t: number, mediaTime = video.currentTime) => {
          if (stopped) return;
          if (!ready || busy || document.hidden || video.readyState < 2 || mediaTime === lastVideo || !clock.due(mediaTime * 1000 / video.playbackRate)) return;
          busy = true; lastVideo = mediaTime;
          dispatchMediaTime = mediaTime * 1000;
          const stamp = replay ? replayOrigin + dispatchMediaTime : t;
          if (replay) {
            const fault = replayFault(replay, ++sourceIndex, dispatchMediaTime);
            if (fault) { busy = false; if (fault === 'tracking-interruption') setFrame({ ...emptyFrame(stamp), mediaTimeMs: dispatchMediaTime }); return; }
          }
          try {
            const bitmap = await createImageBitmap(video);
            if (stopped) { bitmap.close(); return; }
            worker!.postMessage({ type: 'frame', bitmap, t: stamp }, [bitmap]);
          } catch (e) { fail(e); }
        };
        const loop = (t: number) => { if (!stopped) { animation = requestAnimationFrame(loop); void dispatch(t); } };
        const onVideoFrame: VideoFrameRequestCallback = (t, metadata) => { if (!stopped) { videoCallback = video.requestVideoFrameCallback(onVideoFrame); void dispatch(t, metadata.mediaTime); } };
        if (video.requestVideoFrameCallback) videoCallback = video.requestVideoFrameCallback(onVideoFrame);
        else animation = requestAnimationFrame(loop);
      } catch (e) { fail(e); }
    }
    void start();
    const onVisibility = () => { setFrame(emptyFrame(performance.now())); if (document.hidden) { setStatus('searching'); setFps(null); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; cleanup(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, replay, restart]);
  return { videoRef, canvasRef, status, error, frame, fps, retry: () => { setError(null); setFrame(emptyFrame()); setRestart(n => n + 1); } };
}
