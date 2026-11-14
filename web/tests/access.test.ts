import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socketUrl } from '../src/access.ts';
test('user and caller sockets carry only their role-specific capability',()=>{
  const user=new URL(socketUrl('http://localhost:5173','/ws','test-user-capability'));
  assert.equal(user.protocol,'ws:');assert.equal(user.searchParams.get('token'),'test-user-capability');assert.equal(user.searchParams.has('invite'),false);
  const caller=new URL(socketUrl('https://tacit.example','/ws/caller','test-caller-capability'));
  assert.equal(caller.protocol,'wss:');assert.equal(caller.searchParams.get('invite'),'test-caller-capability');assert.equal(caller.searchParams.has('token'),false);
});
test('local development without access does not append a credential query',()=>{
  assert.equal(socketUrl('http://localhost:5173','/ws'),'ws://localhost:5173/ws');
});
