# Cloud agents — when and how

> 0xRay house example — not the general procedure. Your team’s rules live in `house/` after `grok-bot house init`.

## Default: suited seats first
Named agents already have suits, memory, live docs, and machine access. Prefer them for routing, review, merge, deploy, live checks, thin edits, and anything that needs fleet context.

Do not spin a cloud to redo what a suited seat can do. That wastes credits.

## When to use a cloud
Only for **heavy multi-file code work in a git repo** that needs an isolated coding machine.

## When not to
Docs, checklists, board notes, restating CI, reviewing an open PR, deploy/publish, Light/Normal local work, a second cloud on the same track.

## Churn
Churn is waste: a second cloud on the same track, a twin reviewer, redoing work a seat already has, or an idle loop on parked work. Stop and card it.

## Continuity
1. Same problem / PR / ship track → **resume** that cloud. Keep its branch.
2. Genuinely new outcome → launch new.
3. One cloud per ship track unless work is truly independent.
4. Before launch: list recent clouds; resume if lineage exists.
5. **Split threshold.** Cloud work goes as a follow-up to the existing cloud agent session that holds the context; log its id on the Card. Launch a new agent only when (a) no session has context for that repo, or (b) **all three** hold: the context-holding agent already has 2+ jobs queued, the new job touches different files, and the job can be briefed from the docs alone. Otherwise, queue it as a follow-up on the existing session.

## Handoff (HARD — 2026-09-14)
**Implementer (forge) owns every eng cloud.** Launch · resume · reply · dump · continuity.

**Coordinator (blinky) does not call CloudAgent** for eng work. Card forge with: goal · repo · resume `bc-…` if any · acceptance · constraints. Take the shop-style receipt when forge returns.

CoS launching clouds “to go faster” is a **fatal seat defect** (same class as CoS deploy). Encode in `SEATS.md` + CoS wave-loop skill — **not** a suit `PreToolUse` deny (chat has no hook path; fake PPE is theater).

**Into cloud (forge):** goal · repo · branch/PR · constraints · acceptance tests · resume id if same track.
**Out:** PR URL · commit · what to verify — then seats take over.

Clouds cut metal. Seats run the company.

## Repo access (HARD — 2026-09-15)
Private SSOT repos must be readable by Cursor clouds **before** launch. See [CLOUD-REPO-ACCESS.md](../../house/CLOUD-REPO-ACCESS.md).

Fatal: guessing Rippel numbers because `git clone` 404’d. Use access grant or staged tarball.
