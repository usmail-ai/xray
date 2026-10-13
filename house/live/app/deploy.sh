#!/usr/bin/env bash
# Deploy app/ to one Railway service.
# LIVE_RAILWAY_PROJECT (default live-board), LIVE_RAILWAY_SERVICE (default live-mesh),
# MESH_APP_DEPLOY_DIR (default /srv/live/deploy). LIVE_PUBLIC_OVERLAY, when set, is a directory
# copied onto public/ after the kit files (live-config.js, avatars). Secret files in the deploy dir stay.
set -euo pipefail
PROJECT="${LIVE_RAILWAY_PROJECT:-live-board}"; SERVICE="${LIVE_RAILWAY_SERVICE:-live-mesh}"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DST="${MESH_APP_DEPLOY_DIR:-/srv/live/deploy}"
[ -d "$DST" ] || { echo "deploy dir $DST missing (must be railway-linked to live-board)" >&2; exit 1; }
[ "$(cd "$DST" && pwd -P)" = "$APP" ] || {
  cp "$APP"/server.mjs "$APP"/presence.mjs "$APP"/source.mjs "$APP"/package.json "$APP"/railway.json "$APP"/.railwayignore "$APP"/Dockerfile "$DST"/
  rm -rf "$DST/public.new"; cp -r "$APP/public" "$DST/public.new"; rm -rf "$DST/public"; mv "$DST/public.new" "$DST/public"
  if [ -n "${LIVE_PUBLIC_OVERLAY:-}" ]; then
    [ -d "$LIVE_PUBLIC_OVERLAY" ] || { echo "LIVE_PUBLIC_OVERLAY is not a directory" >&2; exit 1; }
    cp -a "$LIVE_PUBLIC_OVERLAY"/. "$DST/public/"
  fi
  if [ -d "$APP/.railway" ]; then rm -rf "$DST/.railway"; cp -a "$APP/.railway" "$DST/.railway"; fi
}
# collector/ = the feed modules + house/live-mesh/fetch_feed.py from this repo (copied at deploy time, not committed)
rm -rf "$DST/collector"; mkdir -p "$DST/collector/upstream"
cp "$APP"/../feed/live_mesh.py "$APP"/../feed/live_collect.py "$APP"/../feed/live_flow.py "$APP"/../feed/live_fleet.py "$APP"/../feed/live_packet.py "$APP"/../feed/live_board.py "$APP"/../feed/upstream.py "$APP"/../feed/jira_source.py "$DST/collector/"
cp "$APP/../../live-mesh/fetch_feed.py" "$DST/collector/upstream/"   # house/live-mesh in this repo
# MESH_SEED_STORE=1 (one-time, first volume deploy): ship the box collector's store as collector/seed/ (the server
# copies it onto the volume only where no file exists yet). Scanned for token / key patterns first.
if [ "${MESH_SEED_STORE:-0}" = 1 ]; then
  RUNF="${MESH_RUN:-/srv/live/run}/feed"; mkdir -p "$DST/collector/seed/store"
  cp "$RUNF"/store/*.json "$DST/collector/seed/store/"
  cp "$RUNF/health-state.json" "$DST/collector/seed/"
  if grep -rEq 'gh[spou]_[A-Za-z0-9]{20,}|github_pat_|BEGIN [A-Z ]*PRIVATE' "$DST/collector/seed"; then
    rm -rf "$DST/collector/seed"; echo "seed holds a token-like string; refusing" >&2; exit 1; fi
  echo "seed: $(du -sh "$DST/collector/seed" | cut -f1) (one-time)"
fi
cd "$DST"
st="$(railway status 2>/dev/null || true)"; grep -q "$PROJECT" <<<"$st" || { echo "deploy dir is not linked to $PROJECT; refusing" >&2; exit 1; }
railway up --service "$SERVICE" --detach
echo "check: railway deployment list --service $SERVICE   (expect SUCCESS)"
