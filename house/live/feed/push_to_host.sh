#!/usr/bin/env bash
# Push the box feed to the Railway live-mesh app right after each feed write: check the file's mtime/size/inode
# every CHECK s (2), push when it changed, skip when not; a keepalive push every INTERVAL s (300) re-seeds the
# server's in-memory feed after a Railway restart. A failed push backs off RETRY s (10) before trying again.
# Config: $MESH_RUN/.push-env (default /srv/live/run/.push-env) (MESH_URL, INGEST_SECRET; chmod 600).
# Logs only timestamps + HTTP status codes. Never prints the secret.
# Only events new/changed since the last acknowledged push are sent (POST /ingest/delta, base = server cursor);
# a full POST /ingest happens on first run, after a server restart (409) or against a pre-delta server.
# Overrides (for testing): PUSH_ENV, PUSH_LOG, FEED, PUSH_STATE, INTERVAL, CHECK, RETRY, ONCE=1.
set -u
umask 077
BASE="${MESH_RUN:-/srv/live/run}"
PUSH_ENV=${PUSH_ENV:-$BASE/.push-env}
PUSH_LOG=${PUSH_LOG:-$BASE/logs/push.log}
FEED=${FEED:-$BASE/feed/live-events.json}
INTERVAL=${INTERVAL:-300}
CHECK=${CHECK:-2}
RETRY=${RETRY:-10}
CODE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
STATE=${PUSH_STATE:-$BASE/feed/push-acked.json}   # server cursor + per-id content hashes of the last acknowledged push
ACT_STATE=${ACT_STATE:-$BASE/feed/activity-pulled.json}   # activity pull position (server epoch + seq)
ACT_OUT=${ACT_OUT:-$BASE/fleet/remote-activity.jsonl}     # pulled off-box activity -> live_fleet.scan_activity
# only a pinned release (release.sh) may push the live feed or write live state; dev/test runs from the repo never do
case "$CODE" in
  "${LIVE_HOME:-/srv/live}"/releases/*/feed) ;;
  *) for f in "$FEED" "$STATE" "$ACT_STATE" "$ACT_OUT" "$PUSH_LOG"; do
       case "$(readlink -m "$f")" in "${LIVE_HOME:-/srv/live}"/run/*)
         echo "refusing to push the live feed from a dev checkout ($CODE); use release.sh" >&2; exit 1 ;; esac
     done ;;
esac
mkdir -p "$(dirname "$PUSH_LOG")"

log() { printf '%s %s\n' "$(date -Iseconds)" "$1" >> "$PUSH_LOG"; }

# single instance
exec 9>"$PUSH_LOG.lock"
flock -n 9 || { log "already running, exiting"; exit 1; }

read_env() {  # parse KEY=VALUE without sourcing
  MESH_URL=$(sed -n 's/^MESH_URL=//p' "$PUSH_ENV" | tail -n1 | tr -d '\r"'"'"' ')
  INGEST_SECRET=$(sed -n 's/^INGEST_SECRET=//p' "$PUSH_ENV" | tail -n1 | tr -d '\r"'"'"' ')
}


post() {  # post FILE PATH -> sets code, gz; response body in $out
  gzip -6 -n -c "$1" > "$1.gz" || { code=000; return; }
  gz=$(stat -c %s "$1.gz")
  # gzip body (Content-Encoding: gzip); secret goes to curl via a stdin config, not argv, so it never shows in ps
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$INGEST_SECRET" |
    curl -sS -o "$out" -w '%{http_code}' --config - --max-time 60 9>&- \
      -H 'Content-Type: application/json' -H 'Content-Encoding: gzip' --data-binary @"$1.gz" \
      "${MESH_URL%/}$2" 2>/dev/null)
  code=${code:-000}
}

PUSH_CODE=""
push_once() {  # delta when the server acknowledged our last push; full resync on a cold start / cursor mismatch
  PUSH_CODE=""
  read_env
  if [ -z "$MESH_URL" ] || [ -z "$INGEST_SECRET" ]; then log "skip: MESH_URL or INGEST_SECRET not set"; return; fi
  if [ ! -s "$FEED" ]; then log "skip: feed missing"; return; fi
  local tmp out code resp raw gz mode path
  tmp=$(mktemp) || { log "skip: mktemp failed"; return; }
  out=$(mktemp) || { rm -f "$tmp"; log "skip: mktemp failed"; return; }
  cp "$FEED" "$tmp"   # snapshot so a concurrent rewrite can't truncate the upload
  for attempt in 1 2; do
    mode=$(python3 -B "$CODE/push_payload.py" prepare "$tmp" "$STATE" "$tmp.body" 9>&-) || { mode=""; }
    [ -n "$mode" ] || { rm -f "$tmp"*; rm -f "$out"; log "skip: payload failed"; return; }
    path=/ingest; [ "${mode%% *}" = delta ] && path=/ingest/delta
    post "$tmp.body" "$path"
    raw=$(stat -c %s "$tmp.body")
    resp=$(head -c 200 "$out" | tr -d '\n' | sed -E 's/[^A-Za-z0-9:,{}" _.-]//g')
    log "push $code mode=${mode// /:} raw=${raw}B gz=${gz}B resp=${resp}"
    if [ "$code" = 200 ]; then python3 -B "$CODE/push_payload.py" commit "$STATE" "$tmp.body" "$out" >/dev/null 9>&- || rm -f "$STATE"; break; fi
    # server lost our base (restart / redeploy -> 409) or doesn't speak delta (404/405/422): resync in full now
    if [ "$path" = /ingest/delta ] && case "$code" in 404|405|409|422) true ;; *) false ;; esac; then
      python3 -B "$CODE/push_payload.py" reset "$STATE" >/dev/null 9>&-; continue
    fi
    break
  done
  rm -f "$tmp" "$tmp.body" "$tmp.body.gz" "$tmp.body.pending" "$out"
  PUSH_CODE="$code"
}

PULL_EVERY=${PULL_EVERY:-5}
act_last_code=""
pull_activity() {  # off-box seats POST /activity (write-only key); we fetch new lines with the ingest secret
  read_env
  [ -n "$MESH_URL" ] && [ -n "$INGEST_SECRET" ] || return 0
  local out q code n
  out=$(mktemp) || return 0
  q=$(python3 -B "$CODE/push_payload.py" act-query "$ACT_STATE" 9>&-)
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$INGEST_SECRET" |
    curl -sS -o "$out" -w '%{http_code}' --config - --max-time 15 9>&- "${MESH_URL%/}/activity/pull?$q" 2>/dev/null)
  code=${code:-000}
  if [ "$code" = 200 ]; then
    n=$(python3 -B "$CODE/push_payload.py" act-store "$out" "$ACT_STATE" "$ACT_OUT" 9>&- 2>/dev/null) || n=err
    [ "$n" = 0 ] || log "activity pulled ${n}"
  elif [ "$code" != "$act_last_code" ]; then
    log "activity pull ${code}"
  fi
  act_last_code=$code
  rm -f "$out"
}

INBOX_EVERY=${INBOX_EVERY:-10}
inbox_cycle() {  # seat inboxes (port of xray PR #5): pull the server's events since our cursor, route, mirror builder
  read_env
  [ -n "$MESH_URL" ] && [ -n "$INGEST_SECRET" ] || return 0
  local out q code r n
  out=$(mktemp) || return 0
  q=$(python3 -B -c 'import json,sys; print(json.load(open(sys.argv[1])).get("cursor") or "")' "$BASE/feed/inbox-events.json" 2>/dev/null)
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$INGEST_SECRET" |
    curl -sS -o "$out" -w '%{http_code}' --config - --max-time 30 9>&- "${MESH_URL%/}/ingest/events?since=${q}" 2>/dev/null)
  [ "${code:-000}" = 200 ] && MESH_RUN="$BASE" python3 -B "$CODE/inbox_pass.py" pull "$out" >/dev/null 9>&- 2>&1
  local wb=off   # BOARD.md comes from the feed's board model (live_board.py), not the old builder
  r=$(MESH_RUN="$BASE" LIVE_BOARD="$wb" python3 -B "$CODE/inbox_pass.py" pass 9>&- 2>>"$(dirname "$PUSH_LOG")/inbox.log") || r="err"
  case "$r" in "0 0"|"") ;; *) log "inbox new/lines ${r} (events pull ${code:-000})" ;; esac
  n=$(MESH_RUN="$BASE" python3 -B "$CODE/inbox_pass.py" unsent "$out.lines" 9>&-) || n=0
  if [ "${n:-0}" != 0 ]; then   # the server holds every seat's inbox; the local spool is a ring buffer while it's down
    code=$(printf 'header = "X-Live-Ingest: %s"\n' "$INGEST_SECRET" |
      curl -sS -o "$out.resp" -w '%{http_code}' --config - --max-time 15 9>&- -H 'Content-Type: application/json' \
        --data-binary @"$out.lines" "${MESH_URL%/}/inbox" 2>/dev/null)
    [ "$code" = 200 ] && MESH_RUN="$BASE" python3 -B "$CODE/inbox_pass.py" sent "$out.lines" 9>&-
    rj=$(python3 -B -c 'import json,sys; print(len(json.load(open(sys.argv[1])).get("rejected") or []))' "$out.resp" 2>/dev/null) || rj=0
    log "inbox lines ${n} -> server ${code:-000}$([ "${rj:-0}" != 0 ] && echo " (${rj} rejected)")"
    rm -f "$out.resp"
  fi
  # Builder nudges: one GitHub comment per card per level via ops-app (nudges.py keeps its own cursor + dedupe)
  if [ -s "$BASE/secrets/seat-keys/operator.key" ]; then
    r=$(MESH_RUN="$BASE" MESH_URL="$MESH_URL" python3 -B "$CODE/nudges.py" comment 9>&- 2>>"$(dirname "$PUSH_LOG")/inbox.log") || r="err"
    [ -n "$r" ] && [ "$r" != 0 ] && log "nudge comments ${r}"
  fi
  rm -f "$out" "$out.lines"
}

sig() { stat -c '%Y.%s.%i' "$FEED" 2>/dev/null; }   # live-events.json is replaced atomically: new inode per write
last="" ; last_push=0
while :; do
  cur=$(sig)
  now=$(date +%s)
  if [ -n "$cur" ] && { [ "$cur" != "$last" ] || [ $((now - last_push)) -ge "$INTERVAL" ]; }; then
    push_once
    last_push=$now
    if [ "$PUSH_CODE" = 200 ]; then last="$cur"; else last=""; [ "${ONCE:-0}" = 1 ] || sleep "$RETRY" 9>&-; fi
  fi
  if [ $((now - ${last_pull:-0})) -ge "$PULL_EVERY" ]; then pull_activity; last_pull=$now; fi
  if [ $((now - ${last_inbox:-0})) -ge "$INBOX_EVERY" ]; then inbox_cycle; last_inbox=$now; fi
  [ "${ONCE:-0}" = 1 ] && break
  sleep "$CHECK" 9>&-   # the sleep must not inherit the lock fd (a TERMed pusher's orphan sleep would hold it)
done
