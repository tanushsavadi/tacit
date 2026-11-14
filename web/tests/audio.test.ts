import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PcmEncoder } from '../src/audio/pcm.ts';
function encode(rate: number, parts: Float32Array[][]) {
  const chunks: ArrayBuffer[] = [];
  const encoder = new PcmEncoder(rate, buffer => chunks.push(buffer));
  parts.forEach(part => encoder.push(part));
  return chunks;
}
test('PCM encodes clipping and signed little-endian at 16kHz', () => {
  const values = new Float32Array(320).fill(0.5); values[0] = -2; values[1] = 2;
  const chunks = encode(16000, [[values]]);
  assert.equal(chunks.length, 1); assert.equal(chunks[0]!.byteLength, 640);
  const view = new DataView(chunks[0]!);
  assert.equal(view.getInt16(0, true), -32768); assert.equal(view.getInt16(2, true), 32767); assert.equal(view.getInt16(4, true), 16384);
});
test('resampling keeps rate, state and samples across arbitrary render quanta', () => {
  for (const rate of [16000,44100,48000,96000]) {
    const input = Float32Array.from({length:rate},(_,i)=>Math.sin(2*Math.PI*220*i/rate)*0.4);
    const whole = encode(rate, [[input]]);
    const split = encode(rate, Array.from({length:Math.ceil(rate/128)},(_,i)=>[input.slice(i*128,(i+1)*128)]));
    assert.equal(whole.length,50); assert.equal(split.length,50);
    assert.deepEqual(Buffer.concat(split.map(b=>Buffer.from(b))),Buffer.concat(whole.map(b=>Buffer.from(b))));
  }
});
test('stereo downmix prevents doubling amplitude and rejects invalid rates', () => {
  const chunks = encode(48000, [[new Float32Array(960).fill(1),new Float32Array(960).fill(-1)]]);
  assert.equal(new Int16Array(chunks[0]!).every(x=>x===0),true);
  assert.throws(()=>new PcmEncoder(NaN,()=>{}));
});
