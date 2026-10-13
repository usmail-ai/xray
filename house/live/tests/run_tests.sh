#!/usr/bin/env bash
# Local tests (collector/adapter + Railway server), uses house/live-mesh/fetch_feed.py from this repo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest tests/test_collect.py tests/test_flow_fleet.py tests/test_queue_seed.py tests/test_push.py tests/test_nochecks.py tests/test_restart_working.py tests/test_inbox_pass.py tests/test_board.py tests/test_nudges.py tests/test_ghost.py tests/test_upstream.py tests/test_host_board.py tests/test_install.py
node --test tests/server.test.mjs tests/page.test.mjs tests/emitter.test.mjs tests/builder-cloud.test.mjs tests/presence.test.mjs tests/source.test.mjs tests/board-source.test.mjs tests/ingest-fleet-only.test.mjs
