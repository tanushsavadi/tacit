import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { pickDevice, RouteHelper, type RouteDevice } from './route.ts';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const bh: RouteDevice = { uid: 'BlackHole2ch_UID', name: 'BlackHole 2ch', inputChannels: 2, outputChannels: 2, sampleRate: 48000, transport: 'virtual' };

function fakeChild() {
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new PassThrough(), stdin = new PassThrough();
  const sent: Record<string, unknown>[] = [];
  stdin.on('data', (d) => { for (const l of String(d).split('\n').filter(Boolean)) sent.push(JSON.parse(l)); });
  Object.assign(child, { stdout, stdin, stderr: new PassThrough() });
  const emit = (o: object) => stdout.write(`${JSON.stringify(o)}\n`);
  return { child, sent, emit };
}

function setup() {
  const children: ReturnType<typeof fakeChild>[] = [];
  const spawns: string[][] = [];
  const helper = new RouteHelper('/bin/tacit-route', bh, { gainDb: 16, calibrated: true }, (_b, args) => {
    spawns.push(args); const c = fakeChild(); children.push(c); return c.child;
  });
  return { helper, children, spawns, cur: () => children.at(-1)! };
}

describe('RouteHelper (tacit-route supervisor)', () => {
  it('spawns pinned to the device with the calibrated gain and reports ready', async () => {
    const { helper, spawns, cur } = setup();
    expect(spawns[0]).toEqual(['serve', '--device-uid', 'BlackHole2ch_UID', '--gain-db', '16']);
    expect(helper.status().state).toBe('starting');
    cur().emit({ event: 'ready', sampleRate: 48000, diagnostics: { warnings: [], inputReaders: [{ bundleID: 'com.apple.FaceTime' }] } });
    await tick();
    expect(helper.status()).toMatchObject({ state: 'ready', sampleRate: 48000, readers: ['com.apple.FaceTime'] });
    helper.close();
  });

  it('play resolves exactly once: started → rendered; interrupted; rejected → failed', async () => {
    const { helper, cur } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    let started = 0;
    const p1 = helper.play('a', Buffer.from('RIFF'), 'audio/wav', () => started++);
    const p2 = helper.play('b', Buffer.from('RIFF'), 'audio/wav');
    const p3 = helper.play('c', Buffer.from('ID3'), 'audio/mpeg');
    await tick(20);
    const plays = cur().sent.filter((s) => s.op === 'play');
    expect(plays.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(String(plays[2]!.path)).toMatch(/speech\.mp3$/);
    cur().emit({ event: 'started', id: 'a' });
    cur().emit({ event: 'finished', id: 'a' });
    cur().emit({ event: 'finished', id: 'a' }); // duplicate terminal event is ignored
    cur().emit({ event: 'interrupted', id: 'b', reason: 'user paused' });
    cur().emit({ event: 'rejected', id: 'c', reason: 'queue full (8)' });
    expect(await p1).toMatchObject({ state: 'rendered' });
    expect(started).toBe(1);
    expect(await p2).toMatchObject({ state: 'interrupted', reason: 'user paused' });
    expect(await p3).toMatchObject({ state: 'failed', reason: 'queue full (8)' });
    helper.close();
  });

  it('device loss → unavailable, plays refused; helper crash interrupts open plays and restarts', async () => {
    const { helper, cur, children } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    const open = helper.play('x', Buffer.from('RIFF'), 'audio/wav');
    await tick(20);
    cur().child.emit('exit', 1);
    expect(await open).toMatchObject({ state: 'interrupted', reason: 'route helper exited' });
    expect(helper.status().state).toBe('error');
    await tick(600);
    expect(children).toHaveLength(2);
    cur().emit({ event: 'device_lost', message: 'output device removed' }); await tick();
    expect(helper.status()).toMatchObject({ state: 'unavailable' });
    expect(await helper.play('y', Buffer.from('RIFF'), 'audio/wav')).toMatchObject({ state: 'failed' });
    cur().emit({ event: 'device_restored', sampleRate: 48000 }); await tick();
    expect(helper.status().state).toBe('ready');
    helper.close();
  });

  it('a stop that arrives while audio is still being staged prevents it from ever being sent', async () => {
    const { helper, cur } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    const p = helper.play('late', Buffer.from('RIFF'), 'audio/wav');
    helper.stop('Paused.');
    expect(await p).toMatchObject({ state: 'interrupted', reason: 'stopped before playback' });
    await tick(20);
    expect(cur().sent.filter((s) => s.op === 'play')).toHaveLength(0);
    helper.close();
  });

  it('stop is enforced: a helper that does not acknowledge is killed and plays end interrupted', async () => {
    RouteHelper.STOP_ACK_MS = 30;
    const { helper, cur } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    let killed = '';
    (cur().child as unknown as { kill: (s: string) => void }).kill = (s: string) => { killed = s; };
    const p = helper.play('hung', Buffer.from('RIFF'), 'audio/wav');
    await tick(20);
    helper.stop('Paused.');
    expect(await p).toMatchObject({ state: 'interrupted', reason: expect.stringContaining('stopped by force') });
    expect(killed).toBe('SIGKILL');
    helper.close();
  });

  it('an EPIPE on the helper stdin interrupts open plays instead of crashing', async () => {
    const { helper, cur } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    const p = helper.play('x', Buffer.from('RIFF'), 'audio/wav');
    await tick(20);
    (cur().child.stdin as unknown as EventEmitter).emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    expect(await p).toMatchObject({ state: 'interrupted', reason: 'route helper pipe closed' });
    helper.close();
  });

  it('stop forwards to the helper; picks BlackHole 2ch over 16ch and never a non-BlackHole device by default', async () => {
    const { helper, cur } = setup();
    cur().emit({ event: 'ready', sampleRate: 48000 }); await tick();
    helper.stop('Paused.');
    await tick();
    expect(cur().sent.at(-1)).toEqual({ op: 'stop', reason: 'Paused.' });
    helper.close();
    const devs: RouteDevice[] = [
      { ...bh, uid: 'BlackHole16ch_UID', name: 'BlackHole 16ch', inputChannels: 16, outputChannels: 16 }, bh,
      { ...bh, uid: 'zoom', name: 'ZoomAudioDevice' }];
    expect(pickDevice(devs, undefined)?.uid).toBe('BlackHole2ch_UID');
    expect(pickDevice(devs.slice(0, 1), undefined)?.uid).toBe('BlackHole16ch_UID');
    expect(pickDevice([devs[2]!], undefined)).toBeNull();
    expect(pickDevice(devs, 'missing')).toBeNull();
  });
});
