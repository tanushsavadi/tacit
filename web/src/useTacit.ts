import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, Snapshot } from '../../shared/protocol.ts';
import { SpeechOutputPort } from './silent/speechOutput.ts';
import { LiveSocketPort } from './silent/liveSocket.ts';
import { previewSnapshot, reducePreview } from './dev/previewAdapter.ts';
import { readAccess, socketUrl, storeAccess } from './access.ts';

export function wsUrl(path: string): string {
  return socketUrl(location.origin, path, readAccess(path === '/ws/caller' ? 'caller' : 'user'));
}

/** The backend owns call state. Preview never opens a socket or makes audio. */
export function useTacit(preview = false) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => preview ? previewSnapshot(Date.now(), new URLSearchParams(location.search).get('content') === 'long' ? 'long' : 'default') : null);
  const [, setLiveRevision] = useState(0);
  const [outputPort] = useState(() => new SpeechOutputPort(() => setLiveRevision(n => n + 1)));
  const [livePort] = useState(() => new LiveSocketPort(() => setLiveRevision(n => n + 1)));
  const [connected, setConnected] = useState(false);
  const [lastCue, setLastCue] = useState<{ cue: string; t: number } | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [accessRequired, setAccessRequired] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [callerInvite, setCallerInvite] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const accessRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (preview) return;
    let stopped = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    setConnected(false); setConnectionError(null);
    const connect = async () => {
      if (stopped) return;
      const access = accessRef.current ?? readAccess('user');
      accessRef.current = access;
      try {
        // Preflight distinguishes missing/invalid access from a dropped connection.
        const response = await fetch('/api/health', { headers: access ? { Authorization: `Bearer ${access}` } : {}, signal: abort.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Server unavailable');
        const health = await response.json() as { authRequired?: boolean };
        if (stopped) return;
        if (health.authRequired) {
          setAccessRequired(true);
          setConnectionError(access ? 'This access code was not accepted. Use the current private TACIT link.' : null);
          return;
        }
        setAccessRequired(false);
        const ws = new WebSocket(socketUrl(location.origin, '/ws', access));
        wsRef.current = ws;
        ws.onopen = () => { if (!stopped) { failures = 0; livePort.attach(ws); outputPort.attach(ws); setConnected(true); setConnectionError(null); } };
        ws.onclose = () => {
          if (stopped || wsRef.current !== ws) return;
          livePort.disconnect(); outputPort.disconnect(); setConnected(false); setCallerInvite(null);
          retry = setTimeout(connect, Math.min(10000, 1000 * 2 ** failures++));
        };
        ws.onmessage = ev => {
          if (stopped || wsRef.current !== ws) return;
          let msg: ServerMessage;
          try { msg = JSON.parse(ev.data) as ServerMessage; } catch { return; }
          livePort.receive(msg); outputPort.receive(msg);
          if (msg.type === 'snapshot') { livePort.updateSnapshot(msg.snapshot); setSnapshot(msg.snapshot); setClockOffset(msg.snapshot.now - Date.now()); }
          else if (msg.type === 'cue') setLastCue({ cue: msg.cue, t: Date.now() });
          else if (msg.type === 'session_info') {
            const invite = new URL(msg.callerInvitePath, location.origin);
            if (invite.origin === location.origin && invite.hash === '#caller') setCallerInvite(invite.href);
          }
        };
      } catch {
        if (!stopped) { setConnected(false); setConnectionError('The server is unavailable. Reconnecting…'); retry = setTimeout(connect, Math.min(10000, 1000 * 2 ** failures++)); }
      }
    };
    queueMicrotask(() => { if (!stopped) void connect(); });
    return () => { stopped = true; abort.abort(); clearTimeout(retry); livePort.disconnect(); outputPort.disconnect(); wsRef.current?.close(); };
  }, [preview, attempt, livePort, outputPort]);

  useEffect(() => {
    if (!preview || !snapshot?.proposal) return;
    const timeout = setTimeout(() => setSnapshot(s => s?.proposal ? { ...s, phase: 'CANCELLED', proposal: null } : s), Math.max(0, snapshot.proposal.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [preview, snapshot?.proposal?.id]);

  const send = useCallback((msg: ClientMessage) => {
    if (preview) { setSnapshot(s => reducePreview(s ?? previewSnapshot(), msg)); return; }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, [preview]);
  const authenticate = useCallback((value: string) => { accessRef.current = value.trim(); storeAccess('user', value); setAttempt(n => n + 1); }, []);
  return { outputPort, livePort, liveStatus: livePort.status, snapshot, connected: preview || connected, send, lastCue, clockOffset, accessRequired, connectionError, callerInvite, authenticate };
}
