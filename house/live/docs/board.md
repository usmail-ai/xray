# Board

A card is one GitHub issue or pull request. A beat is a real event on it. A packet is the structured fields (goal, constraints, path, acceptance, evidence, next owner, escalate).

## Close

A merge, an issue close, or a pull request close sets the card to done and closed and clears its nudge. It does not stay live waiting for a retest tick. A failed retest after merge needs a new issue.

The owner's own comment that the work is resolved also closes the card. A comment from someone else does not.

Every PR comment, review comment and issue comment routes to the comment-watch seat and to the PR or issue author's seat, open, closed or merged. A comment on a merged or closed card is a beat (`comment after merge` / `comment after close`) and keeps the card on the board for 24 h from that comment. A PR or issue whose author is outside the fleet no longer drops its comments.

## Holds

A card is held when any of these is true:

- the owner posts a comment whose first line is `Held: <reason>`, with an optional `until:` line
- the issue or pull request has a label in `GITHUB_HOLD_LABEL` (default `on-hold`)
- a Jira item's status matches `JIRA_HOLD_STATUS` (default `On Hold`), compared without case

A held card stays visible, is not a stall, and gets no level 1, 2, or 3 nudge. If it stays held with no beat past `HELD_MAX_S` (default 72 hours), the owner gets one nudge.

A `Parked:` comment still parks the card and wins over a hold.

## No nudge

`NO_NUDGE_REPOS` is a comma list of `owner/name` or `owner/*`. Those cards stay on the board and get no stall line and no nudge, including the past-max hold nudge. Unset means no repo is excluded.

## Layout

The page groups cards that a seat is working on, then pinned cards, then one group per seat. Issues whose title names a pull request in the same repo fold under that pull request. A run of more than three loose issues collapses to one line.

## Ghost cards

Each feed pass asks GitHub which issue and pull request numbers are still open. A card that is not closed and not pinned, whose repo answered, and whose number is absent, is closed. A repo whose query fails is left alone.

## Seat activity (#275)

Every seat must log these lines, or it goes dark on the board even while it's busy. The box status reporter pushes these files to the server. The server never reads chats.

| What | Where (box, under the run dir) | Line |
|---|---|---|
| Turn start / end, background task start / end (desktop runs too), watcher start / stop | `fleet/activity.jsonl` | `{"t_ct","seat","kind":"turn"\|"subagent"\|"watcher","action":"start"\|"end","tag"?}` |
| Owner → seat message, seat → seat or room message (a pulse) | `fleet/prompts.jsonl` | `{"t_ct","from","to"}` only. Never the text, never a secret |
| Cloud agent launch / finish | `fleet/cloud-agents.jsonl` | `{"t_ct","by","action":"launch"\|"reply"\|"finished"\|"cancel","agent"}` |

Seats off the box (for example Arch1) POST the same shapes to `/activity` with their seat key (`kind: prompt|turn|subagent|watcher|cloud_agent`). A seat counts as working while it has an open turn or task, or one of its cloud agents is running. Pulses never become inbox lines or wakes (see [inbox.md](inbox.md), routing guardrails).

