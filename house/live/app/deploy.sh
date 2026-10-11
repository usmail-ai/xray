#!/usr/bin/env bash
# Deploy app/ to the Railway service "live-mesh" (project live-board) ONLY.
# Copies the app files into the railway-linked deploy dir (MESH_APP_DEPLOY_DIR, default /srv/live-mesh-app),
# leaving that dir's local secret files untouched, then `railway up --service live-mesh --detach`.
set -euo pipefail
PROJECT="${LIVE_RAILWAY_PROJECT:-live-board}"; SERVICE="${LIVE_RAILWAY_SERVICE:-live-mesh}"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DST="${MESH_APP_DEPLOY_DIR:-/srv/live-mesh-app}"
[ -d "$DST" ] || { echo "deploy dir $DST missing (must be railway-linked to live-board)" >&2; exit 1; }
[ "$(cd "$DST" && pwd -P)" = "$APP" ] || {
  cp "$APP"/server.mjs "$APP"/package.json "$APP"/package-lock.json "$APP"/railway.json "$APP"/.railwayignore "$APP"/Dockerfile "$DST"/
  rm -rf "$DST/public.new"; cp -r "$APP/public" "$DST/public.new"; rm -rf "$DST/public"; mv "$DST/public.new" "$DST/public"
}
# collector/ = the feed modules + house/live-mesh/fetch_feed.py from this repo (copied at deploy time, not committed)
rm -rf "$DST/collector"; mkdir -p "$DST/collector/upstream"
cp "$APP"/../feed/live_mesh.py "$APP"/../feed/live_collect.py "$APP"/../feed/live_flow.py "$APP"/../feed/live_fleet.py "$APP"/../feed/live_packet.py "$APP"/../feed/live_board.py "$DST/collector/"
cp "$APP/../../live-mesh/fetch_feed.py" "$DST/collector/upstream/"   # house/live-mesh in this repo
# MESH_SEED_STORE=1 (one-time, first volume deploy): ship the box collector's store as collector/seed/ (the server
# copies it onto the volume only where no file exists yet). Scanned for token / key patterns first.
if [ "${MESH_SEED_STORE:-0}" = 1 ]; then
  RUNF="${MESH_RUN:-/srv/live-mesh-run}/feed"; mkdir -p "$DST/collector/seed/store"
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
