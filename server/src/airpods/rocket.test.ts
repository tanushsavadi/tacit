import { describe, expect, it } from 'vitest';
import { RidgeClassifier, makeKernels, transform } from './rocket.ts';

describe('ROCKET + ridge', () => {
  it('separates two synthetic temporal shapes and exposes LOO scores', () => {
    const shape = (k: number, i: number) => Array.from({ length: 60 }, (_, t) => [Math.sin((t + i) / (k ? 3 : 8)) + 0.1 * Math.cos(i * t)]);
    const X = [...Array(20).keys()].map((i) => shape(i % 2, i)), y = X.map((_, i) => (i % 2 ? 'fast' : 'slow'));
    const ks = makeKernels(200, 1, 60, 7);
    const clf = new RidgeClassifier().fit(X.map((x) => transform(x, ks)), y);
    expect(clf.looScores).toHaveLength(20);
    const looAcc = clf.looScores.filter((s, i) => clf.classes[s.indexOf(Math.max(...s))] === y[i]).length / 20;
    expect(looAcc).toBeGreaterThanOrEqual(0.9);
    const s = clf.scores(transform(shape(1, 99), ks));
    expect(clf.classes[s.indexOf(Math.max(...s))]).toBe('fast');
  });
});
