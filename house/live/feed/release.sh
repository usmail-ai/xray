#!/usr/bin/env bash
# Zero-gap release of the live watcher / pusher / watchdog.
# Usage: feed/release.sh <sha>
# Copies feed/ at that commit into /srv/live-mesh-live/<sha>/, starts the new supervisor,
# waits until it has written the live feed once, flips `current`, then TERMs the old supervisor
# and restarts the pusher + watchdog from the new release. Both feeds share the state files under
# /srv/live-mesh-run; pid-suffixed temps and an flock on write keep the overlap clean.
# Dev work stays in /srv/live-mesh-repo and never touches live-events.json.
set -euo pipefail
export TZ=America/Chicago
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LIVE_ROOT=/srv/live-mesh-live; RUN=/srv/live-mesh-run
SHA="${1:-}"; [ -n "$SHA" ] || { echo "usage: feed/release.sh <sha>" >&2; exit 2; }
SHA="$(cd "$REPO" && git rev-parse --verify "$SHA^{commit}")"
SHORT="${SHA:0:12}"
DEST="$LIVE_ROOT/$SHA"
MARK="$RUN/logs/written.$SHA"
GAPLOG="$RUN/logs/release.log"
mkdir -p "$LIVE_ROOT" "$RUN/logs" "$RUN/feed"
log() { echo "[release $(date +%H:%M:%S) CT] $*" | tee -a "$GAPLOG"; }

[ -d "$DEST" ] && { log "release $SHORT already on disk at $DEST"; } || {
  log "extracting feed/ @ $SHORT -> $DEST"
  mkdir -p "$DEST"
  (cd "$REPO" && git archive "$SHA" feed) | tar -x -C "$DEST"
  # git archive puts feed/ under DEST/feed; good. Make scripts executable.
  chmod +x "$DEST"/feed/*.sh "$DEST"/feed/*.mjs 2>/dev/null || true
}
[ -x "$DEST/feed/supervisor.sh" ] || { echo "no supervisor.sh in $DEST/feed" >&2; exit 1; }

# Anything still running from the repo checkout is the old (pre-split) live; treat it as the outgoing release.
REL_RE="^bash $LIVE_ROOT/[0-9a-f]{40}/feed"
REPO_RE="^bash $REPO/feed"
old_sup=$(pgrep -f "$REL_RE/supervisor.sh" || true)
old_sup=${old_sup:-$(pgrep -f "$REPO_RE/supervisor.sh" || true)}
old_push=$(pgrep -f "$REL_RE/push_to_host.sh" || true)
old_push=${old_push:-$(pgrep -f "$REPO_RE/push_to_host.sh" || true)}
old_wd=$(pgrep -f "$REL_RE/watchdog.sh" || true)
old_wd=${old_wd:-$(pgrep -f "$REPO_RE/watchdog.sh" || true)}
# Also catch a prior release that is still current
CUR_OLD=$(readlink -f "$LIVE_ROOT/current" 2>/dev/null || true)
[ -n "$CUR_OLD" ] && [ "$CUR_OLD" = "$DEST" ] && { log "already current ($SHORT); nothing to swap"; exit 0; }

rm -f "$MARK"
t0=$(date +%s)
last_write=$(stat -c %Y "$RUN/feed/live-events.json" 2>/dev/null || echo 0)
log "starting new supervisor $SHORT (old supervisor pid(s): ${old_sup:-none})"
(cd "$RUN" && setsid "$DEST/feed/supervisor.sh" >> "$RUN/logs/fetch_feed.watch.log" 2>&1 < /dev/null &) >/dev/null 2>&1   # wrapper must not hold the caller's stdout
# Wait until the new release has written the live feed once (LIVE_WRITE_MARK).
for i in $(seq 1 300); do
  [ -f "$MARK" ] && break
  sleep 1
done
[ -f "$MARK" ] || { log "FAIL: new release never wrote (no $MARK after 300s)"; exit 1; }
t1=$(date +%s)
new_write=$(stat -c %Y "$RUN/feed/live-events.json")
# Flip current before stopping the old one so the watchdog (if already on current) stays on the new release.
ln -sfn "$DEST" "$LIVE_ROOT/current.new"
mv -Tf "$LIVE_ROOT/current.new" "$LIVE_ROOT/current"
log "current -> $SHORT (new wrote at $(date -d @"$new_write" +%H:%M:%S) CT, waited $((t1 - t0))s)"

# TERM old supervisors (repo checkout and any other release) and their feed children.
for p in $old_sup; do
  [ "$p" = "$(pgrep -f "^bash $DEST/feed/supervisor.sh" | head -1)" ] && continue
  log "TERM old supervisor $p"
  kill -TERM "$p" 2>/dev/null || true
done
# Stop repo-checkout / other-release feed children; the new supervisor's child stays.
pgrep -af "python3 -B -u .*/feed/live_mesh.py" | while read -r line; do
  case "$line" in
    *" $DEST/feed/live_mesh.py"*) ;;
    *) pid=${line%% *}; log "TERM old feed $pid"; kill -TERM "$pid" 2>/dev/null || true ;;
  esac
