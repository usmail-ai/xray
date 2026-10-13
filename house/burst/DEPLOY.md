# Deploy: the live board on Railway

This answers the hosting questions on #248 from the setup running today. Hostnames, project names, seat names
and repos are examples. No values are secret here; set real values as Railway variables.

Code: [house/live/](../live/) (server in `house/live/app/`, feed pass in `house/live/feed/`).

## 1. Second process: file and start command

There is no separate page/store service. It is one Node process, `house/live/app/server.mjs`
(Node 20, zero npm dependencies), started with `node server.mjs`. It serves:

| Route | Auth | What |
|---|---|---|
| `GET /` and static page | `MESH_PASSWORD` login, cookie `mesh_session` (HMAC with `SESSION_SECRET`, 7 days) | `house/live/app/public/` |
| `GET /live-events.json[?since=<cursor>]` | session cookie | full feed, or delta; `304` unchanged, `409`/reset means refetch full |
| `POST /ingest`, `POST /ingest/delta` | `Authorization: Bearer $INGEST_SECRET` | box-side feed (gzip ok, 25 MB cap) |
| `GET /ingest/events`, `GET /activity/pull`, `POST /inbox` | ingest secret | box pusher only |
| `POST /activity` | the seat's own GitHub App installation token, verified against GitHub | activity lines from off-box seats |
| `GET /inbox/<seat>[?since=<id>]`, `POST /inbox/<seat>/ack` | that seat's key | seat inbox, ack by id, upto or all |
| `GET /cards?seat=<seat>` | that seat's key (operator: any) | cards with packets and beats |
| `GET /nudges?since=<id>` | operator key | nudges for delivery |
| `POST /emit` | emitter key, write-only | external emitter events (tool calls); unknown fields get 422 |
| `GET /healthz` | none | `ok` |

The GitHub collector (`house/live/feed/live_mesh.py`, which imports `house/live-mesh/fetch_feed.py`) is the
second process. `server.mjs` spawns it as a child: `python3 -B -u collector/live_mesh.py --out /data/feed/github-events.json --watch 45 --repos <org/repo ...>`.
`house/burst/ingest.py` is not used on the host.

## 2. Topology

- One Railway service, one container, one volume. No Procfile, no `supervise.py`, no shell `&`.
- `server.mjs` is the supervisor. It starts the collector child at boot. If the child exits, it restarts it with
  backoff (15 s doubling to 300 s), and kills it on shutdown. Set `COLLECTOR=off` or leave `GITHUB_READ_TOKEN` unset to run without it.
- How the feed JSON reaches the server: the child writes `/data/feed/github-events.json` on the same volume, and the
  server reads it on change. Box-side signals (activity, prompts, fleet state) come in through `POST /ingest[/delta]`
  from the box pusher (`house/live/feed/push_to_host.sh`). The server merges both sources by event id, and the
  GitHub copy wins on a tie.
- Inboxes, ack state, cards and nudges are persisted on the volume under `/data/live/`.

## 3. Start commands, builder and runtime

- Builder: Dockerfile (`house/live/app/Dockerfile`): `node:20-bookworm-slim` plus Debian `python3` (3.11),
  `tzdata`, `ca-certificates`. Stdlib Python only.
- Start: `node server.mjs` (from `house/live/app/railway.json`, and from `house/live/app/.railway/railway.ts`). The child start is shown in section 1.
- Repo-root `railway.json` (`node mcp-server.mjs`) belongs to the xray MCP server, not to this. Do not deploy the
  live board from the repo root. Deploy with `house/live/app/deploy.sh`: it assembles a deploy dir (app files plus
  `collector/` = the `feed/live_*.py` modules and `house/live-mesh/fetch_feed.py`) and runs
  `railway up --service <service> --detach` from that dir. If you deploy from GitHub instead, set the root directory to
  a dir laid out the same way.
- `deploy.sh` names: `LIVE_RAILWAY_PROJECT` (default `live-board`), `LIVE_RAILWAY_SERVICE` (default `live-mesh`), `MESH_APP_DEPLOY_DIR` (default `/srv/live/deploy`). These are the project, the service, and the railway-linked directory. They are not Railway variables on the service.
- `LIVE_PUBLIC_OVERLAY` is a directory on the machine that runs `deploy.sh`. After the kit `public/` is copied, that directory is copied on top, so a fleet's `live-config.js` and `avatars/` survive the next deploy. Unset means the kit page only.
- `railway.json` (Config as Code) is still read until **2026-12-01**. The replacement is `house/live/app/.railway/railway.ts`: `start` `node server.mjs`, `healthcheck` `/healthz`, one replica. `deploy.sh` copies that directory into the deploy dir. Do not `railway config apply` while `railway.json` is still the service config. Before the cutoff, from the deploy dir: `railway config plan`, then `railway config apply`. Rename `service()` and `project()` in that file to match `LIVE_RAILWAY_SERVICE` and `LIVE_RAILWAY_PROJECT`. Put no secrets in the file.

