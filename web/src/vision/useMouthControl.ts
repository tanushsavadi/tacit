import { useEffect, useMemo, useRef, useState } from 'react';
import { MouthGestureRecognizer, emptyRanking } from './recognizer.ts';
import type { VisionFrame } from './features.ts';
import { useVision } from './useVision.ts';

export function useMouthControl(enabled: boolean, candidateSetId: string | null, selectable: boolean) {
  const vision = useVision(enabled);
  const recognizer = useMemo(() => new MouthGestureRecognizer(), []);
  const [calibrationSamples, setCalibrationSamples] = useState<VisionFrame[]>([]);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [ranking, setRanking] = useState(emptyRanking);
  const [selection, setSelection] = useState<{ candidateSetId: string; index: number } | null>(null);
  const samples = useRef<VisionFrame[]>([]);

  useEffect(() => {
    setSelection(null); setRanking(emptyRanking()); recognizer.reset();
  }, [candidateSetId, selectable, enabled, recognizer]);
  useEffect(() => {
    if (!enabled) { setCalibrated(false); setCalibrationSamples([]); setCalibrating(false); samples.current = []; }
  }, [enabled]);
  useEffect(() => {
    const f = vision.frame;
    if (!f.tracked) { setSelection(null); setRanking(emptyRanking()); recognizer.reset(); }
    if (calibrating) {
      if (!f.tracked) { samples.current = []; return; }
      if (samples.current.length && f.t - samples.current.at(-1)!.t > 250) samples.current = [];
      samples.current.push(f);
      if (f.t - samples.current[0]!.t >= 1200) {
        const ok = recognizer.calibrate(samples.current);
        setCalibrated(ok); setCalibrationSamples(ok ? samples.current.slice() : []); setCalibrating(false);
        setCalibrationError(ok ? null : 'Not enough continuous frames. Please try again.');
      }
      return;
    }
    const result = recognizer.update(f, { candidateSetId, enabled: enabled && selectable && calibrated });
    setRanking(result);
    if (result.selectedIndex !== null && result.candidateSetId) setSelection({ candidateSetId: result.candidateSetId, index: result.selectedIndex });
  }, [vision.frame, candidateSetId, enabled, selectable, calibrated, calibrating, recognizer]);
  useEffect(() => {
    if (!calibrating) return;
    const timeout = setTimeout(() => { setCalibrating(false); setCalibrationError('Calibration interrupted. Keep your face in view and try again.'); }, 7000);
    return () => clearTimeout(timeout);
  }, [calibrating]);
  // Drop a preselection if a camera or worker stalls, even without another frame.
  useEffect(() => {
    const timer = setInterval(() => {
      if (vision.frame.t && performance.now() - vision.frame.t > 600) { setSelection(null); setRanking(emptyRanking()); recognizer.reset(); }
    }, 250);
    return () => clearInterval(timer);
  }, [vision.frame.t, recognizer]);
  return {
    ...vision, ranking, selection, calibrationSamples, calibrated, calibrating, calibrationError,
    calibrate: () => { samples.current = []; recognizer.reset(); setSelection(null); setRanking(emptyRanking()); setCalibrating(true); setCalibrated(false); setCalibrationSamples([]); setCalibrationError(null); },
    clearSelection: () => setSelection(null),
  };
}
