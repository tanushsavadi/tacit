/**
 * Opt-in persistent turn log (JSONL). Off by default: nothing is written until the user consents in the UI
 * (`set_turn_logging`) or the operator sets TACIT_LOG_TURNS=timings|full. Retention-pruned; erasable.
 */
import { appendFile, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TurnLogMode, TurnLogStatus, TurnRecord } from '../../shared/protocol.ts';

const DAY = 86_400_000;

export class TurnLog {
  private status: TurnLogStatus;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    opts: { mode?: TurnLogMode; retentionDays?: number; now?: () => number } = {},
    private readonly now: () => number = opts.now ?? Date.now,
  ) {
    const envMode = opts.mode && opts.mode !== 'off' ? opts.mode : null;
    this.status = {
      mode: envMode ?? 'off',
      retentionDays: opts.retentionDays ?? 7,
      source: envMode ? 'env' : 'default',
      changedAt: envMode ? this.now() : null,
      storedTurns: 0,
    };
  }

  get(): TurnLogStatus {
    return { ...this.status };
  }

  setMode(mode: TurnLogMode): TurnLogStatus {
    this.status = { ...this.status, mode, source: 'user', changedAt: this.now() };
    return this.get();
  }

  /** Serialise file operations so prune/delete/append never interleave. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  record(turn: TurnRecord): Promise<void> {
    const mode = this.status.mode;
    if (mode === 'off') return Promise.resolve();
    const entry: Record<string, unknown> = { ...turn, loggedAt: this.now(), logMode: mode };
    if (mode === 'timings') {
      delete entry.callerText;
      delete entry.options;
      delete entry.spokenText;
    }
    return this.run(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await appendFile(this.file, JSON.stringify(entry) + '\n', { mode: 0o600 });
      await chmod(this.file, 0o600);
      this.status.storedTurns += 1;
    });
  }

  /** Drop entries older than the retention window. Returns how many were removed. */
  prune(): Promise<number> {
    return this.run(async () => {
      if (!existsSync(this.file)) {
        this.status.storedTurns = 0;
        return 0;
      }
      const cutoff = this.now() - this.status.retentionDays * DAY;
      const lines = (await readFile(this.file, 'utf8')).split('\n').filter(Boolean);
      const keep = lines.filter((l) => {
        try {
          const e = JSON.parse(l) as { loggedAt?: number; closedAt?: number };
          return (e.loggedAt ?? e.closedAt ?? 0) >= cutoff;
        } catch {
          return false;
        }
      });
      if (keep.length !== lines.length) await writeFile(this.file, keep.map((l) => l + '\n').join(''), { mode: 0o600 });
      this.status.storedTurns = keep.length;
      return lines.length - keep.length;
    });
  }

  deleteAll(): Promise<void> {
    return this.run(async () => {
      await rm(this.file, { force: true });
      this.status.storedTurns = 0;
    });
  }
}
