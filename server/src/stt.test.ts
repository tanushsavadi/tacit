import { describe, expect, it } from 'vitest';
import { Segmenter, type Segment } from './stt.ts';
import { validTwilioSignature } from './twilio.ts';
import { createHmac } from 'node:crypto';

const RATE = 8000;
const ms = (n: number) => Math.round((RATE * n) / 1000);
const silence = (n: number) => Int16Array.from({ length: ms(n) }, () => Math.round((Math.random() - 0.5) * 60));
const tone = (n: number, amp = 4000) => Int16Array.from({ length: ms(n) }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / RATE)));

function harness() {
  let t = 0;
  const seg = new Segmenter({ sampleRate: RATE, now: () => (t += 20) });
  const segments: Segment[] = [];
  let starts = 0;
  seg.on('segment', (s) => segments.push(s));
  seg.on('start', () => starts++);
  return { seg, segments, starts: () => starts };
}

describe('Segmenter', () => {
  it('emits one segment for one burst of speech surrounded by silence', () => {
    const h = harness();
    h.seg.feed(silence(600));
    h.seg.feed(tone(800));
    h.seg.feed(silence(1000));
    expect(h.starts()).toBe(1);
    expect(h.segments).toHaveLength(1);
    const s = h.segments[0]!;
    const durMs = (s.pcm.length / RATE) * 1000;
    expect(durMs).toBeGreaterThan(800); // includes pre-roll + hangover
    expect(durMs).toBeLessThan(2000);
    expect(s.endTs - s.startTs).toBeGreaterThanOrEqual(700);
  });

  it('ignores clicks shorter than the minimum speech length', () => {
    const h = harness();
    h.seg.feed(silence(400));
    h.seg.feed(tone(120));
    h.seg.feed(silence(1000));
    expect(h.segments).toHaveLength(0);
  });

  it('drops audio while disabled', () => {
    const h = harness();
    h.seg.setEnabled(false);
    h.seg.feed(tone(800));
    h.seg.feed(silence(1000));
    expect(h.segments).toHaveLength(0);
  });

  it('splits two utterances separated by a long pause', () => {
    const h = harness();
    h.seg.feed(silence(300));
    h.seg.feed(tone(500));
    h.seg.feed(silence(900));
    h.seg.feed(tone(500));
    h.seg.feed(silence(900));
    expect(h.segments).toHaveLength(2);
  });
});

describe('validTwilioSignature', () => {
  const token = 'test-token';
  const url = 'https://example.trycloudflare.com/twilio/voice';
  const params = { CallSid: 'CA123', From: '+15550000000', To: '+15551111111' };
  const sign = (u: string, p: Record<string, string>) =>
    createHmac('sha1', token).update(u + Object.keys(p).sort().map((k) => k + p[k]).join('')).digest('base64');

  it('accepts a correctly signed request and rejects tampering', () => {
    const sig = sign(url, params);
    expect(validTwilioSignature(token, url, params, sig)).toBe(true);
    expect(validTwilioSignature(token, url, { ...params, From: '+15559999999' }, sig)).toBe(false);
    expect(validTwilioSignature(token, url, params, undefined)).toBe(false);
    expect(validTwilioSignature('other', url, params, sig)).toBe(false);
  });
});
