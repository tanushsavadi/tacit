// In-memory reproductions only. No real recognizer, TTS, sockets, recordings or audio route.
// Run: server/node_modules/.bin/tsx docs/demo-review-races-codex.mts
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { LiveSession, type RecognizerResult } from '../server/src/live.ts';
import { SpeechOutput } from '../server/src/speech.ts';
import { buildReviewedRequest } from '../server/src/reviewed.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const releases: ((r: RecognizerResult) => void)[] = [];
const live = new LiveSession(() => new Promise(resolve => releases.push(resolve)), () => {});
live.control({ type: 'live_control', action: 'activate', mode: 'display-only' });
function submit(id: string, start: number) {
  live.utterance({ type: 'visual_utterance', utteranceId: id, authorizationId: live.current.authorizationId!,
    startMs: start, endMs: start + 40, endpointMs: start + 520, frameTimesMs: [start, start + 40] });
  live.frame(Buffer.from('TEST ONLY')); live.frame(Buffer.from('TEST ONLY'));
}
const route = Object.assign(new EventEmitter(), {
  status: () => ({ state: 'ready' as const, deviceName: 'FAKE', deviceUid: 'FAKE', sampleRate: 44100,
    gainDb: 0, calibrated: true, readers: [], warnings: [], reason: null }),
  play: async () => ({ state: 'rendered' as const, startedAt: 0, renderedAt: 0 }), stop: () => {},
});
let synthesized = 0;
const speech = new SpeechOutput({ label: 'FAKE', synth: async () => {
  synthesized++;
  return { audio: Buffer.alloc(0), mime: 'audio/wav', voice: 'FAKE', requestTs: 0, firstByteTs: 0 };
} }, () => route, () => route.status());
speech.control('enable');

submit('older', 1000); releases[0]!({ text: 'OLDER TEST WORDS' }); await tick();
const old = live.reviewTarget()!;
submit('newer-in-progress', 2000);
const req = buildReviewedRequest(old, { index: 0 }, speech.status(), live.current, 'old-while-new');
assert.equal(typeof req, 'object');
speech.speakReviewed(req as Record<string, unknown>, live.current, live.reviewTarget()); await tick();
const pendingOldAccepted = synthesized === 1;
console.log(`${pendingOldAccepted ? 'REPRODUCED' : 'NOT REPRODUCED'}: old shown candidate accepted while a newer utterance is recognizing (fake synthesis only).`);
releases[1]!({ text: 'NEWER TEST WORDS' }); await tick();

submit('first-captured', 3000); submit('second-captured', 4000);
releases[3]!({ text: 'SECOND CAPTURED' }); await tick();
assert.equal(live.reviewTarget()?.utteranceId, 'second-captured');
releases[2]!({ text: 'FIRST CAPTURED' }); await tick();
const reversed = live.reviewTarget()?.utteranceId === 'first-captured';
console.log(`${reversed ? 'REPRODUCED' : 'NOT REPRODUCED'}: late older completion replaces a newer shown review target.`);
speech.control('stop'); live.close();

// Execute the actual terminal client with in-memory readline/WebSocket substitutes. Its imports
// are supplied here so it cannot load credentials, open a socket or change the shared runtime.
const require = createRequire(import.meta.url);
const ts = require('../server/node_modules/typescript');
const source = readFileSync(new URL('../server/scripts/review.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const sent: any[] = [];
let socket: EventEmitter, answer: (text: string) => void;
const readline = Object.assign(new EventEmitter(), {
  prompt() {}, write() {}, close() {}, question(_prompt: string, callback: (text: string) => void) { answer = callback; },
});
class FakeSocket extends EventEmitter {
  constructor() { super(); socket = this; }
  send(text: string) { sent.push(JSON.parse(text)); }
  close() {}
}
runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
  WebSocket: FakeSocket, randomUUID: () => 'test-request', createInterface: () => readline, buildReviewedRequest,
  secrets: { userToken: 'TEST-ONLY' }, console: { error() {} },
  process: { env: {}, stdin: {}, stdout: { write() {} }, exit() {} },
});
const message = (type: string, key: string, value: object) => socket!.emit('message', JSON.stringify({ type, [key]: value }), false);
const currentLive = { ...live.current, state: 'active', authorizationId: old.authorizationId, generation: old.generation };
message('live_status', 'status', currentLive);
message('output_status', 'status', { ...speech.status(), state: 'ready', authorizationId: 'FAKE-OUTPUT' });
message('recognition_hypothesis', 'hypothesis', old);
readline.emit('line', 'e 1');
message('recognition_hypothesis', 'hypothesis', { ...old, utteranceId: 'replacement-during-edit' });
answer!('My correction for the first utterance');
const retargeted = sent.at(-1)?.type === 'speak_reviewed' && sent.at(-1)?.utteranceId === 'replacement-during-edit';
console.log(`${retargeted ? 'REPRODUCED' : 'NOT REPRODUCED'}: terminal correction silently rebinds to a replacement utterance during editing (actual client with fake IO).`);
// This is a diagnostic, not a green regression test: nonzero explicitly flags a reproduced defect.
process.exitCode = pendingOldAccepted || reversed || retargeted ? 1 : 0;
