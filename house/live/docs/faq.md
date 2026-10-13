# Deploy FAQ

Generic install mismatches. No project ids, no secret values. The agreed host setup is [DEPLOY.md](../../burst/DEPLOY.md): start `node server.mjs`, health check `GET /healthz`, root directory is the assembled deploy dir, collector probes come only from `COLLECTOR_HEALTH_URLS`.

### The service starts the wrong program

- **Symptom:** The process is `python3 house/live-mesh/fetch_feed.py`, or the page is a static `docs-site` directory.
- **Cause:** An old setup section named that command, `BURST_REPOS`, and `BURST_HEALTH_URL`.
- **Fix:** Follow DEPLOY. Start `node server.mjs`. Set `COLLECTOR_REPOS` and `COLLECTOR_HEALTH_URLS`.

### Deploy from the repo root runs a different server

- **Symptom:** The container starts `node mcp-server.mjs`, or the live page is not the one in `house/live/app`.
- **Cause:** The repo-root config belongs to the MCP server. The live board is not deployed from the repo root.
- **Fix:** Run `house/live/app/deploy.sh`, or set the root directory to a directory laid out the same way as that script's deploy dir.

### `deploy.sh` stops on a missing lockfile

- **Symptom:** `deploy.sh` exits immediately. `cp` names `package-lock.json` and that file is not in `app/`.
- **Cause:** The copy list includes a file the app does not ship. `set -e` aborts the script.
- **Fix:** Copy only files that exist. Do not name `package-lock.json`.

### The container exits on import

- **Symptom:** `server.mjs` fails at startup because `./presence.mjs` or `./source.mjs` cannot be loaded.
- **Cause:** `deploy.sh` and the Dockerfile copy `server.mjs` without those modules.
- **Fix:** Copy `presence.mjs` and `source.mjs` next to `server.mjs` in both places.

### `railway up` targets the wrong project or service

- **Symptom:** The deploy lands on `live-board` / `live-mesh`, or the script says the deploy dir is not linked.
- **Cause:** Those names are the defaults. The overrides were not in the deploy guide.
- **Fix:** Set `LIVE_RAILWAY_PROJECT`, `LIVE_RAILWAY_SERVICE`, and `MESH_APP_DEPLOY_DIR` to your own names before `deploy.sh`. `seat_keys.sh publish` uses the same service and deploy dir.

### A deploy wipes the fleet's page

- **Symptom:** After `deploy.sh`, seats, node positions, and avatar images are back to the example page.
- **Cause:** The script replaces `public/` with the kit copy.
- **Fix:** Point `LIVE_PUBLIC_OVERLAY` at a directory that holds your `live-config.js` and `avatars/`. The script copies it on last.

### Every login is Others, and the title stays Example

- **Symptom:** Mapped seats never appear. The page title stays "Example live mesh".
- **Cause:** The collector's environment is built from scratch, so `LIVE_NODE_MAP`, `LIVE_BRAND`, and `LIVE_BRAND_RE` set on the service never reach it.
- **Fix:** Pass those three into the collector environment when they are set.

### Old events stay Others after the map changes

- **Symptom:** New events use the new seat. Events already in the store stay `Others`.
- **Cause:** Incremental polls relabel an item only when that item changes.
- **Fix:** On load, set `from` from `node(actor)` or `node(author)` again. Do not delete the store. `from` values `GitHub` and `Example` stay as they are.

### Unmapped logins publish their name and title

- **Symptom:** A login that is not in the map shows as `Others` with that login and the item title.
- **Cause:** There is no switch to drop those events.
- **Fix:** Drop them unless `LIVE_SHOW_UNMAPPED=1`.

### The board says no cards

- **Symptom:** The page, the collector, and the pusher are up. The board says "no cards".
- **Cause:** The host child is `LIVE_MODE=github` and used to skip `live_board`. A host-only install has no box board to fall back on.
- **Fix:** The host builds a board from GitHub events, so a host-only install has cards. A box board wins while the box pushed within `BOARD_BOX_STALE_S` (default 900 s). After that, the server uses the host board.

### The header says 0 of 7 bots active

- **Symptom:** The count never matches this fleet's seats.
- **Cause:** `live_fleet.py` counted a fixed seat list, and the page counted that fleet object.
- **Fix:** Set `LIVE_FLEET_SEATS` to a JSON list, or `{"seats","board","fold"}`. The header counts `board` (or the list). The same variable is passed to the collector.

### `seat_keys.sh` mints the example seats on the example service

- **Symptom:** Keys appear for seats this fleet does not have, and `railway variables` targets `live-mesh` in `/srv/live/deploy`.
- **Cause:** The script had one seat list, one service, and one directory.
- **Fix:** Set `SEAT_KEYS_SEATS` or `SEATS_JSON`, and `LIVE_RAILWAY_SERVICE` plus `MESH_APP_DEPLOY_DIR`.

### Two different pushers

- **Symptom:** One doc says `house/burst/push.sh` and `seats.json`. The other says `house/live/feed/push_to_host.sh`.
- **Cause:** Those are different programs.
- **Fix:** Use `push_to_host.sh`. Set `LIVE_HOME`, `MESH_RUN`, and `FEED`. Put `MESH_URL` and `INGEST_SECRET` in `$MESH_RUN/.push-env` (mode 0600).

### The collector probes an example host

- **Symptom:** Logs request `https://dev.example.com/health` even though you set no health URL.
- **Cause:** The child was started with that URL, and `LIVE_HEALTH_URLS` fell back to the same host.
- **Fix:** Use `COLLECTOR_HEALTH_URLS` for the environment and for `--health`. Unset means no probe.

### A watched repo logs 404

- **Symptom:** Backfill never finishes for a repo. The log says 404.
- **Cause:** The fine-grained token does not include that repo.
- **Fix:** Add the repo to the token, or remove it from `COLLECTOR_REPOS`. The token must cover every watched repo.

### `railway up` warns that Config as Code is deprecated

- **Symptom:** Every deploy warns that `railway.json` is deprecated.
- **Cause:** Config as Code stops being read on 2026-12-01. DEPLOY still needs a start command and `/healthz` until then.
- **Fix:** `house/live/app/.railway/railway.ts` is the replacement (`node server.mjs`, health check `/healthz`, one replica). Plan and apply it before 2026-12-01, after `railway.json` is no longer the service config. Rename the service and project in that file to yours. Put no secrets in it.
