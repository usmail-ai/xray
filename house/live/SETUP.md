# Live board setup

## Pieces
- **Railway server** (`app/server.mjs`, service `live-mesh`): the page, the merged feed, and the **source of truth** for
  seat inboxes, cards and nudges (volume `/data/live/`: `inbox/<seat>.jsonl`, `cards.json`, `nudges.jsonl`).
- **Box feed pass + pusher** (`feed/`, released with `feed/release.sh`): builds events and the card model and
  pushes them (`POST /ingest[/delta]`, header `board` = cards), routes seat inbox lines and posts them
  (`POST /inbox`). Locally it keeps only a ring buffer (`$MESH_RUN/feed/inbox-spool/<seat>.jsonl`, 300 lines a seat)
  for when the server can't be reached.

## Seat auth
| Seat | Credential |
|---|---|
| builder | its builder-app installation token (`ghs_…`, verified with GitHub; unchanged) |
| reviewer, tester, qa, coord, operator, growth, qa-one, qa-two, triager, seat-c, chatbot, seo-researcher, seo-writer, offsite-copier | a per-seat key: `Authorization: Bearer <key>` |

Keys live only on the box: `$SEAT_KEYS_DIR/<seat>.key` (default `/srv/live-mesh-run/secrets/seat-keys`; dir 0700, files 0600). The
server holds only their SHA-256 hashes, in the Railway variable `SEAT_KEYS` (JSON `{seat: sha256hex}`).
Rotate: `feed/seat_keys.sh mint` (writes new keys, never prints them) then `feed/seat_keys.sh publish` (sets
`SEAT_KEYS` on Railway) and deploy with `app/deploy.sh`.

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
| `POST /inbox` | `X-Live-Ingest` (box pusher) | stores seat lines (deduped by id) |
| `GET/POST /inbox/builder` | as before | kept for Builder's existing reader |

## Nudge timing (server env)
`NUDGE_L1_S` (default 3600) and `NUDGE_L2_S` (default 1800).

## Retired local files
`fleet/inbox/*.jsonl` were archived to `logs/inbox-retired-<date>/`; `house/BOARD.md` is frozen with a header
pointing to the live board. Re-enable local writing only for debugging with `LIVE_BOARD_LOCAL=1`.

## Box helpers (any box bot)
- `tools/live-inbox <seat> [--peek]`: open inbox lines as JSON lines (a read without --peek acks them on the server); `live-inbox <seat> --ack <id|all>` clears; cursor in
  `/srv/live-mesh-run/fleet/cursors/<seat>.txt` (advanced after a successful read).
- `tools/live-cards <seat>`: the seat's cards as JSON lines (with nudge beats).
Copies live in `tools/`. Builder (on its own machine) uses `tools/paste-block.sh` (`live_act`, `live_inbox`; token minted
in-process by the builder-app wrapper's `mint_token.token()`, never printed).

## Silent seats
A bot seat with no activity / prompt / beat for > 2 h (`SILENT_S`, default 7200) while it owns live work (owner, next
owner or retest owner of a live card, or an open nudge) shows amber `silent 2h` on its node and chip, and Coord gets one
nudge (`kind: silent`, `about: <seat>`) per quiet stretch. Humans (Lead) are never flagged.
