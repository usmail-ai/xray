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
- Start: `node server.mjs` (from `house/live/app/railway.json`). The child start is shown in section 1.
- Repo-root `railway.json` (`node mcp-server.mjs`) belongs to the xray MCP server, not to this. Do not deploy the
  live board from the repo root. Deploy with `house/live/app/deploy.sh`: it assembles a deploy dir (app files plus
  `collector/` = the `feed/live_*.py` modules and `house/live-mesh/fetch_feed.py`) and runs
  `railway up --service <service> --detach` from that dir. If you deploy from GitHub instead, set the root directory to
  a dir laid out the same way.

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
| `COLLECTOR`, `COLLECTOR_REPOS`, `COLLECTOR_HEALTH_URLS`, `COLLECTOR_WATCH_S` | optional | `off`; `org/repo ...`; health URLs; default 45 |
| `NUDGE_L1_S`, `NUDGE_L2_S`, `SILENT_S`, `EMITTER_WORKING_S`, `BOX_STALE_S` | optional | 3600, 1800, 7200, 120, 180 |

Collector child: its env is built from scratch by the server and holds only `GH_TOKEN` (= `GITHUB_READ_TOKEN`), `HOME`,
`PATH`, `TZ`, `LIVE_MODE=github`, `LIVE_NO_CHECKS=1`, `LIVE_HEALTH_URLS` and `LIVE_MESH_SRC`. It never sees the
password, session secret, ingest secret or seat hashes.

Box (feed pass, `feed/supervisor.sh`): `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` (read-only
mint only), `MESH_RUN`, `LIVE_HEALTH_URLS`, `LIVE_MERGE_QUEUE`, `LIVE_REST_FLOOR`, `LIVE_GQL_FLOOR`, `LIVE_BACKFILL_SECONDS`.
Box pusher: `MESH_URL`, `INGEST_SECRET` (from a 0600 file).
Seat helpers and emitter: `LIVE_URL`, `LIVE_KEY`, `SEAT_KEYS_DIR`.

## 5. Volume

One volume on the service, mounted at `/data`. Ours is 5 GB and uses about 0.2 GB. Layout: `/data/feed/`
(collector output and store), `/data/live/` (inboxes, acks, cards, nudges), `/data/home/` (child HOME).

## 6. Healthcheck

`healthcheckPath: /healthz` in `railway.json`. `server.mjs` answers it on `$PORT`. The collector does not
answer HTTP. The `/health` URLs in `COLLECTOR_HEALTH_URLS` are your app's endpoints, polled for status code only.

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

- Region: one replica in a US West region (ours is `sfo`). Any region works.
- Plan: a Hobby-tier workspace is enough for one small always-on service and a 5 GB volume.
- Cost: roughly $5 to $10 a month (one small Node process plus a Python child, low egress, and the volume at about
  $0.25/GB-month). Check your own Usage page; we did not export an invoice figure.

## Changes since a9b99109

All of it is in this PR: the server, collector, seat inboxes and ack, cards/packets/beats, nudges with owner logic and
retargeting, reviewer verdict beats, parked state, the silent-seat check, the emitter endpoint, helpers and tests.
