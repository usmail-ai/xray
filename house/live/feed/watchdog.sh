#!/usr/bin/env bash
# live-mesh watchdog (no cron on the box): one loop, checks every 60 s. Runs from a pinned release (release.sh).
# It only ever (re)starts processes from /srv/live/releases/current, resolved fresh every loop:
#  - no live supervisor (any release) -> start current/feed/supervisor.sh (it mints the read-only token; no fallback)
#  - feed child stalled (no write for STALL_S) -> TERM the child; its supervisor re-mints and restarts it
#  - no live pusher (any release) -> start current/feed/push_to_host.sh
#  - logs every feed write gap > GAP_S to logs/watchdog.log (times in CT). Never logs tokens or env.
#  - every RW_EVERY s runs current/feed/host_poll.py (read-only `railway deployment list`, box CLI login) so the
#    Railway login stays out of the credential-free feed process; the feed reads only its sanitized output.
# Dev runs (repo checkout) are never seen or started here: they are not under /srv/live/releases/.
set -u
LIVE_HOME="${LIVE_HOME:-/srv/live}"; LIVE_ROOT="$LIVE_HOME/releases"; CUR_LINK="$LIVE_ROOT/current"
RUN="$LIVE_HOME/run"
FEED="$RUN/feed/live-events.json"; LOG="$RUN/logs/watchdog.log"
RW_EVERY="${WATCHDOG_RAILWAY_S:-180}"; rw_last=0
GAP_S="${WATCHDOG_GAP_S:-150}"; STALL_S="${WATCHDOG_STALL_S:-300}"; EVERY="${WATCHDOG_EVERY_S:-60}"
mkdir -p "$RUN/logs"
exec 8>"$LOG.lock"; flock -n 8 || { echo "watchdog already running"; exit 0; }
export TZ=America/Chicago
log() { echo "[watchdog $(date +%H:%M:%S) CT] $*" >> "$LOG"; }
REL_RE="^bash $LIVE_ROOT/[0-9a-f]{40}/feed"
last=$(stat -c %Y "$FEED" 2>/dev/null || echo 0)
log "started from $(readlink -f "$CUR_LINK") (gap > ${GAP_S}s logged, stall > ${STALL_S}s restarts the feed)"
while true; do
  now=$(date +%s)
  CUR="$(readlink -f "$CUR_LINK")"
  if [ ! -x "$CUR/feed/supervisor.sh" ]; then
    log "no valid release at $CUR_LINK -> not starting anything"; sleep "$EVERY" 8>&-; continue
  fi
  if ! pgrep -f "$REL_RE/supervisor.sh" >/dev/null; then
    log "supervisor not running -> starting $(basename "$CUR")"
    (cd "$RUN" && setsid "$CUR/feed/supervisor.sh" >> "$RUN/logs/fetch_feed.watch.log" 2>&1 < /dev/null 8>&- &)
  fi
  # one pusher only: the pusher holds logs/push.log.lock; pgrep can miss a just-started setsid child
  if ! pgrep -f "$REL_RE/push_to_host.sh" >/dev/null && ! pgrep -f "^bash $CUR/feed/push_to_host.sh" >/dev/null; then
    if ! flock -n "$RUN/logs/push.log.lock" true 2>/dev/null; then
      :  # lock held = a pusher is alive
    else
      log "pusher not running -> starting $(basename "$CUR")"
      (cd "$RUN" && setsid bash "$CUR/feed/push_to_host.sh" >/dev/null 2>&1 < /dev/null 8>&- &)
    fi
  fi
  if [ $((now - rw_last)) -ge "$RW_EVERY" ]; then
    rw_last=$now
    timeout 120 python3 -B "$CUR/feed/host_poll.py" 8>&- 2>>"$RUN/logs/host_poll.log" || log "railway poll failed (exit $?)"
  fi
  m=$(stat -c %Y "$FEED" 2>/dev/null || echo 0)
  if [ "$m" -gt "$last" ]; then
    gap=$((m - last))
    [ "$last" -gt 0 ] && [ "$gap" -gt "$GAP_S" ] && log "feed write gap ${gap}s ($(date -d @"$last" +%H:%M:%S) -> $(date -d @"$m" +%H:%M:%S) CT)"
    last=$m
  elif [ $((now - m)) -gt "$STALL_S" ] && [ "$m" -gt 0 ]; then
    child=$(pgrep -f "^python3 -B -u $CUR/feed/live_mesh.py" | head -1)
    log "feed stalled $((now - m))s (last write $(date -d @"$m" +%H:%M:%S) CT) -> restarting feed child ${child:-none}"
    [ -n "$child" ] && kill -TERM "$child"
    last=$m; sleep 90 8>&-; continue
  fi
  sleep "$EVERY" 8>&-
done
