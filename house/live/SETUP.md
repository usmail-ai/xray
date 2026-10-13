# Live board setup

## Pieces
- **Railway server** (`app/server.mjs`, service `live-mesh`): the page, the merged feed, and the **source of truth** for
  seat inboxes, cards and nudges (volume `/data/live/`: `inbox/<seat>.jsonl`, `cards.json`, `nudges.jsonl`).
- **Host collector** (`LIVE_MODE=github`): builds the board from GitHub events so a host-only install has cards. The page uses that board when the box board is absent or older than `BOARD_BOX_STALE_S`.
- **Box feed pass + pusher** (`feed/push_to_host.sh`, released with `feed/release.sh`): pushes box events
  (`POST /ingest[/delta]`). A box `board` wins while the box pushed within `BOARD_BOX_STALE_S` (default 900 s). Env: `LIVE_HOME`, `MESH_RUN`, `FEED`.
  Locally it keeps only a ring buffer (`$MESH_RUN/feed/inbox-spool/<seat>.jsonl`, 300 lines a seat)
  for when the server can't be reached.

## Fleet seats and unmapped logins (server env)

`LIVE_NODE_MAP` maps your fleet's GitHub logins to page seats (JSON object, or a path to a JSON file; non-string values are ignored). Logins not in the map are hidden by default everywhere: feed, board (including the inbox event cache), packets, upstream items. `LIVE_SHOW_UNMAPPED=1` shows them as `Others` instead, which publishes those logins and titles. The server passes both to the collector.

## Seat auth
| Seat | Credential |
|---|---|
| builder | its builder-app installation token (`ghs_…`, verified with GitHub; unchanged) |
| reviewer, tester, qa, coord, operator, growth, qa-one, qa-two, triager, seat-c, chatbot, seo-researcher, seo-writer, offsite-copier | a per-seat key: `Authorization: Bearer <key>` |

Keys live only on the box: `$SEAT_KEYS_DIR/<seat>.key` (default `/srv/live/run/secrets/seat-keys`; dir 0700, files 0600). The
server holds only their SHA-256 hashes, in the Railway variable `SEAT_KEYS` (JSON `{seat: sha256hex}`).
Rotate: `feed/seat_keys.sh mint` (writes new keys, never prints them) then `feed/seat_keys.sh publish` (sets
`SEAT_KEYS` on Railway) and deploy with `app/deploy.sh`. Seat list: `SEAT_KEYS_SEATS` or `SEATS_JSON`. Service and deploy dir: `LIVE_RAILWAY_SERVICE`, `MESH_APP_DEPLOY_DIR`.

| builder-cloud | a per-seat key (file `seat-keys/builder-cloud`, no `.key` suffix), seat display `Builder-cloud`: the cloud Builder. `POST /activity` (as `Builder-cloud`, own board node), `GET /inbox/builder-cloud` = every Builder line (merge-ready, Reviewer PASS) mirrored server-side + nudges to Builder (`type: nudge`), `GET /cards?seat=builder-cloud` = Builder's cards. Helper: `tools/builder-cloud-setup.sh` (key from env `LIVE_KEY`) |
| assistant | a per-seat key, **write-only**: `POST /emit` only (no inbox / cards). Used by the Example MCP server (env `LIVE_KEY`) |

## Assistant / emitter node
The Example MCP server (example-org/mcp, env `LIVE_URL` + `LIVE_KEY`) posts one event per tool call and
per OAuth sign-in to `POST /emit`: `{kind: tool|oauth, tool, t, ok, client: assistant|other, latency_ms}`. Any other field
is refused (422), so no customer data (addresses, content, emails, user ids) can land here. The `Assistant / emitter` node is
**working** until `EMITTER_WORKING_S` (default 120 s) after the last event, active for the fleet window, then idle.

## Endpoints
| Method + path | Auth | Returns |
|---|---|---|
| `GET /inbox/<seat>?since=<id>` | that seat | `{seat, lines}` after `<id>` (all when omitted / unknown) |
| `GET /cards?seat=<seat>` | that seat, or operator | cards the seat owns or is next owner on (coord / operator: all), with nudge beats |
| `POST /inbox/<seat>/ack` | that seat | `{id}` / `{upto}` / `{all: true}`: hides those lines for the seat. `GET /inbox/<seat>` returns OPEN lines only (not acked, card not past the seat's step: closed, or for reviewer a verdict at head); `?all=1` = history |
| `GET /nudges?since=<id>` | operator | `{nudges}` in creation order |
| `POST /inbox` | `X-Live-Ingest` (box pusher) | stores seat lines (deduped by id). A batch that stores nothing is 400 with `rejected` refs. `replace: true` clears only after a line validates |
| `POST /ingest/source` | `X-Live-Ingest` | normalized source events (`{source, events}`). Unknown fields are refused |
| `GET/POST /inbox/builder` | as before | kept for Builder's existing reader |

## Nudge timing (server env)
`NUDGE_L1_S` (default 3600), `NUDGE_L2_S` (default 1800), `NUDGE_L3_S` (default 7200), `HELD_MAX_S` (default 72h).
`NO_NUDGE_REPOS` unset means no repo is excluded. `GITHUB_HOLD_LABEL` default `on-hold`. `JIRA_HOLD_STATUS` default `On Hold`.
`SEAT_PRESENCE` default `{"builder-cloud":"builder"}`; a value may be a seat name or an array of seat names.
`UPSTREAM_REPO` (or `XRAY_REPO`) unset means the upstream watcher is off. `UPSTREAM_PINNED` and `XRAY_OURS` default empty.

## Retired local files
`fleet/inbox/*.jsonl` were archived to `logs/inbox-retired-<date>/`; `house/BOARD.md` is frozen with a header
pointing to the live board. Re-enable local writing only for debugging with `LIVE_BOARD_LOCAL=1`.

## Box helpers (any box bot)
- `tools/live-inbox <seat> [--peek]`: open inbox lines as JSON lines. A read never acks (`--peek` is the same as a plain read). `live-inbox <seat> --ack <id|all>` or `--pop <id|all>` is the receipt; the cursor still advances to the newest line seen. Cursor in
  `/srv/live/run/fleet/cursors/<seat>.txt` (advanced after a successful read).
- `tools/live-cards <seat>`: the seat's cards as JSON lines (with nudge beats).
Copies live in `tools/`. Builder (on its own machine) uses `tools/paste-block.sh` (`live_act`, `live_inbox`; token minted
in-process by the builder-app wrapper's `mint_token.token()`, never printed).

## Silent seats
A bot seat with no activity / prompt / beat for > 2 h (`SILENT_S`, default 7200) while it owns live work (owner, next
owner or retest owner of a live card, or an open nudge) shows amber `silent 2h` on its node and chip, and Coord gets one
nudge (`kind: silent`, `about: <seat>`) per quiet stretch. Humans (Lead) are never flagged.