Activity details (#281): a prompt line keeps its sender as `actor` (off-box seats send `from` on `prompt received`). A cloud agent credits the seat that launched it; that seat stays working until 20 min (`LIVE_CLOUD_IDLE_S`) after the agent's last line or a GitHub event naming its `bc-…` id, and `finished` / `cancel` ends it. `live_act` in `paste-block.sh` and `builder-cloud-setup.sh` emits turns, prompts and cloud agents; `tools/live-act-hook.example.sh` wires turn start/end and prompts into an agent hook. Rate limits are the platform's job. Full spec: [`house/burst/ACTIVITY.md`](../../burst/ACTIVITY.md) and [`activity.schema.json`](../../burst/activity.schema.json).

Vocabulary: **cards** are the work items (one per PR or issue). **Beats** are real events on a card, and they reset its idle clock. **Pulses** are liveness signals only. **Packets** are tracked asks in an inbox, and **acks** close them. **Nudges** are packets the server creates after 60 min with no beat. **Wakes** are content-free webhook doorbells that follow packets. **Seat status** is the working or idle light.

## Page behaviour (lap2)

- The header "N of M bots active" counts the strip's seats with the same seat state the chips show (working > live > active > idle), so the two always agree. Server-side, a wake that lands, an inbox read or an ack also makes a seat active.
- Board grouping: each card sits under its seat (next owner, else owner). A card in review also shows as waiting under the review seat (`L.REVIEW_SEAT`; ours is critic), so the reviewer's group shows its queue, not only its done cards.
- Rewound or replaying, the Board shows the cards as of the timeline point (cards whose first beat is at or before it, beats up to it). Cards carry their last few beats only, so very old points are approximate.
- Packets fly for 2.6 s with a halo and a fading path, so each hop is visible seat to seat. The REPLAY badge shows once: on the pill during a replay pass, beside it only for the ambient replay loop.
- Lens labels are kept inside the canvas. The kit maps no avatars (it ships none); a fleet overlay maps the images it ships, the rest use the drawn badge.

## Seat credit

Each event's `credit` is set by the collector (`feed/live_collect.py` `credit_of`), never blank, first match wins:

1. a `Seat: <seat>` trailer in the commit message (a line on its own, e.g. `Seat: mill`);
2. the event's actor / sender login (`actor`, `author`, `sender`, `triggering_actor`, `merged_by`, `user`);
3. the PR's author (events with a PR number);
4. the commit author's login for that sha (checks, workflow runs, deploys);
5. that commit's `Seat:` trailer;
6. `github` (CI, unmapped `[bot]` logins, Railway / rails with no seat).

A login maps to a seat through the committed `feed/fleet-nodes.json` (shipped to `collector/` by `app/deploy.sh`). It wins over the `LIVE_NODE_MAP` service variable, which can only add logins the file doesn't name. An unmapped person credits `other`. `htafolla`, `Blaze0x1` and `Lead` credit **Blaze**, who has a node on the Lens and a group on the Board. Events from other sources (box, Jira, health, emitter) are credited by the server from their sender node: a roster seat, Blaze, else `github`.

## Avatars

Our pictures live in `house/live/site/public/avatars/` (copied over the kit page by `app/deploy.sh`) and are mapped in `site/public/site-config.js` (`L.setAvatars`):

| Node | File | Source |
|---|---|---|
| blinky, critic, forge, herald | `<seat>.png` | the repo's `docs-site/static/live/bots/` |
| arch1 | `arch1.png` | `docs-site/static/live/bots/minime0x.png` (image reused; the `minime0x[bot]` login runs workflows and credits `github`, not arch1) |
| Blaze | `blaze.png` | his X profile picture (@Blaze0x1) |

Every other seat (mill, magnet, nibbler, sound) shows the drawn letter badge; there is no 404. To add one: commit a square PNG as `site/public/avatars/<seat>.png`, add `<seat>: '<seat>'` to `L.setAvatars` in `site/public/site-config.js`, and deploy. The kit maps no avatars.

## What makes a seat active

A seat shows ACTIVE when, within the fleet window (15 min), any of these happened:

- a GitHub event by one of its logins (via the credit map above);
- an owned box file changed or an activity line (turn, task, watcher) was logged (see Seat activity above);
- a wake to its webhook landed (2xx);
- it read its inbox (`live-inbox <seat>`);
- it acked a line (`live-inbox <seat> --ack <id>`).

The wake / read / ack times are kept in server memory (`app/presence.mjs` `foldSeatTouch`), so after a restart they rebuild on each seat's next wake, read or ack.

**Known gap.** Work a seat does on its own computer (a desktop turn with no wake, read or ack) does not report yet, so the seat can look idle while busy. Lap 3 fix: `live-inbox` sends a heartbeat on every wake and every task start.

## Freshness

The light at the top uses two times from the feed `freshness` object. `github_latest_ct` is the newest GitHub event of any kind. `github_card_latest_ct` is the newest event that both moves a card and lands on an open card (`repo#number`, or a 7-character sha against that card's `head`). A comment, a check that is still running, an ordinary label, or CI on a merge commit (no pull request number, sha no open card owns) does not turn the light. `/healthz` `data_age` is seconds since `github_latest_ct`.

Until the first card write the light says "Cards still building".

## History and the queue

`GET /history` lists archive days. `GET /history?date=YYYY-MM-DD` returns that day's events. `GET /history/cards` returns the latest version of each card. Card versions are append-only (`key` + stage + state + the card's own update time). A row with no key is not stored. The open queue is a view of unacked inbox lines. Filtering it does not delete the inbox file. Lines older than the live window stay in the daily archive.
