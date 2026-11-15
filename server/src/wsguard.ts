import type { WebSocketServer } from 'ws';

/**
 * Every accepted socket gets an 'error' listener. Without one, a protocol error on a single connection — e.g. a frame
 * above the server's maxPayload (ws closes it with 1009) — is an unhandled 'error' event that terminates the whole
 * server. Attach right after creating the server, before any other 'connection' handler.
 */
export function guardSockets(wss: WebSocketServer, label: string, log: (line: string) => void = console.log): void {
  wss.on('connection', (ws) => ws.on('error', (e: Error & { code?: string }) => log(`[${label}] socket closed on protocol error: ${e.code ?? e.message}`)));
}
