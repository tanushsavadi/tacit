import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VoicePreviewState } from '../../shared/protocol.ts';
import type { RouteDevice } from './route.ts';
import { previewSafetyFrom, VoicePreview, type Playback, type PreviewSafety } from './preview.ts';
import type { BindResult, VoiceBinding } from './voices.ts';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** Wait for a condition (real temp-file I/O takes variable time under load). */
async function until(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting'); await tick(2); }
}
const dev = (uid: string, name: string, transport: string, inputChannels: number, outputChannels = 2): RouteDevice =>
  ({ uid, name, transport, inputChannels, outputChannels, sampleRate: 48000 });
const speakers = dev('BuiltInSpeakerDevice', 'MacBook Pro Speakers', 'built-in', 0);
const bh = dev('BlackHole16ch_UID', 'BlackHole 16ch', 'virtual', 16, 16);
const zoom = dev('zoom.us.zoomaudiodevice.001', 'ZoomAudioDevice', 'virtual', 2);
const multi = dev('~:AMS2_StackedOutput:0', 'Multi-Output Device', 'aggregate', 0);
const devices = [speakers, bh, zoom, multi];

describe('previewSafetyFrom', () => {
  it('allows the real speakers and names them', () => {
    expect(previewSafetyFrom({ devices, defaultOutput: speakers.uid, aggregates: {}, routeUid: bh.uid })).toEqual({ ok: true, reason: null, output: 'MacBook Pro Speakers' });
  });
  it('refuses when the sound output is the virtual mic, any loopback virtual device, or an aggregate containing one', () => {
    expect(previewSafetyFrom({ devices, defaultOutput: bh.uid, aggregates: {}, routeUid: bh.uid })).toMatchObject({ ok: false, reason: expect.stringMatching(/BlackHole 16ch.*virtual microphone/) });
    expect(previewSafetyFrom({ devices, defaultOutput: zoom.uid, aggregates: {}, routeUid: bh.uid })).toMatchObject({ ok: false });
    expect(previewSafetyFrom({ devices, defaultOutput: multi.uid, aggregates: { [bh.uid]: [multi.uid] }, routeUid: bh.uid })).toMatchObject({ ok: false, reason: expect.stringMatching(/includes "BlackHole 16ch"/) });
    expect(previewSafetyFrom({ devices, defaultOutput: multi.uid, aggregates: { [bh.uid]: [] }, routeUid: bh.uid }).ok).toBe(true);
    expect(previewSafetyFrom({ devices, defaultOutput: null, aggregates: {}, routeUid: null }).ok).toBe(false);
    // no route configured: BlackHole is still a loopback device
    expect(previewSafetyFrom({ devices, defaultOutput: bh.uid, aggregates: {}, routeUid: null }).ok).toBe(false);
  });
});

function rig(o: { safety?: PreviewSafety; synth?: (t: string, s: AbortSignal) => Promise<void>; bind?: (s: { voiceId: unknown }) => BindResult } = {}) {
  const synths: { text: string; binding: VoiceBinding }[] = [];
  const plays: { path: string; stopped: boolean; finish: (ok: boolean) => void }[] = [];
  const voices = {
    bindPreview: o.bind ?? ((s: { voiceId: unknown; rate?: unknown; pitch?: unknown }): BindResult =>
      s.voiceId === 'apple:x' ? { ok: true, binding: { voiceId: 'apple:x', label: 'X', revision: 1, ...(s.rate !== undefined ? { rate: s.rate as number } : {}) } } : { ok: false, reason: 'That voice is not installed on this Mac.' }),
    synth: async (text: string, _f: 'file', signal: AbortSignal, binding: VoiceBinding) => {
      synths.push({ text, binding }); await o.synth?.(text, signal);
      if (signal.aborted) throw new Error('cancelled');
      return { audio: Buffer.from('RIFF'), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'X' };
    },
  };
  let safetyCalls = 0;
  const p = new VoicePreview(voices, async () => { safetyCalls++; return o.safety ?? { ok: true, reason: null, output: 'MacBook Pro Speakers' }; }, (path): Playback => {
    let finish!: (ok: boolean) => void;
    const done = new Promise<{ ok: boolean; reason?: string }>((r) => { finish = (ok) => r(ok ? { ok } : { ok, reason: 'x' }); });
    const rec = { path, stopped: false, finish };
    plays.push(rec);
    return { done, stop: () => { rec.stopped = true; finish(false); } };
  });
  const events: VoicePreviewState[] = [];
  p.on('preview', (e) => events.push(e));
  return { p, synths, plays, events, safetyCalls: () => safetyCalls };
}

