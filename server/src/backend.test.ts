import { mkdtempSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TurnRecord } from '../../shared/protocol.ts';
import { turnStages } from '../../shared/metrics.ts';
import { authorizeUpgrade, loadSecrets, StreamTokens, type AuthConfig } from './auth.ts';
import { TurnLog } from './turnlog.ts';
import { LOCAL_MODEL, withLabelledFallback } from './candidates.ts';
import { twiml } from './twilio.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'tacit-test-'));

describe('auth', () => {
  const cfg: AuthConfig = { secrets: { userToken: 'U'.repeat(32), callerToken: 'C'.repeat(32) }, allowedOrigins: ['https://pub.example'], disabled: false };
  const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers: { host: 'localhost:8790', ...headers } });

  it('requires the right token for the right channel', () => {
    expect(authorizeUpgrade(req(`/ws?token=${'U'.repeat(32)}`), cfg)).toEqual({ ok: true, role: 'user' });
    expect(authorizeUpgrade(req(`/ws/caller?invite=${'C'.repeat(32)}`), cfg)).toEqual({ ok: true, role: 'caller' });
    expect(authorizeUpgrade(req('/ws'), cfg)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeUpgrade(req(`/ws?token=${'C'.repeat(32)}`), cfg)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeUpgrade(req(`/ws/caller?invite=${'U'.repeat(32)}`), cfg)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeUpgrade(req(`/nope?token=${'U'.repeat(32)}`), cfg)).toMatchObject({ ok: false, status: 404 });
  });

  it('allows same-host and allow-listed origins only', () => {
    const t = `/ws?token=${'U'.repeat(32)}`;
    expect(authorizeUpgrade(req(t, { origin: 'http://localhost:8790' }), cfg).ok).toBe(true);
    expect(authorizeUpgrade(req(t, { origin: 'https://pub.example' }), cfg).ok).toBe(true);
    expect(authorizeUpgrade(req(t, { origin: 'https://evil.example' }), cfg)).toMatchObject({ ok: false, status: 403 });
    expect(authorizeUpgrade(req(t, { origin: 'not a url' }), cfg)).toMatchObject({ ok: false, status: 403 });
  });

  it('persists generated secrets with 0600 permissions and reuses them', () => {
    const file = join(tmp(), 'secrets.json');
    const a = loadSecrets(file, {});
    expect(a.userToken).not.toBe(a.callerToken);
    expect(a.userToken.length).toBeGreaterThanOrEqual(32);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadSecrets(file, {})).toEqual(a);
  });

  it('stream tokens are single-use and expire', () => {
    let now = 0;
    const st = new StreamTokens(1000, () => now);
    const a = st.issue();
    expect(st.consume(a)).toBe(true);
    expect(st.consume(a)).toBe(false);
    const b = st.issue();
    now = 2000;
    expect(st.consume(b)).toBe(false);
    expect(st.consume(undefined)).toBe(false);
  });

  it('TwiML carries the stream token as a <Parameter> and escapes values', () => {
    const x = twiml('wss://h/twilio/media', 'a"b<c');
    expect(x).toContain('<Parameter name="token" value="a&#34;b&#60;c"/>');
  });
});

const turn = (over: Partial<TurnRecord> = {}): TurnRecord => ({
  turnId: 't', sessionId: 's', transport: 'browser-ws', utteranceId: 'u', callerText: 'secret caller words',
  candidateMode: 'baseline', options: ['a', 'b', 'c'], t: { transcriptFinal: 1 }, selectionAttempts: 1, abstentions: 0,
  cancellations: 0, alternativesRequested: 0, selectionSource: 'tap', confirmSource: 'key', chosenIndex: 0,
  spokenText: 'a', recognition: null, playbackAckKind: null, targetIndex: null, outcome: 'spoken', ...over,
});

describe('TurnLog', () => {
  it('writes nothing by default', async () => {
    const file = join(tmp(), 'turns.jsonl');
    const log = new TurnLog(file);
    expect(log.get()).toMatchObject({ mode: 'off', source: 'default' });
    await log.record(turn());
    expect(existsSync(file)).toBe(false);
  });

  it('timings mode drops conversation text; full keeps it; files are 0600', async () => {
    const file = join(tmp(), 'turns.jsonl');
    const log = new TurnLog(file);
    log.setMode('timings');
    await log.record(turn());
    log.setMode('full');
    await log.record(turn());
    const [a, b] = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(a.callerText).toBeUndefined();
    expect(a.spokenText).toBeUndefined();
    expect(a.t).toEqual({ transcriptFinal: 1 });
    expect(b.callerText).toBe('secret caller words');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(log.get()).toMatchObject({ mode: 'full', source: 'user', storedTurns: 2 });
  });

  it('prunes past retention and deletes on request', async () => {
    const file = join(tmp(), 'turns.jsonl');
    const DAY = 86_400_000;
    let now = 100 * DAY;
    const log = new TurnLog(file, { mode: 'full', retentionDays: 7, now: () => now });
    expect(log.get().source).toBe('env');
    writeFileSync(file, JSON.stringify({ loggedAt: now - 8 * DAY }) + '\n' + JSON.stringify({ loggedAt: now - DAY }) + '\n');
    expect(await log.prune()).toBe(1);
    expect(log.get().storedTurns).toBe(1);
    await log.deleteAll();
    expect(existsSync(file)).toBe(false);
    now += 1;
  });
});

describe('turnStages', () => {
  it('separates system stages from human stages and never invents missing ones', () => {
    const s = turnStages({
      t: { callerSpeechEnd: 0, transcriptFinal: 900, generationRequested: 900, candidatesReady: 2100, candidatesDisplayed: 2150, proposal: 5000, confirmation: 6200, ttsRequest: 6200, ttsFirstByte: 7000, firstAudioSent: 7010 },
      audioMs: 1500,
    });
    expect(s).toMatchObject({ transcriptionMs: 900, generationMs: 1200, displayMs: 50, selectionMs: 2850, confirmationMs: 1200, synthesisMs: 800, sendMs: 10, audioMs: 1500 });
    expect(s.postConfirmMs).toBe(810);
    expect(s.systemMs).toBe(900 + 1200 + 810);
    expect(s.playbackMs).toBeUndefined();
  });
});

describe('withLabelledFallback', () => {
  it('labels local output with the Gemini failure reason', async () => {
    const gen = withLabelledFallback(async () => {
      throw new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}');
    });
    const out = await gen({ transcript: [{ role: 'caller', text: 'Are you coming?', ts: 1 }], mode: 'baseline', avoid: [], round: 0 });
    expect(out.model).toBe(`${LOCAL_MODEL} — Gemini unavailable: overloaded (503)`);
    expect(out.options).toHaveLength(3);
  });

  it('passes Gemini output through untouched', async () => {
    const real = { options: [], mode: 'baseline' as const, distinguishability: null, model: 'gemini-x', generationMs: 5 };
    expect(await withLabelledFallback(async () => real)({ transcript: [], mode: 'baseline', avoid: [], round: 0 })).toBe(real);
  });
});
