# Burst watcher playbook

End-to-end install: [SETUP.md](SETUP.md). This page is the watcher list and the fixes log.

Burst is the live activity network. A packet is one event. Spectrum is the page
(`docs-site/static/live`) replaying the feed; the center node reads `LiveMesh.HUB_LABEL`
(`Burst`). Working is a light under a seat icon. It is not a packet and it is not
counted in N of M.

Privacy for every watcher: ids, times, and counts. No command lines, env, file names,
file contents, comment bodies, or commit messages in the working store. The lab-run
store is one time per seat.

## Active vs working

| | Counted in N of M | What lights it |
|---|---|---|
| Active | yes | a GitHub event, owned-file mtime, prompt, or activity line within 15 min |
| Working | no | the signals below |

The fleet line on the page counts seats that have a packet in flight. A working-only
seat stays out of that count.

## LIVE vs behind

`generated_at` age ≤ 90s → the pill says **LIVE**. Older than that → **behind N min**
(`max(1, round(age/60))`). The pill is feed freshness. Rewound playback stays on the
timeline, not in the pill.

## Watchers

| Watcher | Source | Cadence | Emits | Privacy | How a seat plugs in |
|---|---|---|---|---|---|
| GitHub collector | host process next to the page (`fetch_feed.py`) | every `--watch` pass | packets: PR open/update, reviews, comment metadata, merges, pushes | ids, times, status words; no commit message on branch-tip pushes | host variable `GITHUB_READ_TOKEN`. See "Hosted collector" |
| Branch tips | `branch_tip_events` inside the same pass | every pass, not after a backfill gate, any branch except `live-wire` | packet `push` | branch name, short sha, author login, committer time. The commit message is not stored | nothing extra |
| PR opens | `pr_events` on the pulls list | every pass, any base branch | packet `pr_open` | existing feed fields | nothing extra |
| GitHub-check working | Actions runs/jobs and commit statuses (Checks is not on a fine-grained token) | every pass | working, not a packet | one until-time per author seat | automatic for a PR the seat authored |
| /health | `probe` in `fetch_feed.py` | `--health-every` (default 60s), emit on status change | packet `health_ok` / `health_fail` | HTTP status code and time. The body is not read | `--health URL` |
| Lab-run working | `house/burst/working.py` | every collector pass when `BURST_LABS` is set | working, not a packet | one until-time per seat. Mtimes, cwd, and CPU time only | `BURST_LABS` JSON: `[{seat, runs, folders}]` |
| Seat activity | `fleet/activity.jsonl` and `POST /activity` | one line at start, one line at end | working while a start has no end, cap 60 min. Not a packet | names and times only. No prompt or message text | Same object. `seat` is optional on the post and must match the installation token, case-insensitive, or the post is 403 `seat mismatch`. The stored seat is the token's seat |
| Railway deploys | the seat writes a status file; the collector does not call Railway | seat poll 180s | packet only if the seat maps a status change into the feed | id, status word, time | keep project ids in the seat's own config, not in this repo |
| House board and merge queue | files the seat already writes | every collector pass when the seat points at them | counts and card ids | ids, status words, counts | not a second copy of the house tree |
| prompts.jsonl | a SENT pulse on the seat's prompt log | every pass the file is present | working for 10 min after SENT. Not a packet | display name resolved through seats aliases. No prompt text | `BURST_PROMPTS` (default `fleet/prompts.jsonl`). Line: `{t_ct, seat, kind: prompt, action: sent}`. Legacy `{t_ct, from, to}` pulses the `to` seat. `Chief of Staff` → `CoS`, `Lab Tester: Chaos` → `Chaos` |
| cloud-agents.jsonl | tail the seat's log | every pass the seat runs | activity lines | names, times, ids. No message text | a line that passes `validActivity` with `kind` `cloud_agent` |
| POST /activity | `house/burst/activity.mjs` | one post at turn start; the window stays open until end | one stored line | strict short fields; seat comes from the verified token | the seat's own GitHub App installation token |
| Laptop repo watcher | the seat's loop, off the house box | every 30s, plus a heartbeat | working while the turn is open | ids, times, counts. No command lines | `house/burst/bin` first on `PATH`. See "Seat on a laptop" |
| Supervisor | `house/burst/supervise.py` | restarts when the feed exits; re-mint at 50 min of wall time | process start, exit 75 | no tokens in logs | `BURST_TOKEN_MINTED` from `date +%s` |
| Watchdog | the same restart loop | about 60s | start the feed again if it died | none | `run()` until the stop file exists |
| Delta pusher | `house/burst/push.sh` + `push-delta.mjs` | one post while the lock is held, then sleep 2s | one delta to the ingest | local activity lines already written | secret is the `X-Burst-Ingest` header; a 409 posts once more |
| Pages tripwire | `house/live-mesh/tripwire_push.py` | 300s | `feed_push` when the public snapshot changes | existing feed | unchanged |

