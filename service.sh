#!/usr/bin/env bash
#
# service.sh — manage the visited_places stack (Hono API + Vite preview web).
#
#   ./service.sh start     build web, then start API + web (logs to ./logs)
#   ./service.sh stop      stop both
#   ./service.sh restart   stop then start
#   ./service.sh status    show running state + health probes + URLs
#   ./service.sh logs      tail both logs (Ctrl-C to exit)
#
# Defaults bind 0.0.0.0. Override with env vars:
#   HOST=0.0.0.0 API_PORT=3001 WEB_PORT=5173 ./service.sh start
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

HOST="${HOST:-0.0.0.0}"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-5173}"
export API_PORT   # vite proxy target reads this

LOG_DIR="$ROOT/logs"
RUN_DIR="$ROOT/.run"
API_PID="$RUN_DIR/api.pid"
WEB_PID="$RUN_DIR/web.pid"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
mkdir -p "$LOG_DIR" "$RUN_DIR"

c_green=$'\e[32m'; c_red=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'

_alive() { # pidfile -> 0 if its process is alive
  local f="$1" pid
  [[ -f "$f" ]] || return 1
  pid="$(cat "$f" 2>/dev/null)" || return 1
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

_start_proc() { # name pidfile logfile command...
  local name="$1" pidfile="$2" logfile="$3"; shift 3
  local cmd="$*"
  if _alive "$pidfile"; then
    echo "  $name already running (pid $(cat "$pidfile"))"
    return 0
  fi
  echo "" >> "$logfile"
  echo "=== $name started $(date '+%F %T') ===" >> "$logfile"
  # New session so the whole process tree shares one group we can signal.
  setsid bash -c "echo \$\$ > '$pidfile'; exec $cmd" >> "$logfile" 2>&1 < /dev/null &
  sleep 1
  if _alive "$pidfile"; then
    echo "  ${c_green}✓${c_off} $name started (pid $(cat "$pidfile")) → $logfile"
  else
    echo "  ${c_red}✗${c_off} $name failed to start — last log lines:"
    tail -n 8 "$logfile" | sed 's/^/      /'
    return 1
  fi
}

_stop_proc() { # name pidfile port
  local name="$1" pidfile="$2" port="$3" pid
  if _alive "$pidfile"; then
    pid="$(cat "$pidfile")"
    kill -s TERM -- "-$pid" 2>/dev/null || kill -s TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 25); do _alive "$pidfile" || break; sleep 0.2; done
    if _alive "$pidfile"; then
      kill -s KILL -- "-$pid" 2>/dev/null || kill -s KILL "$pid" 2>/dev/null || true
    fi
    echo "  $name stopped"
  else
    echo "  $name not running"
  fi
  rm -f "$pidfile"
  # belt-and-suspenders: free the port if something stale is holding it
  if command -v lsof >/dev/null 2>&1; then
    local leftover; leftover="$(lsof -ti:"$port" 2>/dev/null || true)"
    if [[ -n "$leftover" ]]; then
      echo "  freeing port $port ($leftover)"
      echo "$leftover" | xargs -r kill -9 2>/dev/null || true
    fi
  fi
}

_ensure_deps() {
  if [[ ! -d "$ROOT/node_modules" ]]; then
    echo "  node_modules missing — running npm install…"
    npm install
  fi
}

cmd_start() {
  echo "Starting visited_places (HOST=$HOST API_PORT=$API_PORT WEB_PORT=$WEB_PORT)"
  _ensure_deps
  echo "  building web…"
  if ! npm run build -w apps/web >> "$WEB_LOG" 2>&1; then
    echo "  ${c_red}✗${c_off} web build failed — see $WEB_LOG"; tail -n 12 "$WEB_LOG" | sed 's/^/      /'; exit 1
  fi
  _start_proc "api" "$API_PID" "$API_LOG" \
    "env PORT=$API_PORT HOST=$HOST npm run --silent start -w apps/api"
  _start_proc "web" "$WEB_PID" "$WEB_LOG" \
    "npm run --silent preview -w apps/web -- --host $HOST --port $WEB_PORT"
  echo
  cmd_status
}

cmd_stop() {
  echo "Stopping visited_places…"
  _stop_proc "web" "$WEB_PID" "$WEB_PORT"
  _stop_proc "api" "$API_PID" "$API_PORT"
}

cmd_status() {
  local ip; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; ip="${ip:-127.0.0.1}"
  echo "Status:"
  if _alive "$API_PID"; then
    local h; h="$(curl -s -m 3 "http://localhost:$API_PORT/api/health" 2>/dev/null)"
    echo "  ${c_green}●${c_off} api  pid $(cat "$API_PID")  :$API_PORT  ${c_dim}${h:-<no health response>}${c_off}"
  else
    echo "  ${c_red}○${c_off} api  stopped"
  fi
  if _alive "$WEB_PID"; then
    local code; code="$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://localhost:$WEB_PORT/" 2>/dev/null)"
    echo "  ${c_green}●${c_off} web  pid $(cat "$WEB_PID")  :$WEB_PORT  ${c_dim}HTTP ${code:-?}${c_off}"
    echo "       → http://$ip:$WEB_PORT/   (http://localhost:$WEB_PORT/)"
  else
    echo "  ${c_red}○${c_off} web  stopped"
  fi
  echo "  ${c_dim}logs: $API_LOG  |  $WEB_LOG${c_off}"
}

cmd_logs() {
  echo "Tailing logs (Ctrl-C to stop)…"
  tail -n 20 -F "$API_LOG" "$WEB_LOG"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; echo; cmd_start ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
