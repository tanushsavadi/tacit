/**
 * Access control for the server's browser channels and Twilio media streams.
 *  - user token   → `/ws?token=…`         full control of the TACIT user's session
 *  - caller invite → `/ws/caller?invite=…` may only act as the remote caller
 *  - Twilio       → webhook signature (twilio.ts) + one-time stream token in TwiML <Parameter>
 * Browsers cannot set headers on WebSocket requests, so tokens travel in the query string; the server
 * never logs request URLs. Tokens come from env or are generated once into data/secrets.json (0600).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage } from 'node:http';

export type Role = 'user' | 'caller';

export interface Secrets {
  userToken: string;
  callerToken: string;
}

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function loadSecrets(file: string, env = process.env): Secrets {
  let stored: Partial<Secrets> = {};
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      stored = {};
    }
  }
  const secrets: Secrets = {
    userToken: env.TACIT_USER_TOKEN || stored.userToken || newToken(),
    callerToken: env.TACIT_CALLER_TOKEN || stored.callerToken || newToken(),
  };
  if (secrets.userToken !== stored.userToken || secrets.callerToken !== stored.callerToken) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return secrets;
}

export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (typeof a !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface AuthConfig {
  secrets: Secrets;
  /** Extra allowed browser origins (e.g. the public tunnel origin). Same-host origins are always allowed. */
  allowedOrigins: string[];
  /** Explicit development bypass (TACIT_AUTH=off); refused when a public URL is configured. */
  disabled: boolean;
}

export type AuthResult = { ok: true; role: Role } | { ok: false; status: 401 | 403 | 404; reason: string };

/** Browser Origin must be the same host the request was sent to, or explicitly allowed. */
export function originAllowed(req: Pick<IncomingMessage, 'headers'>, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (scripts, Twilio) send no Origin; tokens still apply
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const reqHost = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return host === reqHost || allowed.includes(origin);
}

/** Authorize a WebSocket upgrade for the browser channels. */
export function authorizeUpgrade(req: Pick<IncomingMessage, 'headers' | 'url'>, cfg: AuthConfig): AuthResult {
  const url = new URL(req.url ?? '/', 'http://x');
  const role: Role | null = url.pathname === '/ws' ? 'user' : url.pathname === '/ws/caller' ? 'caller' : null;
  if (!role) return { ok: false, status: 404, reason: 'unknown path' };
  if (!originAllowed(req, cfg.allowedOrigins)) return { ok: false, status: 403, reason: 'origin not allowed' };
  if (cfg.disabled) return { ok: true, role };
  const ok = role === 'user' ? safeEqual(url.searchParams.get('token'), cfg.secrets.userToken) : safeEqual(url.searchParams.get('invite'), cfg.secrets.callerToken);
  return ok ? { ok: true, role } : { ok: false, status: 401, reason: `missing or invalid ${role === 'user' ? 'token' : 'invite'}` };
}

/** One-time tokens binding a Twilio media stream to the webhook request that created it. */
export class StreamTokens {
  private readonly tokens = new Map<string, number>();
  constructor(private readonly ttlMs = 60_000, private readonly now: () => number = Date.now) {}

  issue(): string {
    const t = newToken();
    this.tokens.set(t, this.now() + this.ttlMs);
    return t;
  }

  /** Valid once, before expiry. */
  consume(token: string | undefined): boolean {
    if (!token) return false;
    const exp = this.tokens.get(token);
    this.tokens.delete(token);
    for (const [k, v] of this.tokens) if (v < this.now()) this.tokens.delete(k);
    return exp !== undefined && exp >= this.now();
  }
}
