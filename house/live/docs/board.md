# Board

A card is one GitHub issue or pull request. A beat is a real event on it. A packet is the structured fields (goal, constraints, path, acceptance, evidence, next owner, escalate).

## Close

A merge, an issue close, or a pull request close sets the card to done and closed and clears its nudge. It does not stay live waiting for a retest tick. A failed retest after merge needs a new issue.

The owner's own comment that the work is resolved also closes the card. A comment from someone else does not.

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
