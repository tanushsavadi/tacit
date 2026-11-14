import { useEffect, useRef, useState } from 'react';
import { emptyFrame, type VisionFrame } from './features.ts';

export type VisionStatus = 'off' | 'loading' | 'searching' | 'tracking' | 'error';
export function useVision(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<VisionStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<VisionFrame>(emptyFrame);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus('off'); setFrame(emptyFrame()); setFps(null); return; }
    let stopped = false, animation = 0, busy = false, ready = false, lastVideo = -1, lastDispatch = 0;
    let stream: MediaStream | null = null;
    let worker: Worker | null = null;
    let firstResult = 0, count = 0;
    const startupTimeout = setTimeout(() => fail(new Error('Startup timed out. Check browser camera permission and try again.')), 20000);
    const cleanup = () => {
      clearTimeout(startupTimeout);
      cancelAnimationFrame(animation);
      stream?.getTracks().forEach(t => t.stop());
      worker?.terminate();
      const video = videoRef.current;
      if (video) video.srcObject = null;
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
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use localhost or HTTPS to access a camera.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current!;
        video.srcObject = stream;
        stream.getVideoTracks().forEach(track => { track.onended = () => fail(new Error('Camera stream ended.')); });
        await video.play();
        if (stopped) return;
        worker = new Worker(new URL('./landmarker.worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = e => fail(new Error(e.message));
        worker.onmessage = e => {
          if (stopped) return;
          if (e.data.type === 'error') { fail(new Error(e.data.message)); return; }
          if (e.data.type === 'ready') { clearTimeout(startupTimeout); ready = true; setStatus('searching'); return; }
          if (e.data.type !== 'result') return;
          busy = false;
          const f = e.data.frame as VisionFrame;
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
        const loop = async (t: number) => {
          if (stopped) return;
          animation = requestAnimationFrame(loop);
          if (!ready || busy || document.hidden || video.readyState < 2 || video.currentTime === lastVideo || t - lastDispatch < 65) return;
          busy = true; lastVideo = video.currentTime; lastDispatch = t;
          try {
            const bitmap = await createImageBitmap(video);
            if (stopped) { bitmap.close(); return; }
            worker!.postMessage({ type: 'frame', bitmap, t }, [bitmap]);
          } catch (e) { fail(e); }
        };
        animation = requestAnimationFrame(loop);
      } catch (e) { fail(e); }
    }
    void start();
    const onVisibility = () => { setFrame(emptyFrame(performance.now())); if (document.hidden) { setStatus('searching'); setFps(null); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; cleanup(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled]);
  return { videoRef, canvasRef, status, error, frame, fps };
}