done

# Restart pusher + watchdog from the new release (they don't share state that needs overlap).
for p in $old_push; do log "TERM old pusher $p"; kill -TERM "$p" 2>/dev/null || true; done
for p in $old_wd; do log "TERM old watchdog $p"; kill -TERM "$p" 2>/dev/null || true; done
sleep 2
# the old pusher must release logs/push.log.lock first, or the new one exits "already running"
for i in $(seq 1 75); do flock -n "$RUN/logs/push.log.lock" true 2>/dev/null && break; sleep 1; done
if ! pgrep -f "^bash $DEST/feed/push_to_host.sh" >/dev/null; then
  (cd "$RUN" && setsid bash "$DEST/feed/push_to_host.sh" >/dev/null 2>&1 < /dev/null &)
fi
if ! pgrep -f "^bash $DEST/feed/watchdog.sh" >/dev/null && ! pgrep -f "$REL_RE/watchdog.sh" >/dev/null; then
  (cd "$RUN" && setsid bash "$DEST/feed/watchdog.sh" >/dev/null 2>&1 < /dev/null &)
fi
sleep 2
# one watchdog / one pusher only (setsid races can leave extras)
for kind in watchdog push_to_host; do
  pids=$(pgrep -f "^bash $DEST/feed/$kind.sh" || true)
  extra=$(echo "$pids" | awk "NR>1")
  for p in $extra; do log "TERM duplicate $kind $p"; kill -TERM "$p" 2>/dev/null || true; done
done

sleep 2; log "pushers running: $(pgrep -fc "^bash $LIVE_ROOT/[0-9a-f]{40}/feed/push_to_host.sh")"
t2=$(date +%s)
# Measured gap: time from the last pre-release write to the new release's first write.
# With overlap this should be small (often negative = continuous); report both.
gap_write=$((new_write - last_write))
gap_wall=$((t2 - t0))
log "swap done in ${gap_wall}s; write gap ${gap_write}s (last old -> first new); new=$SHORT"
printf '%s\n' "sha=$SHA short=$SHORT write_gap_s=$gap_write wall_s=$gap_wall new_write_ct=$(date -d @"$new_write" +%H:%M:%S) old_write_ct=$(date -d @"$last_write" +%H:%M:%S)"
# Refuse a bad swap: if the new write is more than 60s after the old one, something stalled.
[ "$gap_write" -le 90 ] || log "WARN: write gap ${gap_write}s > 90s (pass was slow; incremental fix should shrink this)"
# Confirm live processes are from current
pgrep -af "$DEST/feed/(supervisor|push_to_host|watchdog|live_mesh)" | sed 's/^/[release] /' | tee -a "$GAPLOG"
# Keep the last few releases; prune older ones not current.
# Only 40-hex release dirs (the old [0-9a-f]* glob also matched `current` itself, 'c' being hex), newest first by mtime.
ls -1dt "$LIVE_ROOT"/* 2>/dev/null | grep -E '/[0-9a-f]{40}$' | tail -n +6 | while read -r d; do
  [ "$(readlink -f "$LIVE_ROOT/current")" = "$d" ] && continue
  [ "$d" = "$DEST" ] && continue
  log "prune $d"; rm -rf "$d"
done
log "OK $SHORT"
