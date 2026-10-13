# Live board playbook

## Words
**Card** = a GitHub issue or PR. **Beat** = a real event on it. **Packet** = the structured fields on a card (done-when, stops-at, next owner, acceptance, evidence). **Nudge** = a server-made poke at a seat about a stalled card.

## Cards, beats, stalls
A card is a GitHub issue / PR. A beat is a real event on it (opened, pushed, Reviewer verdict, CI result, merge,
merge-queue.md tick, Lead message, blocker). A **live** card with no beat for **60 min** turns red (stall).

## Nudges
1. Card red (60 min, no beat) -> **level 1** nudge to the packet's `next owner`, or the card owner if none.
2. Still no beat **30 min** after the L1 -> **level 2** nudge to **Coord**.
3. One open nudge per card per level; a new beat on the card closes its nudges (a later stall starts a new pair).
   Level 3 repeats to that same owner every `NUDGE_L3_S` (default 2h) until a beat lands.
   Repos in `NO_NUDGE_REPOS` stay on the board and get no nudge and no stall line. Unset means every repo can be nudged.
4. Every nudge shows on the card as a distinct ⏰ nudge beat (pink), and the card gets a `⏰ nudge L<n>` badge.
5. Builder's nudges also get one GitHub comment on the card from ops-app, at most once per card per level
   (`feed/nudges.py comment`, run by the pusher).
6. Delivery: the Operator routine runs `python3 -B feed/nudges.py pull`, which prints new open nudges as JSON
   (`card, seat, level, url, title, age_min`) and advances its cursor; it sends each as a direct bot message.

## What to do with a nudge
- Seat: post a beat (push, verdict, comment with progress) or mark the card parked/blocked with a label.
- Coord (L2): unblock, reassign the packet's next owner, or park the card.

## Merged cards
A merge, an issue close, or a PR close ends the card: stage **done**, state **closed**, no nudge. A failed retest
after merge needs a new issue. The card also moves to **done** when:
- a later **merged** PR says it fixes / closes / resolves / supersedes / replaces `#N`;
- the card owner's own comment says it's resolved ("resolved", "superseded", "fixed by #N", "nothing … waiting",
  "no action needed", "can be closed"). The collector keeps only a true/false flag and the `#N` numbers, never text.

## Holds
A card is **held** (visible, not stalled, no level 1/2/3) when the owner posts a comment whose first line is
`Held: <reason>` with an optional `until:`, when the issue carries `GITHUB_HOLD_LABEL` (default `on-hold`), or when
a Jira item's status equals `JIRA_HOLD_STATUS` (default `On Hold`). A `Parked:` comment still parks and wins over a hold.
If a hold stays quiet past `HELD_MAX_S` (default 72h), the owner gets one nudge, unless the repo is in `NO_NUDGE_REPOS`.