### Lab-run working (live rule)

A seat is working when either:

- any **file** under its run folders changed in the last **150s** (mtimes only; skip directories named `node_modules` and `.git`), or
- a process whose cwd is inside the seat's lab folders used **≥ 1s CPU** since the previous pass. That light stays **120s**.

The first CPU sample is a baseline only. Folder mtime is not the signal: it changes on add/remove, and a test stretch writes no new files. The store is one until-time per seat.

### GitHub-check working

A running, queued, or failing check on a PR the seat authored, newer than that PR's last merge, within 30 minutes. Success does not light working.

### Fail-safe working

A seat is working for **10 minutes** after any `prompts.jsonl` line pulses it `SENT`, or while an `activity.jsonl` start has no later end for the same seat, kind, and tag, for at most **60 minutes**. Display names resolve through the seats config `aliases` (`Chief of Staff` → `CoS`, `Lab Tester: Chaos` → `Chaos`). The feed field `fleet.missing_activity` lists seats that pulsed in the last 60 minutes and have no activity line in that window. The page does not read that list.

### Header dot

Chip text, the blinking dot, and the node label read one derived state: **working**, then **active**, then **idle**. The dot blinks only while that state is working. The chip cannot say idle while the dot blinks or the node says working. There is no extra glyph. Working is still outside the fleet count.

### Delta and the page poll

Cursor is `epoch.seq`. A delta whose `base` is not the current cursor is **409** with the current cursor; the client refetches the full feed. `?since` at the current seq is **304**. When the feed carries a cursor, the page polls `live-events.json?since=` every **10s**. The GitHub contents poll stays at 60s so an anonymous viewer does not burn the hourly limit.

### Tokens

Re-mint when wall-clock age reaches 50 minutes (`remint_due`). A **401** raises `AuthExpired`, which is not an `OSError`, so a per-step handler cannot treat it as a dropped connection. The pass does not write, and the process exits **75**.

Installation token shape, before any GitHub call:

```
/^ghs_[A-Za-z0-9._-]{20,1024}$/
```

There is no static `ACTIVITY_KEY` fallback. The verdict cache stores `sha256(token)` only.

### Git and gh

`house/burst/bin/gh` forces the read-only plan (a non-read permission exits 2). `git-credential` and `use-repo` take `BURST_BOT_LOGIN` and `BURST_BOT_ID` from the environment. App id and installation id are `GITHUB_APP_ID` and `GITHUB_APP_INSTALLATION_ID`.

### Pusher lock

`push.sh` posts one delta to `BURST_INGEST_URL` while it holds flock on fd 9. The ingest secret is the `X-Burst-Ingest` header. A 409 refetches `BURST_FEED_URL` and posts once more. The script then sleeps with `9>&-`, so a stopped pusher's orphan sleep does not keep the lock.

## Seat on a laptop (off-box seat)

A seat that does not run on the house box uses its own GitHub App. App id, installation id, and the private key stay in that seat's environment. This page does not name them.

Put `house/burst/bin` first on `PATH`, ahead of a system or Homebrew `gh`, so `gh` is the app wrapper.

The installation token is cached and reused until 120 seconds before `expires_at`. The wrapper mints again after that. The shape check is `^ghs_[A-Za-z0-9._-]{20,1024}$`, so a long token that contains `.` and `_` is accepted and sent to GitHub.

Git HTTPS uses `house/burst/bin/git-credential`. The helper answers with that app token. `use-repo` sets the commit identity to the bot: `user.name` is `<app-slug>[bot]`, and `user.email` is that bot's GitHub noreply address. Do not author commits under a human name.

Push the seat's branch with:

```
git push origin HEAD:<branch>
```

The seat's repo watcher polls its repos every 30 seconds and records a heartbeat (a time). Activity is one `POST /activity` per turn, at the start (`kind` `turn`, `action` `start`). That turn window stays open until a later post with `action` `end`. Do not post on every tick.

