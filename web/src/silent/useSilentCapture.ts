import { useEffect, useRef, useState, type RefObject } from 'react';
import type { VisionFrame } from '../vision/features.ts';
import { ArticulationSegmenter, type ArticulationUpdate, type ArticulationWindow } from './articulation.ts';
import { VisualFrameBuffer } from './frameBuffer.ts';
import type { VisualUtterance } from './port.ts';

const initial: ArticulationUpdate = { phase: 'idle', velocity: 0, window: null, dropped: null };
export function useSilentCapture(enabled: boolean, videoRef: RefObject<HTMLVideoElement | null>, frame: VisionFrame, onWindow: (window: VisualUtterance) => void) {
  const buffer = useRef(new VisualFrameBuffer());
  const segmenter = useRef(new ArticulationSegmenter());
  const callback = useRef(onWindow); callback.current = onWindow;
  const [motion, setMotion] = useState(initial);
  const [lastWindow, setLastWindow] = useState<(ArticulationWindow & { capturedFrames: number }) | null>(null);
  const [stats, setStats] = useState({ frames: 0, bytes: 0, spanMs: 0 });
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [windows, setWindows] = useState(0);
  const [drops, setDrops] = useState(0);
  const latestFrame = useRef(frame); latestFrame.current = frame;

  useEffect(() => {
    buffer.current.clear(); segmenter.current.reset(); setMotion(initial); setStats(buffer.current.stats); setLastWindow(null); setCaptureError(null);
    if (!enabled) return;
    let stopped = false, animation = 0, busy = false, lastVideo = -1, lastCapture = 0;
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const reset = () => { buffer.current.clear(); segmenter.current.reset(); setMotion(initial); setStats(buffer.current.stats); };
    const loop = (t: number) => {
      if (stopped) return;
      animation = requestAnimationFrame(loop);
      if (document.hidden || busy || t - lastCapture < 39) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.currentTime === lastVideo || !ctx) return;
      const tracked = latestFrame.current;
      if (!tracked.tracked || (tracked.faceCount ?? 1) !== 1 || t - tracked.t > 600) {
        if (buffer.current.stats.frames) reset();
        return;
      }
      busy = true; lastVideo = video.currentTime; lastCapture = t;
      canvas.width = Math.min(video.videoWidth, 640);
      canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(jpeg => {
          busy = false;
          if (stopped || document.hidden || !latestFrame.current.tracked || (latestFrame.current.faceCount ?? 1) !== 1) return;
          if (jpeg) { buffer.current.push({ t, jpeg, width: canvas.width, height: canvas.height }); setStats(buffer.current.stats); }
          else setCaptureError('Could not capture visual frames. Turn the camera off, then on.');
        }, 'image/jpeg', 0.8);
      } catch (e) { busy = false; setCaptureError(e instanceof Error ? e.message : 'Visual capture failed.'); }
    };
    animation = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', reset);
    return () => { stopped = true; cancelAnimationFrame(animation); document.removeEventListener('visibilitychange', reset); buffer.current.clear(); segmenter.current.reset(); };
  }, [enabled, videoRef]);

  useEffect(() => {
    if (!enabled) return;
    if (!frame.tracked || (frame.faceCount ?? 1) !== 1) {
      buffer.current.clear(); segmenter.current.reset(); setStats(buffer.current.stats);
      setMotion({ ...initial, phase: 'tracking_lost', dropped: (frame.faceCount ?? 0) > 1 ? 'multiple_faces' : 'tracking_lost' });
      return;
    }
    if (!frame.t) return;
    const update = segmenter.current.update(frame);
    setMotion(update);
    if (update.dropped) { buffer.current.clear(); setStats(buffer.current.stats); if (update.dropped !== 'tracking_lost') setDrops(n => n + 1); }
    if (update.window) {
      const frames = buffer.current.window(update.window.startMs, update.window.detectedAtMs);
      setLastWindow({ ...update.window, capturedFrames: frames.length }); setWindows(n => n + 1);
      callback.current({ ...update.window, id: crypto.randomUUID(), frames });
    }
  }, [enabled, frame]);
  return { motion, lastWindow, stats, windows, drops, captureError };
}
