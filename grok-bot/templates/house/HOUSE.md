# House

## Owner
(example) Ada — the human who decides money, credentials, deletes, and taste.

## Seats
(example) Coordinator. Never deploys, publishes, or spends. Implementer and publisher. Reviewer. Never merges. Public-posts specialist. Never invents the words. Listings. Audio.

## Public voice
(example) @example. Root posts at least 4 hours apart. Reply only when you mean to.

## Allowed
(example) git push to org/app. Merge to main on org/app is the deploy. No other repo.

## Ask first
(example) Package publish, production deploy, payments, secrets, and deletes.

## Board
(example) Open cards: house/WAVEBOARD.md. What needs the owner now: house/ATTENTION_STATE.md.

## Cadence
Optional. Delete this section if your house has no code loop. Defaults from [opproc-cadence.md](https://github.com/0xRayAI/xray/blob/main/docs/opproc-cadence.md); rename the roles to your seats.
- Bots never burn or ack. Build work runs on cloud agents and the coder. Seats route, review and retest, and post results on the PR or issue.
- Review plate: one pass, one fix, one re-check, then park for the owner. Only P0/P1 (S1/S2 with a repro) can FAIL. Nits are notes or cards.
- The coder merges to the integration branch only when the reviewer's PASS SHA equals the PR head and CI is green. Main and production need the owner.
- Each seat uses its own GitHub App. The reviewer owns the PR watcher (first review, single re-check after a FAIL, re-look after a PASS or HOLD, deduped by PR + SHA) and gates new issues on issue opened, with a 15-minute sweep as fallback. The lab tester owns the merge watcher: queue line in `house/watchers/merge-queue.md`, lean retest, PASS closes the issue with the merge SHA, FAIL keeps it open with one line to the env operator. The coordinator handles exceptions only: parked PRs, asks only the owner can answer, fleet mechanics, and the stall sweep.
- Stall sweep, hourly, 24/7 (defaults): no verdict after 30m; unticked queue line or PASS unmerged after 60m; open P0/P1 with no PR after 2h; parked PR to the owner. One nudge per item per day. A stuck item that belongs to an outside builder (no seat to message) is flagged for the owner instead. Lesson: a business-hours-only sweep stranded retests overnight.
- Issue-sweep cursor: `house/watchers/issue-sweep-last.txt`, one UTC ISO-8601 time of the last sweep, rewritten after each sweep.
- Live mesh (requires 0xRayAI/xray#248): `fleet/activity.jsonl` start/end lines `{t_ct, seat, kind, action, tag}` for every subagent or executor run (`subagent`), turn (`turn`) and watcher run (`watcher`), shown as working until the matching end, 60-minute cap. Box file lines must carry `seat` (seat id, or a display name in the seats config `aliases`). On `POST /activity`, `seat` is optional and must match the app token, or the post is refused; use seat ids there. `fleet/prompts.jsonl` pulses `{t_ct, seat, kind: "prompt", action: "sent", to}` (never text) keep `seat` working for 10 minutes. `fleet.missing_activity` on the feed lists seats that pulsed in the last 60 minutes with no activity line. Cloud agents go in `fleet/cloud-agents.jsonl`: `{t_ct, seat, kind: "cloud_agent", action: "launch|reply|finished|cancel", agent, tag}`.
- Deep burn: one cloud agent per repo area with fixed file ownership, at most 4 at once, in waves.

## Roster
Optional. Role, seat name, and agent id: [ROLE-MAP.md](ROLE-MAP.md). Leave it blank until you have ids.

Ask first and Allow are enforced only in [AUTO-REVIEW.md](AUTO-REVIEW.md).

## Scope
Optional. A line that is exactly `wallet off` skips Open Wallet, Clearing, and hangar pay steps in `grok-bot doctor`. Leave the line out to keep those steps.

## Constitution
This page is not the constitution. Grok Bot has no pre-tool hooks. The constitution is the suit's `codex.json`. Seats that wear a suit read their slice every turn:
- Implementer: all terms. 11, 29, 69, and 70 are hard lines.
- Reviewer: judge a Strict review against the constitution and cite term numbers.
- Coordinator: 52-59 and 61.
- Tester: 8, 48, 61, 62, 63, 65, and 66.
- Non-code seats: no terms.

Term 70: before an edit, be on the latest main and run the current package. Compare set-aside work to main before you throw it away. Seat rules, spend, and the board stay here.
