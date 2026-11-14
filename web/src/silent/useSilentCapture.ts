import { useEffect, useRef, useState, type RefObject } from 'react';
import type { VisionFrame } from '../vision/features.ts';
import type { ArticulationUpdate, ArticulationWindow } from './articulation.ts';
import { SilentCapturePipeline } from './capturePipeline.ts';
import { SampleClock } from './captureTelemetry.ts';
import type { VisualUtterance } from './port.ts';

const initial: ArticulationUpdate = { phase: 'idle', velocity: 0, window: null, dropped: null };
export function useSilentCapture(enabled: boolean, videoRef: RefObject<HTMLVideoElement | null>, frame: VisionFrame, onWindow: (window: VisualUtterance) => void, recorded = false, dropEvery = 0) {
  const pipeline = useRef(new SilentCapturePipeline());
  const callback = useRef(onWindow); callback.current = onWindow;
  const [motion, setMotion] = useState(initial);
  const [lastWindow, setLastWindow] = useState<(ArticulationWindow & { capturedFrames: number }) | null>(null);
  const [stats, setStats] = useState(pipeline.current.buffer.stats);
  const [telemetry, setTelemetry] = useState(pipeline.current.telemetry.stats);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [windows, setWindows] = useState(0);
  const [drops, setDrops] = useState(0);
  const latestFrame = useRef(frame); latestFrame.current = frame;

  useEffect(() => {
    if (!enabled) {
      pipeline.current.clear(); setMotion(initial); setStats(pipeline.current.buffer.stats); setTelemetry(pipeline.current.telemetry.stats); setLastWindow(null); setCaptureError(null);
      return;
    }
    const pipe = new SilentCapturePipeline(); pipeline.current = pipe;
    setMotion(initial); setStats(pipe.buffer.stats); setTelemetry(pipe.telemetry.stats); setLastWindow(null); setCaptureError(null);
    setWindows(0); setDrops(0);
    let stopped = false, animation = 0, videoCallback = 0, busy = false, lastVideo = -1, presented = 0, sampleIndex = 0;
    const clock = new SampleClock();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const reset = () => { pipe.clear(); setMotion(initial); setStats(pipe.buffer.stats); };
    const sample = (deliveredAt: number, metadata?: VideoFrameCallbackMetadata) => {
      const video = videoRef.current;
      if (stopped || document.hidden || !video || video.readyState < 2 || video.currentTime === lastVideo || !ctx || !video.videoWidth) return;
      if (metadata) {
        if (presented) pipe.telemetry.sourceDrops += Math.max(0, metadata.presentedFrames - presented - 1);
        presented = metadata.presentedFrames;
      }
      // PTS avoids half-rate aliasing when a callback arrives just before a wall-clock deadline.
      const samplingTime = metadata ? metadata.mediaTime * 1000 / video.playbackRate : deliveredAt;
      if (!clock.due(samplingTime)) return;
      if (recorded && dropEvery > 0 && ++sampleIndex % dropEvery === 0) { pipe.telemetry.injectedDrops++; return; }
      if (busy) { pipe.telemetry.busySkips++; return; }
      const tracked = latestFrame.current;
      // Replay uses source time, while delivery time can deliberately be slow or fast.
      const t = recorded ? tracked.t + ((metadata?.mediaTime ?? video.currentTime) * 1000 - (tracked.mediaTimeMs ?? video.currentTime * 1000)) : deliveredAt;
      if (!tracked.tracked || (tracked.faceCount ?? 1) !== 1 || (!recorded && t - tracked.t > 600)) {
        if (pipe.buffer.stats.frames) reset();
        return;
      }
      busy = true; lastVideo = video.currentTime;
      const width = Math.min(video.videoWidth, 640), height = Math.round(video.videoHeight * width / video.videoWidth);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ticket = pipe.ticket;
      try {
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(jpeg => {
          busy = false;
          if (stopped || document.hidden) return;
          if (jpeg) {
            pipe.telemetry.browserDrops = video.getVideoPlaybackQuality?.().droppedVideoFrames ?? null;
            pipe.capture({ t, jpeg, width, height, mediaTimeMs: (metadata?.mediaTime ?? lastVideo) * 1000, deliveredAtMs: deliveredAt }, ticket); setStats(pipe.buffer.stats); setTelemetry(pipe.telemetry.stats);
          }
          else setCaptureError('Could not capture visual frames. Turn the camera off, then on.');
        }, 'image/jpeg', 0.8);
      } catch (e) { busy = false; setCaptureError(e instanceof Error ? e.message : 'Visual capture failed.'); }
    };
    const video = videoRef.current;
    const loop = (t: number) => { if (!stopped) { animation = requestAnimationFrame(loop); sample(t); } };
    const onVideoFrame: VideoFrameRequestCallback = (t, metadata) => { if (!stopped && video) { videoCallback = video.requestVideoFrameCallback(onVideoFrame); sample(t, metadata); } };
    if (video?.requestVideoFrameCallback) videoCallback = video.requestVideoFrameCallback(onVideoFrame);
    else animation = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', reset);
    return () => { stopped = true; cancelAnimationFrame(animation); if (videoCallback) video?.cancelVideoFrameCallback(videoCallback); document.removeEventListener('visibilitychange', reset); pipe.clear(); };
  }, [enabled, videoRef, recorded, dropEvery]);

  useEffect(() => {
    if (!enabled || !frame.t) return;
    const pipe = pipeline.current;
    const update = pipe.observe(frame);
    setMotion(update);
    if (update.dropped) { setStats(pipe.buffer.stats); setDrops(n => n + 1); }
    if (update.window) {
      const frames = pipe.buffer.window(update.window.startMs, update.window.detectedAtMs);
      setLastWindow({ ...update.window, capturedFrames: frames.length }); setWindows(n => n + 1);
      callback.current({ ...update.window, inputSource: 'camera', id: crypto.randomUUID(), frames });
    }
  }, [enabled, frame]);
  return { motion, lastWindow, stats, telemetry, windows, drops, captureError };
}