describe('VoicePreview', () => {
  it('renders the exact text with the explored voice (no selection change), plays it locally, cleans up', async () => {
    const { p, synths, plays, events } = rig();
    const run = p.start({ previewId: 'p1', voiceId: 'apple:x', rate: 0.4, text: "  It's [[me]]  " });
    await until(() => plays.length === 1);
    expect(synths).toEqual([{ text: "  It's [[me]]  ", binding: { voiceId: 'apple:x', label: 'X', revision: 1, rate: 0.4 } }]);
    expect(events.map((e) => e.state)).toEqual(['synthesizing', 'playing']);
    expect(events[1]).toMatchObject({ output: 'MacBook Pro Speakers' });
    const path = plays[0]!.path;
    expect(existsSync(path)).toBe(true);
    plays[0]!.finish(true);
    await run;
    expect(events.at(-1)).toMatchObject({ previewId: 'p1', state: 'done' });
    await until(() => !existsSync(dirname(path)));
  });

  it('uses built-in sample phrases; refuses unknown samples, blank or long text, unknown voices', async () => {
    const { p, synths, events } = rig();
    await p.start({ previewId: 'a', voiceId: 'apple:x', sample: 9 });
    await p.start({ previewId: 'b', voiceId: 'apple:x', text: '   ' });
    await p.start({ previewId: 'c', voiceId: 'apple:x', text: 'x'.repeat(201) });
    await p.start({ previewId: 'd', voiceId: 'apple:nope' });
    await p.start({ voiceId: 'apple:x' });
    expect(events.map((e) => [e.previewId.startsWith('invalid') ? 'invalid' : e.previewId, e.state])).toEqual([['a', 'refused'], ['b', 'refused'], ['c', 'refused'], ['d', 'refused'], ['invalid', 'refused']]);
    expect(events[3]!.reason).toMatch(/not installed/);
    expect(synths).toHaveLength(0);
    const r2 = rig();
    void r2.p.start({ previewId: 's', voiceId: 'apple:x', sample: 1 });
    await tick(5);
    expect(r2.synths[0]!.text).toBe('Could you say that again, a little more slowly?');
  });

  it('refuses (never plays) when the Mac sound output is a virtual microphone — checked after rendering, right before playback', async () => {
    const { p, plays, events, safetyCalls } = rig({ safety: { ok: false, reason: 'Your Mac\'s sound output is "BlackHole 16ch"', output: 'BlackHole 16ch' } });
    await p.start({ previewId: 'p', voiceId: 'apple:x' });
    expect(safetyCalls()).toBe(1);
    expect(plays).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ state: 'refused', reason: expect.stringMatching(/BlackHole/), output: 'BlackHole 16ch' });
  });

  it('stop ends a playing preview at once; a new preview replaces the old one; stop during rendering cancels it', async () => {
    const { p, plays, events } = rig();
    void p.start({ previewId: 'p1', voiceId: 'apple:x' });
    await until(() => plays.length === 1);
    p.stop();
    expect(plays[0]!.stopped).toBe(true);
    expect(events.at(-1)).toMatchObject({ previewId: 'p1', state: 'stopped' });
    void p.start({ previewId: 'p2', voiceId: 'apple:x' });
    await until(() => plays.length === 2);
    void p.start({ previewId: 'p3', voiceId: 'apple:x' });
    await until(() => plays.length === 3);
    expect(plays[1]!.stopped).toBe(true);
    expect(events.filter((e) => e.previewId === 'p2').at(-1)).toMatchObject({ state: 'stopped', reason: 'Replaced by a newer preview.' });

    const slow = rig({ synth: () => new Promise((r) => setTimeout(r, 30)) });
    const run = slow.p.start({ previewId: 'q', voiceId: 'apple:x' });
    await tick(5);
    slow.p.stop('Voice output stopped.');
    await run;
    expect(slow.plays).toHaveLength(0);
    expect(slow.events.map((e) => e.state)).toEqual(['synthesizing', 'stopped']);
  });

  it('a render failure fails the preview; nothing plays', async () => {
    const { p, plays, events } = rig({ synth: async () => { throw new Error('voice engine unavailable'); } });
    await p.start({ previewId: 'f', voiceId: 'apple:x' });
    expect(plays).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: expect.stringMatching(/voice engine unavailable/) });
  });
});
