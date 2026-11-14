import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoReadiness, readinessAction, type ReadinessFacts } from '../src/silent/readiness.ts';
import { activationBlock, unavailableSilentSpeechPort } from '../src/silent/port.ts';

const base = (): ReadinessFacts => ({ connected: true, recognitionReady: true, camera: 'tracked', routeState: 'ready', deviceName: 'BlackHole 16ch', readers: [], outputAuthorized: false, automaticPermitted: false });
const item = (facts: ReadinessFacts, id: string) => demoReadiness(facts).find(entry => entry.id === id)!;

test('a ready virtual microphone with no readers still needs a calling app', () => {
  const route = item(base(), 'route');
  assert.equal(route.level, 'setup');
  assert.match(route.detail, /No calling app is reading it/);
  assert.match(route.detail, /not verified/);
  assert.equal(item(base(), 'automatic').level, 'unavailable');
  assert.equal(item(base(), 'audibility').level, 'unknown');
  assert.equal(item(base(), 'recognition').level, 'ready');
  assert.equal(item(base(), 'silent').level, 'experimental');
});
test('FaceTime reading the device is local evidence only', () => {
  const route = item({ ...base(), readers: ['com.apple.FaceTime'] }, 'route');
  assert.equal(route.level, 'ready');
  assert.match(route.detail, /FaceTime is reading/);
  assert.match(route.detail, /not verified/);
});
test('unknown readers, a down route, and a missing recognizer stay distinct', () => {
  assert.equal(item({ ...base(), readers: null }, 'route').level, 'unknown');
  assert.equal(item({ ...base(), routeState: 'unavailable' }, 'route').level, 'unavailable');
  assert.equal(item({ ...base(), routeState: null }, 'route').level, 'unknown');
  assert.equal(item({ ...base(), recognitionReady: false }, 'recognition').level, 'unavailable');
  assert.equal(item({ ...base(), camera: 'error' }, 'camera').level, 'setup');
  assert.equal(item({ ...base(), camera: 'off' }, 'camera').level, 'setup');
  assert.equal(item({ ...base(), connected: false }, 'connection').level, 'setup');
});
test('typed output cannot look authorized when the route is down', () => {
  assert.equal(item({ ...base(), routeState: 'error', outputAuthorized: true }, 'typed').level, 'unavailable');
  assert.equal(item({ ...base(), outputAuthorized: true }, 'typed').level, 'ready');
  assert.match(readinessAction(demoReadiness({ ...base(), camera: 'off' })), /Start Live preview/);
});
test('automatic speech cannot be activated from an unvalidated port', () => {
  const port = unavailableSilentSpeechPort(true);
  assert.match(activationBlock(port, null, 'camera', 'automatic')!, /gated|validated|connected/i);
  assert.equal(port.availability.automaticSpeechValidated, false);
});
