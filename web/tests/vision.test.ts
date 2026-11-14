import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { emptyFrame, extractFeatures, type VisionFrame } from '../src/vision/features.ts';
import { MouthGestureRecognizer } from '../src/vision/recognizer.ts';

const ctx = { candidateSetId: 'set-a', enabled: true };
const frame = (t: number, jaw = 0.8, smile = 0.05, pucker = 0.05): VisionFrame => ({ ...emptyFrame(t), tracked: true, jaw, smile, pucker });
const hold = (r: MouthGestureRecognizer, start = 100, context = ctx, gesture = [0.8, 0.05, 0.05]) => {
  let result = r.update(frame(start, ...gesture), context);
  for (let t = start + 100; t <= start + 900; t += 100) result = r.update(frame(t, ...gesture), context);
  return result;
};
test('selects only after 900ms continuous dominant gesture', () => {
  const r = new MouthGestureRecognizer();
  for (let t = 100; t < 1000; t += 100) assert.equal(r.update(frame(t), ctx).selectedIndex, null);
  assert.equal(r.update(frame(1000), ctx).selectedIndex, 0);
});
test('all three gesture dimensions map to their actual slots', () => {
  [[0.8,0.05,0.05],[0.05,0.8,0.05],[0.05,0.05,0.8]].forEach((g,i) => assert.equal(hold(new MouthGestureRecognizer(),100,ctx,g).selectedIndex,i));
});
test('rest and ambiguous mouth expressions abstain', () => {
  assert.equal(hold(new MouthGestureRecognizer(),100,ctx,[0.1,0.1,0.1]).bestIndex,null);
  assert.equal(hold(new MouthGestureRecognizer(),100,ctx,[0.8,0.75,0.1]).bestIndex,null);
});
test('tracking loss and frame gaps discard accumulated holds', () => {
  const r = new MouthGestureRecognizer();
  for (let t=100;t<=700;t+=100) r.update(frame(t),ctx);
  r.update(emptyFrame(750),ctx);
  assert.equal(r.update(frame(1000),ctx).progress,0);
  r.update(frame(1100),ctx);
  assert.equal(r.update(frame(1400),ctx).progress,0);
});
test('a changed candidate set cannot reuse the old hold', () => {
  const r=new MouthGestureRecognizer();
  for (let t=100;t<=700;t+=100) r.update(frame(t),ctx);
  const out=r.update(frame(800),{...ctx,candidateSetId:'set-b'});
  assert.equal(out.progress,0); assert.equal(out.selectedIndex,null); assert.equal(out.candidateSetId,'set-b');
});
test('disabled / ended call cannot select', () => {
  assert.equal(hold(new MouthGestureRecognizer(),100,{...ctx,enabled:false}).selectedIndex,null);
  assert.equal(hold(new MouthGestureRecognizer(),100,{...ctx,candidateSetId:null}).selectedIndex,null);
});
test('selection fires once until a neutral release', () => {
  const r=new MouthGestureRecognizer();
  assert.equal(hold(r).selectedIndex,0);
  assert.equal(r.update(frame(1100),ctx).selectedIndex,null);
  for (let t=1200;t<=1600;t+=100) r.update(frame(t,0.05,0.05,0.05),ctx);
  assert.equal(hold(r,1700).selectedIndex,0);
});
test('neutral calibration rejects insufficient data and subtracts resting expression', () => {
  const r=new MouthGestureRecognizer();
  assert.equal(r.calibrate([frame(1)]),false);
  assert.equal(r.calibrate(Array.from({length:13},(_,i)=>frame(i*100,0.65,0.05,0.05))),true);
  assert.equal(hold(r,2000,ctx,[0.65,0.05,0.05]).bestIndex,null);
  assert.equal(hold(r,4000,ctx,[0.95,0.05,0.05]).selectedIndex,0);
});
test('feature extractor handles absent faces without fabricated tracking', () => {
  assert.equal(extractFeatures({faceLandmarks:[],faceBlendshapes:[],facialTransformationMatrixes:[]},123,4).tracked,false);
});
test('feature extractor uses landmark ratios and actual blendshape coefficients', () => {
  const points=Array.from({length:478},()=>({x:0.5,y:0.5,z:0}));
  points[61]!.x=0.4;points[291]!.x=0.6;points[13]!.y=0.5;points[14]!.y=0.6;points[33]!.x=0.3;points[263]!.x=0.7;
  const input={faceLandmarks:[points],faceBlendshapes:[{categories:[{categoryName:'jawOpen',score:0.7},{categoryName:'mouthSmileLeft',score:0.4},{categoryName:'mouthSmileRight',score:0.6},{categoryName:'mouthPucker',score:0.2}]}],facialTransformationMatrixes:[]} as FaceLandmarkerResult;
  const out=extractFeatures(input,100,8);
  assert.equal(out.tracked,true);assert.equal(out.jaw,0.7);assert.equal(out.smile,0.5);assert.equal(out.pucker,0.2);assert.ok(Math.abs(out.mouthAspect-0.5)<0.001);assert.equal(out.inferenceMs,8);
});
