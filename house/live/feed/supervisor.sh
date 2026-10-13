#!/usr/bin/env bash
# Example live-mesh watcher supervisor. Mints a READ-ONLY ops-app token, runs the feed
# (upstream fetch_feed.py --watch $LIVE_WATCH_S [45] via live_mesh.py) for 50 min, then re-mints before the 1 h expiry.
# The private key stays in an unexported shell var and goes only to the mint child.
# The feed process gets a scrubbed env with no gh config, no git creds and no other keys.
#   CODE  = this directory. LIVE only from a pinned release /srv/live/releases/<sha>/feed (release.sh);
#           from anywhere else (the repo checkout) it is a DEV run: own data dir, writes dev-events.json, no pusher.
#   RUN   = data dir: feed/, logs/, pid files  (live: /srv/live/run; dev: MESH_RUN, default /srv/live/dev)
#   UP    = repo root holding house/live-mesh/fetch_feed.py (LIVE_MESH_UPSTREAM, default: this checkout)
set -u
CODE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
LIVE_HOME="${LIVE_HOME:-/srv/live}"; LIVE_ROOT="$LIVE_HOME/releases"; LIVE_RUN="$LIVE_HOME/run"
case "$CODE" in
  "$LIVE_ROOT"/*/feed) REL="$(basename "$(dirname "$CODE")")"; RUN="$LIVE_RUN"; OUT=live-events.json ;;
  *) REL=dev; RUN="${MESH_RUN:-/srv/live/dev}"; OUT=dev-events.json
     [ "$(mkdir -p "$RUN" && cd "$RUN" && pwd -P)" = "$LIVE_RUN" ] && { echo "dev run may not use the live data dir $LIVE_RUN; use release.sh"; exit 1; } ;;
esac
UP="${LIVE_MESH_UPSTREAM:-$(cd "$CODE/../../.." && pwd -P)}"
HEALTH="${LIVE_HEALTH_URLS:-https://dev.example.com/health https://app.example.com/health}"
QUEUE="${LIVE_MERGE_QUEUE:-/srv/fleet-house/house/watchers/merge-queue.md}"
TUNE=(); for v in LIVE_REST_FLOOR LIVE_GQL_FLOOR LIVE_BACKFILL_SECONDS; do [ -n "${!v:-}" ] && TUNE+=("$v=${!v}"); done
K="${GITHUB_APP_PRIVATE_KEY:-}"
# re-mint after 50 min of WALL-clock time (tokens live 1 h; a paused box freezes `timeout`, which counts monotonic time)
TOKEN_MAX_S="${LIVE_TOKEN_MAX_S:-3000}"
# feed write cadence: 45 s keeps the page's "updated" age under ~75 s (pusher <=2 s after a write + 10 s page poll);
# a pass costs ~10-20 rate-limited REST calls (304s are free), ~1.3k/h of the 5k/h read-only budget
WATCH_S="${LIVE_WATCH_S:-45}"
# the watchdog (not the feed) needs the box HOME for its read-only `railway deployment list` CLI login
BOX_HOME="${HOME:-}"
for v in $(compgen -e); do case "$v" in PATH|LANG|LC_ALL|TZ) ;; *) unset "$v" ;; esac; done
mkdir -p "$RUN/home" "$RUN/gh-empty" "$RUN/logs" "$RUN/feed"
export HOME="$RUN/home" GH_CONFIG_DIR="$RUN/gh-empty" GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 TZ=America/Chicago
cd "$RUN"
exec 7>"$RUN/logs/supervisor.$REL.lock"   # one supervisor per release (a release swap overlaps old + new briefly)
flock -n 7 || { echo "[supervisor $(date +%H:%M:%S) CT] another $REL supervisor holds the lock; exiting"; exit 0; }
child=""
trap '[ -n "$child" ] && kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 0' TERM INT
ensure_watchdog() {   # live releases only: the supervisor and watchdog restart each other (no cron on the box)
  [ "$REL" = dev ] && return 0
  pgrep -f "^bash $LIVE_ROOT/[0-9a-f]{40}/feed/watchdog.sh" >/dev/null && return 0
  local cur; cur="$(readlink -f "$LIVE_ROOT/current")"
  [ -x "$cur/feed/watchdog.sh" ] || return 0
  echo "[supervisor $(date +%H:%M:%S) CT] watchdog not running -> starting $(basename "$cur")"
  (cd "$RUN" && HOME="$BOX_HOME" setsid env -u GH_CONFIG_DIR bash "$cur/feed/watchdog.sh" >/dev/null 2>&1 < /dev/null 7>&- &)
}
# feed mode ($RUN/feed-mode, re-read every 10 s; a change restarts the feed):
#   all = box collects GitHub too (pre-split default)
#   box = slim: box-only signals, no token minted, no GitHub calls (GitHub runs on Railway)
mode_now() { case "$( { tr -dc a-z < "$RUN/feed-mode"; } 2>/dev/null)" in box) echo box ;; *) echo all ;; esac; }
while true; do
  MODE="$(mode_now)"
  if [ "$MODE" = box ]; then
    T=""; minted=""
    echo "[supervisor $(date +%H:%M:%S) CT] [$REL] box mode: no token, box-only signals (GitHub is collected on Railway) -> $OUT"
  else
    T="$(GITHUB_APP_PRIVATE_KEY="$K" node "$CODE/gh-app-token-readonly.mjs" 2>>"$RUN/logs/mint.log")"
    if [ -z "$T" ]; then
      echo "[supervisor $(date +%H:%M:%S) CT] read-only mint failed; NOT starting feed (no fallback); retry in 60s"
      sleep 60 7>&-; continue
    fi
    minted=$(date +%s)
    echo "[supervisor $(date +%H:%M:%S) CT] [$REL] minted read-only token; starting feed (wall-clock re-mint at 50m) -> $OUT"
  fi
  LIVE_MODE="$MODE" GH_TOKEN="$T" GITHUB_TOKEN="$T" LIVE_MESH_SRC="$UP/house/live-mesh" LIVE_HEALTH_URLS="$HEALTH" \
  LIVE_MERGE_QUEUE="$QUEUE" LIVE_WRITE_MARK="$RUN/logs/written.$REL" LIVE_TOKEN_MINTED="$minted" \
  env "${TUNE[@]}" python3 -B -u "$CODE/live_mesh.py" \
    --out "$RUN/feed/$OUT" --watch "$WATCH_S" --x-ledger "$RUN/feed/x-ledger.jsonl" \
    --repos example-org/app example-org/mcp --deploy-repo '' \
    --health https://dev.example.com/health 7>&- &
  child=$!; echo $child > "$RUN/feed.$REL.pid"
  T=""
  n=0
  while kill -0 "$child" 2>/dev/null; do
    if [ "$(mode_now)" != "$MODE" ]; then
      echo "[supervisor $(date +%H:%M:%S) CT] feed-mode changed $MODE -> $(mode_now); restarting feed"
      kill -TERM "$child" 2>/dev/null
      break
    fi
    if [ -n "$minted" ] && [ $(( $(date +%s) - minted )) -ge "$TOKEN_MAX_S" ]; then
      echo "[supervisor $(date +%H:%M:%S) CT] token age $(( $(date +%s) - minted ))s (wall clock) -> stopping feed to re-mint"
      kill -TERM "$child" 2>/dev/null
      break
    fi
    n=$((n + 1)); [ $((n % 6)) -eq 1 ] && ensure_watchdog
    sleep 10 7>&- & wait $! 2>/dev/null
  done
  wait "$child"; rc=$?
  child=""
  echo "[supervisor $(date +%H:%M:%S) CT] feed exited rc=$rc$([ "$rc" = 75 ] && echo ' (token expired)'); restarting"
  sleep 2 7>&-
done
