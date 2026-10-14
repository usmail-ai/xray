#!/usr/bin/env bash
# Local tests (collector/adapter + Railway server), uses house/live-mesh/fetch_feed.py from this repo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
LIVE_SITE_JSON= LIVE_BRAND=Example PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest tests/test_collect.py tests/test_flow_fleet.py tests/test_queue_seed.py tests/test_push.py tests/test_nochecks.py tests/test_restart_working.py tests/test_inbox_pass.py tests/test_board.py tests/test_nudges.py tests/test_ghost.py tests/test_upstream.py tests/test_host_board.py tests/test_install.py tests/test_fleet_seats.py tests/test_routing_ours.py tests/test_docs_fleet.py tests/test_activity_281.py tests/test_bifrost_init.py tests/test_bifrost_check.py
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest tests/test_site.py tests/test_watch.py
node --test tests/server.test.mjs tests/page.test.mjs tests/emitter.test.mjs tests/builder-cloud.test.mjs tests/presence.test.mjs tests/source.test.mjs tests/board-source.test.mjs tests/ingest-fleet-only.test.mjs
MESH_APP_DIR="$PWD/app" node --test tests/arch1.test.mjs tests/fleet-seats.test.mjs tests/collector-org.test.mjs tests/server-route.test.mjs tests/wake-shape.test.mjs tests/public-mode.test.mjs tests/archive.test.mjs tests/board-history.test.mjs tests/dockerfile-copy.test.mjs tests/health.test.mjs tests/origin.test.mjs tests/collector-build.test.mjs tests/governor.test.mjs tests/nudge-escalation.test.mjs tests/routing-map.test.mjs
python3 -B tools/bifrost-init --check   # every roster seat has a route; no rule targets a seat outside the fleet (#294)
python3 -B tools/bifrost-check --dry-run --only routing,deliver-sim,edit-sim,tripwire,lexicon,names   # post-deploy rules that need no live write (critic runbook)
