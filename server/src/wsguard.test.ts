import { describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { guardSockets } from './wsguard.ts';

describe('guardSockets', () => {
  it('an oversized message closes only that socket (1009); the server keeps accepting connections', async () => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', maxPayload: 1024 });
    const logs: string[] = [];
    guardSockets(wss, 'test', (l) => logs.push(l));
    await new Promise((r) => wss.once('listening', r));
    const url = `ws://127.0.0.1:${(wss.address() as { port: number }).port}`;
    const a = new WebSocket(url);
    await new Promise((r) => a.once('open', r));
    const code = await new Promise<number>((r) => { a.once('close', (c) => r(c)); a.send(Buffer.alloc(4096)); });
    expect(code).toBe(1009);
    expect(logs).toEqual([expect.stringContaining('WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')]);
    const b = new WebSocket(url);
    await new Promise((r) => b.once('open', r));
    b.close();
    await new Promise((r) => wss.close(r));
  });
});
