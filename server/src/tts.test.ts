import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audioDurationMs, checkElevenLabsVoice, createTts, elevenLabs, stripWavHeader, TtsCache, VoiceRouter, type Tts } from './tts.ts';

// Local mock of the two ElevenLabs endpoints TACIT uses. Verifies request shape; NOT the real service.
let server: Server;
let base = '';
const seen: Array<{ url: string; key: string | undefined; body: any }> = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    seen.push({ url: req.url!, key: req.headers['xi-api-key'] as string | undefined, body });
    if (req.headers['xi-api-key'] !== 'good-key') return void res.writeHead(401).end('{"detail":"invalid api key"}');
    if (req.url!.startsWith('/v1/voices/')) {
      const id = req.url!.split('/').pop();
      if (id === 'missing') return void res.writeHead(404).end('{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ name: id === 'mine' ? 'My Voice' : 'Rachel', category: id === 'mine' ? 'cloned' : 'premade' }));
    }
    const fmt = new URL(req.url!, 'http://x').searchParams.get('output_format');
    res.writeHead(200, { 'content-type': fmt === 'ulaw_8000' ? 'audio/basic' : 'audio/mpeg' });
    res.end(Buffer.alloc(fmt === 'ulaw_8000' ? 1600 : 3200, 1)); // 200 ms either way
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

describe('ElevenLabs (local mock)', () => {
  it('requests MP3 for browsers and raw μ-law for Twilio with the key, voice and model', async () => {
    const el = elevenLabs({ apiKey: 'good-key', voiceId: 'mine', modelId: 'eleven_flash_v2_5', baseUrl: base });
    const mp3 = await el.synth('Hello there', 'file');
    const ulaw = await el.synth('Hello there', 'ulaw_8000');
    expect(seen.at(-2)).toMatchObject({ url: '/v1/text-to-speech/mine?output_format=mp3_44100_128', key: 'good-key', body: { text: 'Hello there', model_id: 'eleven_flash_v2_5' } });
    expect(seen.at(-1)!.url).toBe('/v1/text-to-speech/mine?output_format=ulaw_8000');
    expect(mp3.mime).toBe('audio/mpeg');
    expect(ulaw.mime).toBe('audio/x-mulaw;rate=8000');
    expect(audioDurationMs(mp3.audio, mp3.mime)).toBe(200);
    expect(audioDurationMs(ulaw.audio, ulaw.mime)).toBe(200);
    expect(mp3.voice).toMatch(/elevenlabs:mine .*personal voice/);
  });

  it('voice check distinguishes a cloned (personal) voice from a premade library voice', async () => {
    expect(await checkElevenLabsVoice('good-key', 'mine', base)).toMatchObject({ ok: true, personal: true, category: 'cloned' });
    expect(await checkElevenLabsVoice('good-key', 'rachel', base)).toMatchObject({ ok: true, personal: false, category: 'premade' });
    expect(await checkElevenLabsVoice('good-key', 'missing', base)).toMatchObject({ ok: false, error: 'HTTP 404' });
    expect(await checkElevenLabsVoice('wrong-key', 'mine', base)).toMatchObject({ ok: false, error: 'HTTP 401' });
  });
});

describe('createTts consent gate', () => {
  it('uses the personal voice only with key + voice ID + explicit consent', () => {
    expect(createTts({}).reason).toMatch(/not configured/);
    expect(createTts({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }).reason).toMatch(/CONSENT=self not set/);
    expect(createTts({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }).tts.personal).toBe(false);
    const ok = createTts({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_VOICE_CONSENT: 'self' });
    expect(ok.reason).toBeNull();
    expect(ok.tts.personal).toBe(true);
    expect(ok.tts.status()).toMatchObject({ allowSystemFallback: false, personalPresynth: false, presynthActive: false });
  });
});

describe('VoiceRouter policy (user authorization of voice)', () => {
  const sys = (): Tts & { n: number } => {
    const t = { n: 0, label: 'macos-say (system voice, not personal)', personal: false, async synth() { t.n++; return { audio: Buffer.alloc(4), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 'macos-say (system voice, not personal)' }; } };
    return t;
  };
  const failing: Tts = { label: 'elevenlabs:mine (personal voice)', personal: true, synth: async () => { throw new Error('ElevenLabs HTTP 429: quota'); } };
  const working: Tts = { label: 'elevenlabs:mine (personal voice)', personal: true, synth: async () => ({ audio: Buffer.alloc(4), mime: 'audio/mpeg', requestTs: 0, firstByteTs: 0, voice: 'elevenlabs:mine (personal voice)' }) };

  it('never substitutes the system voice without the user approving it', async () => {
    const s = sys();
    const r = new VoiceRouter(s, failing, null, {});
    await expect(r.synth('Hi')).rejects.toThrow(/Personal voice failed \(ElevenLabs HTTP 429: quota\)\. The system voice is not approved/);
    expect(s.n).toBe(0); // nothing synthesized in another voice
    r.setPolicy({ allowSystemFallback: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await r.synth('Hi');
    warn.mockRestore();
    expect(out.voice).toMatch(/SUBSTITUTED for your personal voice \(approved fallback; personal voice failed/);
  });

  it('an unavailable personal voice (failed startup check) is refused, not silently replaced', async () => {
    const r = new VoiceRouter(sys(), working, null, {});
    r.disablePersonal("voice category 'premade' is not a cloned voice");
    await expect(r.synth('Hi')).rejects.toThrow(/unavailable .*premade/);
    expect(r.status()).toMatchObject({ personalConfigured: true, personalAvailable: false });
  });

  it('pre-synthesis: system voice by default; personal voice only after opt-in; TTS_PRESYNTH=off disables', () => {
    expect(new VoiceRouter(sys(), null, null, {}).presynthAllowed()).toBe(true);
    expect(new VoiceRouter(sys(), null, null, { TTS_PRESYNTH: 'off' }).presynthAllowed()).toBe(false);
    const p = new VoiceRouter(sys(), working, null, { TTS_PRESYNTH: 'on' }); // operator env cannot opt the user in
    expect(p.presynthAllowed()).toBe(false);
    p.setPolicy({ personalPresynth: true });
    expect(p.presynthAllowed()).toBe(true);
  });

  it('TtsCache skips personal-voice pre-synthesis until opt-in and never reuses audio across a policy change', async () => {
    let n = 0;
    const counting: Tts = { ...working, synth: async (t) => { n++; return { audio: Buffer.from(t), mime: 'audio/mpeg', requestTs: 0, firstByteTs: 0, voice: 'p' }; } };
    const r = new VoiceRouter(sys(), counting, null, {});
    const cache = new TtsCache(r, 'file');
    cache.prepare(['A', 'B', 'C']);
    expect(n).toBe(0); // no speculative personal-voice synthesis by default
    r.setPolicy({ personalPresynth: true });
    cache.prepare(['A', 'B', 'C']);
    expect(n).toBe(3);
    r.setPolicy({ allowSystemFallback: true }); // policy change → cached audio not reused
    expect((await cache.get('A')).cached).toBe(false);
  });
});

describe('audio helpers', () => {
  it('strips a WAV container from μ-law and leaves raw bytes alone', () => {
    const data = Buffer.from([1, 2, 3, 4]);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.write('data', 36); hdr.writeUInt32LE(4, 40);
    expect(stripWavHeader(Buffer.concat([hdr, data]))).toEqual(data);
    expect(stripWavHeader(data)).toBe(data);
  });

  it('TtsCache retries a failed pre-synthesis at speak time', async () => {
    let n = 0;
    const flaky: Tts = { label: 't', personal: false, synth: async (text) => { if (n++ === 0) throw new Error('boom'); return { audio: Buffer.from(text), mime: 'audio/wav', requestTs: 0, firstByteTs: 0, voice: 't' }; } };
    const cache = new TtsCache(flaky, 'file', true);
    cache.prepare(['A']);
    await new Promise((r) => setTimeout(r, 0));
    const r = await cache.get('A');
    expect(r.cached).toBe(false);
    expect(r.audio.toString()).toBe('A');
  });
});