Forks: the app can push to the org's fork. Opening or merging a pull request on an upstream org needs an admin of that org.

## Hosted collector

Running the GitHub watcher on a laptop or VM made the board go stale whenever that box paused or hung. The GitHub collector now runs on the hosting platform (for example Railway) next to the page. It writes straight into the server's event store.

The box or laptop only pushes local signals: prompt lines, cloud-agent logs, and lab-run mtimes. Those arrive as deltas and are merged by id. If the box is down, GitHub events still flow. Seat state that came from the box shows stale.

### Setup

Create a fine-grained personal access token. In GitHub: Settings → Developer settings → Personal access tokens → Fine-grained.

- Resource owner: your org.
- Repository access: only the watched repos.
- Permissions, read-only: Contents, Pull requests, Issues, Actions, Commit statuses. Metadata is included automatically.

Fine-grained tokens have no Checks permission. Check state is derived from Actions runs and jobs, and from commit statuses.

Set the token as the host variable `GITHUB_READ_TOKEN`. Do not put a GitHub App private key on the host: that key can mint write tokens. Do not commit the token. Set an expiry and rotate it.

## Fixes log

1. **Lab-run working looked idle during a test stretch.** Folder mtime changes only when a name is added or removed, and a test stretch writes no files. Working is any file mtime under the run folders in the last 150s (skip `node_modules` and `.git`) or ≥1s CPU in a lab-folder cwd (hold 120s). Read mtimes, cwd, and CPU time only. Store one time per seat. Not counted in N of M.

2. **A seat with a running check looked idle.** Working is a running, queued, or failing check on a PR that seat authored, newer than its last merge, within 30 minutes.

3. **PR opens and branch pushes waited on a backfill and on main.** Every collector pass lists pulls and branch tips. Any branch except `live-wire`. The tip event does not store the commit message.

4. **A paused VM kept a dead token, and a 401 rewrote the feed as fresh.** Re-mint compares `time.time()` values. `AuthExpired` is not an `OSError`. Exit 75. Do not write.

5. **The page refetched the whole feed and could not tell a stale cursor.** Push deltas carry `epoch.seq`. A bad base is 409. `?since` at the current seq is 304. The page polls that every 10s once the feed has a cursor.

6. **Working added a word next to the seat.** The existing header dot blinks in the seat color. The chip text does not change.

7. **Off-box seats could not post.** `POST /activity` verifies that seat's GitHub App installation token (bot login, bot id, and org) and stores one strict line. No static key.

8. **Real installation tokens got 401 before GitHub was asked.** The shape check was `ghs_[A-Za-z0-9]{20,255}`, which rejects `.` and `_` and anything longer than 255. Live tokens are ~380 characters and contain both. The check is `^ghs_[A-Za-z0-9._-]{20,1024}$`.

9. **A stopped pusher left the lock held.** `sleep` runs with fd 9 closed (`9>&-`).

10. **The board went stale when the laptop or VM paused or hung.** The GitHub watcher ran on that box, so a pause stopped every GitHub event. The collector now runs on the host next to the page and writes into the server's event store. The box only pushes local signals (prompts, cloud-agent logs, lab-run mtimes) as deltas merged by id. If the box is down, GitHub events still flow and box-sourced seat state shows stale.

11. **Busy seats showed idle.** A quick reply cleared the prompt signal, and background work was not logged. `fleet/activity.jsonl` records one line at the start and one at the end (`kind` `subagent`, `turn`, or `watcher`). The seat stays working while a start has no later end for the same seat, kind, and tag, for at most 60 minutes. Names and times only. Not counted in N of M. Off-box seats POST the same line with their own App token.

12. **The header said IDLE while the dot blinked or the node said working.** Chip text, the blinking dot, and the node label read one state: working, then active, then idle. A working seat is working in all three. Working stays outside N of M.

13. **A prompt went quiet and a post could name another seat.** `seat` on `POST /activity` is optional. When it is present it must match the installation token, case-insensitive, or the response is 403 `seat mismatch`. The stored seat is the token's seat. There is no static key. A `SENT` prompt pulse keeps the seat working for 10 minutes, after display names resolve through seats aliases. An open `activity.jsonl` start still caps at 60 minutes. `fleet.missing_activity` lists seats that pulsed in the last 60 minutes with no activity line. The page does not show that list.