## 4. Env var names (names only)

Railway service (`server.mjs`):

| Name | Need | Notes |
|---|---|---|
| `PORT` | set by Railway | default 8080 |
| `MESH_PASSWORD` | required | page login |
| `SESSION_SECRET` | required, 32+ chars | cookie HMAC |
| `INGEST_SECRET` | required, 32+ chars | box pusher |
| `SEAT_KEYS` | required for inboxes | JSON `{seat: sha256hex}`; hashes only, from `feed/seat_keys.sh publish` |
| `GITHUB_READ_TOKEN` | for the collector | fine-grained, read-only |
| `MESH_DATA_DIR` | optional | default `/data` |
| `COLLECTOR`, `COLLECTOR_REPOS`, `COLLECTOR_HEALTH_URLS`, `COLLECTOR_WATCH_S` | optional | `off`; `org/repo ...`; space-separated app `/health` URLs (unset means the collector probes no host); default 45 |
| `LIVE_FLEET_SEATS` | optional | JSON list of seat names, or `{"seats","board","fold"}`, or a path to that JSON. Unset keeps the example seat list. Passed to the collector. The header "N of M bots active" counts `board` (or the list). |
| `NUDGE_L1_S`, `NUDGE_L2_S`, `NUDGE_L3_S`, `SILENT_S`, `HELD_MAX_S` | optional | 3600, 1800, 7200, 7200, 259200 |
| `EMITTER_WORKING_S`, `BOX_STALE_S` | optional | 120, 180 |
| `BOARD_BOX_STALE_S` | optional | 900. The box pass board is shown while the box pushed within this many seconds; after that the host collector's board is used |
| `GITHUB_HOLD_LABEL` | optional | label that holds a card; default `on-hold` |
| `NO_NUDGE_REPOS` | optional | comma list of `owner/name` or `owner/*`; unset means every repo can be nudged |
| `SEAT_PRESENCE` | optional | JSON `{source seat: dest seat or [dest, ...]}`; default `{"builder-cloud":"builder"}` |
| `SEAT_WEBHOOKS` | optional | JSON `{seat: {url, key_env, header?}}`; the key is `process.env[key_env]`, never this JSON |
| `WAKE_DEBOUNCE_S`, `WAKE_COALESCE_MS`, `WAKE_RETRY_MS` | optional | 60, 50, 400 |
| `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECTS` | optional | all four turn the Jira pull child on; the token stays in that child |
| `JIRA_HOLD_STATUS`, `JIRA_EXCLUDE`, `JIRA_SOURCE`, `SOURCE_ALLOWLIST` | optional | hold status default `On Hold`; `off` disables the pull; allowlist for other sources |
| `UPSTREAM_REPO` or `XRAY_REPO` | optional | one public repo to watch; unset means the upstream watcher is off |
| `UPSTREAM_PINNED`, `XRAY_OURS` | optional | `owner/name#N` list; logins that count as this fleet. Both unset means nothing is tracked |

One Node process (`server.mjs`) serves the page and supervises the collector child. There is no second page service.
The board is the `board` object on the feed header, built by `feed/live_board.py` in the feed pass (the host collector builds it too, so a host-only install has a board). A box pass board wins while the box pushed within `BOARD_BOX_STALE_S` (default 900 s); after that the host board is used.

Collector child: its env is built from scratch by the server and holds only `GH_TOKEN` (= `GITHUB_READ_TOKEN`), `HOME`,
`PATH`, `TZ`, `LIVE_MODE=github`, `LIVE_NO_CHECKS=1`, `LIVE_HEALTH_URLS` (from `COLLECTOR_HEALTH_URLS`, empty when unset), `LIVE_MESH_SRC`, and, only when you set them,
`GITHUB_HOLD_LABEL`, `NO_NUDGE_REPOS`, `UPSTREAM_REPO`, `UPSTREAM_PINNED`, `XRAY_REPO`, `XRAY_OURS`, `SEAT_PRESENCE`, `LIVE_NODE_MAP`, `LIVE_BRAND`, `LIVE_BRAND_RE`, `LIVE_SHOW_UNMAPPED`, `LIVE_FLEET_SEATS`.
It never sees the password, session secret, ingest secret, seat hashes, or the Jira token.
The child `--health` argument is the first URL in `COLLECTOR_HEALTH_URLS`, or empty. There is no example host.

