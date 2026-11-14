#!/bin/bash
# TACIT launcher — one entry point for the local runtime.
#   ./scripts/tacit.sh build        install deps if missing, build tacit-route (Swift) and the web UI
#   ./scripts/tacit.sh start [--lan] start the server (spawns + supervises the Auto-AVSR sidecar and whisper-server)
#                                   bound to 127.0.0.1 (--lan: all interfaces, for a phone browser caller)
#   ./scripts/tacit.sh stop         stop it (sidecars exit with the server)
#   ./scripts/tacit.sh restart [--lan]
#   ./scripts/tacit.sh status       one-line health
#   ./scripts/tacit.sh preflight    PASS / FAIL / USER ACTION per dependency (works with or without a running server)
#   ./scripts/tacit.sh open         open the private TACIT workspace in the default browser (token never printed)
#   ./scripts/tacit.sh logs         follow the server log
# Paths with spaces/apostrophes are fine; secrets are never printed.
set -euo pipefail
export PATH="$PATH:/usr/sbin:/sbin"   # lsof lives in /usr/sbin; GUI launches may not include it
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server"
RUN="$SERVER/data/run"
LOG="$RUN/server.log"
PIDF="$RUN/server.pid"
PORT="${PORT:-8790}"
mkdir -p "$RUN"; chmod 700 "$SERVER/data" "$RUN" 2>/dev/null || true

say() { printf '%s\n' "$*"; }
listener_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }
is_tacit() { curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; }

build() {
  [ -d "$SERVER/node_modules" ] || (cd "$SERVER" && npm ci)
  [ -d "$ROOT/web/node_modules" ] || (cd "$ROOT/web" && npm ci)
  say "building tacit-route (Swift, release)…"
  (cd "$ROOT/macos/TacitRoute" && swift build -c release >/dev/null) && say "  ok: macos/TacitRoute/.build/release/tacit-route"
  if [ -d "$ROOT/macos/TacitCompanion" ]; then
    say "building TACIT companion (menu bar)…"
    "$ROOT/macos/TacitCompanion/build-app.sh" >/dev/null && say "  ok: macos/TacitCompanion/.build/TACIT.app"
  fi
  say "building web UI…"
  (cd "$ROOT/web" && npm run build >/dev/null) && say "  ok: web/dist (served by the server on :$PORT)"
}

start() {
  local host="127.0.0.1"
  [ "${1:-}" = "--lan" ] && host=""
  if is_tacit; then say "TACIT already running on :$PORT (pid $(listener_pid "$PORT")). Use restart to reload."; return 0; fi
  local other; other="$(listener_pid "$PORT" || true)"
  if [ -n "$other" ]; then say "FAIL: port $PORT is used by another process: $(ps -o pid=,comm= -p "$other")"; exit 1; fi
  # Stale sidecars from a crashed run (they normally exit with their parent).
  for p in 8765 8766; do
    local s; s="$(listener_pid "$p" || true)"
    if [ -n "$s" ] && ps -o command= -p "$s" | grep -qE 'tacit_vsr|whisper-server'; then say "stopping stale sidecar on :$p (pid $s)"; kill "$s" || true; fi
  done
  [ -x "$ROOT/macos/TacitRoute/.build/release/tacit-route" ] || say "note: tacit-route not built — virtual microphone disabled (./scripts/tacit.sh build)"
  [ -f "$ROOT/web/dist/index.html" ] || say "note: web/dist not built — run ./scripts/tacit.sh build (or use Vite on :5173)"
  say "starting TACIT server on ${host:-all interfaces}:$PORT (log: server/data/run/server.log)…"
  # Detach completely (no inherited stdio), so callers piping this script never hang.
  (cd "$SERVER" && TACIT_HOST="$host" exec nohup "$SERVER/node_modules/.bin/tsx" src/index.ts) >"$LOG" 2>&1 </dev/null &
  echo $! >"$PIDF"
  for i in $(seq 1 60); do
    if is_tacit; then break; fi
    if ! kill -0 "$(cat "$PIDF")" 2>/dev/null; then say "FAIL: server exited — last log lines:"; tail -5 "$LOG"; exit 1; fi
    sleep 0.5
  done
  is_tacit || { say "FAIL: server did not answer on :$PORT within 30 s"; exit 1; }
  say "server up. Waiting for the recognition model (first load ~5 s)…"
  for i in $(seq 1 60); do grep -q '\[recognition\] listening' "$LOG" && break; sleep 0.5; done
  grep -q '\[recognition\] listening' "$LOG" && say "recognition: ready" || say "recognition: NOT ready yet (see ./scripts/tacit.sh preflight)"
  grep -E '^\[route\]' "$LOG" | tail -1 || true
  say "next: ./scripts/tacit.sh preflight   then   ./scripts/tacit.sh open"
}

stop() {
  local pid; pid="$(listener_pid "$PORT" || true)"
  if [ -z "$pid" ]; then say "TACIT not running."; rm -f "$PIDF"; return 0; fi
  if ! is_tacit; then say "FAIL: :$PORT is not TACIT (pid $pid) — not touching it"; exit 1; fi
  kill "$pid"
  for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
  kill -0 "$pid" 2>/dev/null && { say "server did not exit; sending SIGKILL"; kill -9 "$pid"; }
  # npx/tsx wrapper processes
  [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null || true
  rm -f "$PIDF"
  sleep 1.2
  for p in 8765 8766; do [ -n "$(listener_pid "$p" || true)" ] && say "warning: :$p still listening (sidecar exits within ~1 s of its parent)"; done
  say "TACIT stopped."
}

status() {
  if is_tacit; then (cd "$SERVER" && npx tsx scripts/preflight.ts --brief); else say "TACIT not running on :$PORT"; fi
}

case "${1:-help}" in
  build) build ;;
  start) start "${2:-}" ;;
  stop) stop ;;
  restart) stop; start "${2:-}" ;;
  status) status ;;
  preflight) (cd "$SERVER" && npx tsx scripts/preflight.ts) ;;
  open) (cd "$SERVER" && npx tsx scripts/open-workspace.ts) ;;
  logs) tail -f "$LOG" ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
