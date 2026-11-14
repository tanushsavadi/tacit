import { describe, expect, it } from 'vitest';
import { dtw, margin, trim, type Sample } from './motion.ts';

const s = (t: number, rx: number): Sample => ({ t, ax: 0, ay: 0, az: 0, rx, ry: 0, rz: 0, pitch: 0, roll: 0, yaw: 0 });
const bump = (len: number, at: number, w: number) => Array.from({ length: len }, (_, i) => [Math.abs(i - at) < w ? 1 : 0]);

describe('airpods motion (Subvox port)', () => {
  it('DTW: identical = 0, time-shifted same shape closer than a different shape', () => {
    const a = bump(40, 15, 5);
    expect(dtw(a, a)).toBe(0);
    expect(dtw(a, bump(44, 19, 6))).toBeLessThan(dtw(a, bump(40, 15, 1).map((x, i) => [x[0]! + (i % 8 < 4 ? 1 : 0)])));
  });
  it('trim keeps the active part with padding', () => {
    const w = Array.from({ length: 50 }, (_, i) => s(i * 0.02, i >= 20 && i < 30 ? 0.5 : 0.001));
    const t = trim(w);
    expect(t.length).toBeGreaterThanOrEqual(10);
    expect(t.length).toBeLessThan(20);
  });
  it('margin is 0 for a tie and grows with separation', () => {
    expect(margin([{ label: 'a', distance: 1 }, { label: 'b', distance: 1 }])).toBe(0);
    expect(margin([{ label: 'a', distance: 1 }, { label: 'b', distance: 2 }])).toBeCloseTo(0.5);
  });
});