Stored collector events are relabeled with the current `LIVE_NODE_MAP` when the store is loaded. A seat change does not require deleting the store.

Box (feed pass, `feed/supervisor.sh`): `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` (read-only
mint only), `MESH_RUN`, `LIVE_HEALTH_URLS`, `LIVE_MERGE_QUEUE`, `LIVE_REST_FLOOR`, `LIVE_GQL_FLOOR`, `LIVE_BACKFILL_SECONDS`, `LIVE_RAILWAY_TARGETS` (optional deploy poller; JSON list, ids from your own Railway projects).
Box pusher (`house/live/feed/push_to_host.sh`, not `house/burst/push.sh`): `LIVE_HOME` (default `/srv/live`), `MESH_RUN` (default `/srv/live/run`), `FEED` (default `$MESH_RUN/feed/live-events.json`), plus `MESH_URL` and `INGEST_SECRET` in `$MESH_RUN/.push-env` (mode 0600).
Seat helpers and emitter: `LIVE_URL`, `LIVE_KEY`, `SEAT_KEYS_DIR`.
Seat keys (`feed/seat_keys.sh`): `SEAT_KEYS_SEATS` or `SEATS_JSON` for the seat list, `LIVE_RAILWAY_SERVICE`, `MESH_APP_DEPLOY_DIR`, `SEAT_KEYS_DIR`. Unset seats keep the example list. New keys are `<seat>.key`. A legacy bare `builder-cloud` file is still read.

## 5. Volume

One volume on the service, mounted at `/data`. A 5 GB volume is enough to start. Layout: `/data/feed/`
(collector output, store, and `jira-events.json` when Jira is on), `/data/live/` (inboxes, acks, cards, nudges), `/data/home/` (child HOME).

## 6. Healthcheck

`healthcheckPath: /healthz` in `railway.json`, and `healthcheck: "/healthz"` in `house/live/app/.railway/railway.ts`. `server.mjs` answers `GET /healthz` on `$PORT`. The collector does not
answer HTTP. The `/health` URLs in `COLLECTOR_HEALTH_URLS` are your app's endpoints, polled for status code only. Unset means no probe. `railway.json` stops being read on 2026-12-01; switch to the `.railway/railway.ts` file before that date (section 3).

Install mismatches are listed as Symptom / Cause / Fix in [house/live/docs/faq.md](../live/docs/faq.md).

## 7. Key model per process

- Server: no GitHub key. It holds sha256 hashes of seat keys (`SEAT_KEYS`), the three secrets above, and verifies
  `POST /activity` installation tokens against GitHub (bot login and id pinned in `GH_SEATS`, every installation repo in
  your org). It caches only by sha256 of the token.
- Collector child: `GITHUB_READ_TOKEN` only, a fine-grained read-only token (no Checks permission; suites and runs come
  from Actions). No App keys on the host.
- Box feed pass: App keys (`GITHUB_APP_*`) for a read-only installation token minted every 50 minutes. The mint
  refuses any non-read permission. The box runs in "box" mode (no GitHub calls) when the host collector is on.
- Seats: each seat gets one random key (`feed/seat_keys.sh mint`, files 0600, never printed). Only the hash goes to Railway.
  An off-box builder seat uses its own App installation token instead.

## 8. Region, plan and cost

- Region: one replica in a region close to the seats. Any region works.
- Plan: a Hobby-tier workspace is enough for one small always-on service and a 5 GB volume.
- Cost: roughly $5 to $10 a month (one small Node process plus a Python child, low egress, and the volume at about
  $0.25/GB-month). Check your own Usage page; we did not export an invoice figure.

## What this release adds

Source cards (Jira pull or `POST /ingest/source`), inbox lines that validate before a replace and return 400 when
nothing is stored, a read that does not ack (`--ack` / `--pop` is the receipt), board groups (in work, seat, folded
issues), ghost-card reconcile, holds from a Jira status, a GitHub label, or a `Held:` comment, `NO_NUDGE_REPOS`,
one pinned upstream repo plus `XRAY_OURS`, `SEAT_PRESENCE` (a string or an array of seats), and inbox webhooks.
A merge closes the card. A failed retest after merge needs a new issue.
