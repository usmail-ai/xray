# Fleet lexicon (plain)

> 0xRay house example — not the general procedure. Your team’s rules live in `house/` after `grok-bot house init`.

Stamp products: `STAMPS.md`. This file = **words we use**, grouped so product ≠ workstream ≠ practice.

**One line:** beats clock the wave → cards on the board → seats in a suit on the mill → CoS steers from station → close with a receipt.

---

## 1. Products (the stack you ship)

Things with a stamp / npm / live URL. Dist talks about these.

| Term | Plain gloss |
|------|-------------|
| **⚡ 0xRay** | Power plant / OS for agents — factory layer |
| **🦾 suit** | Work kit an agent wears (hooks, mill plant, bounds) |
| **🏭 mill** | Build · test · deploy plant *inside* the suit |
| **↗ hangar** | Paid shop front beside the mill |
| **🧾 Clearing** | x402 USDC receipts on Base |
| **🪪 Groover** | Agent identity / DID |
| **〰 ZigZag** | Marketplace / discovery |
| **⚖ Dynamo** | Solar governance — PASS / REJECT |
| **📦 kit** | Setup pack (`@0xray/grok-bot`) |
| **pin** | Hangar shop (+ pay-to-list gate on the board) |
| **OWS** | Local wallet for hangar pay (USDC on Base) |
| **repertoire** | Optional **organ** — compact/memory heat on CLI/cloud suits. Not required for every seat. Heat ≠ fastened |

---

## 2. Workstream (how the fleet runs)

Ops nouns — clocks, tickets, roles, decks. Not products.

| Term | Plain gloss |
|------|-------------|
| **beat** | One real event on a card: pull request opened or pushed, review verdict, CI result, merge, merge-queue tick, owner message, or blocker. A watcher run whose start and end fall in the same second is not a beat |
| **wave** | Stretch of beats toward one outcome (ship, dist week, proof) |
| **board** | Where open work is visible (`WAVEBOARD`). Cards grouped by stage |
| **card** | One GitHub issue or pull request (`repo#number`): title, url, owner seat, stage (`open` > `review` > `fix` > `merge` > `retest` > `done`), state (`live`, `parked`, or `closed`) |
| **seat** | Named bot role (CoS, forge, critic, herald, magnet…) |
| **station** | CoS primary work deck — durable intent, live track, next beat (survives compact) |
| **receipt** | Proof a card closed (critic PASS, `npm view`, Dist URL). Chat LGTM ≠ receipt |
| **cloud** | Heavy repo surgeon (`bc-…`). Cuts metal; seats run the company |
| **dist** | public distribution **lane** (@0xRayAI) — a workstream, not a product SKU |
| **group / room** | Shared chat bus (ops / eng / dist). Not Station, not memory |
| **capital** | Blaze-only gate: spend, credentials, destructive |

---

## 3. Practices (verbs / bars)

How we act — not a product, not a ticket type.

| Term | Plain gloss |
|------|-------------|
| **plant** | Fasten a suit / hangar / shops **onto** a project (verb). Also “the plant” = mill floor (noun) |
| **foundry / gate** | Ship check before tag / publish (`foundry gate`) |
| **friend-test** | Plain-English bar before Dist or public docs ship |
| **dogfood** | Cold-prove on ourselves before we claim it |
| **organ** | Optional module inside the suit/plant (mill, inspect, repertoire…). Not the whole 0xRay OS. Fasten to use; don’t call it live from heat alone |
| **wear** | Run with a suit fastened (verb). “Wear check” = `foundry inspect`. Costume ≠ wear |

---

## Don’t confuse

| Pair | Diff |
|------|------|
| suit ≠ 0xRay | kit ≠ whole power plant |
| mill ≠ plant (verb) | mill = product organ; plant = fasten act (or colloquial floor) |
| dist ≠ product | lane/workstream for announcing products |
| beat ≠ card | a real event on a card ≠ the card |
| station ≠ board | CoS deck ≠ full WAVEBOARD |
| card ≠ receipt | assign ≠ proof |
| group ≠ Station | chat bus ≠ durable deck |
| pin (shop) ≠ pin (verb on-chain) | shop name vs Groover pin step — say which |
| organ ≠ product SKU | repertoire is an organ of 0xRay; Clearing is a product |
| heat ≠ fastened | Station “Repertoire: on” ≠ live `node_modules` organ |
| wear ≠ plant (verb) | wear = run suited; plant = fasten the suit/organs onto a project |
| wear ≠ costume | files on disk without live hooks/inspect = theater |
| chime ≠ reflexive ack | needed interrupt / soft override — not Cadence HARD refuse-all |
| packet ≠ ack | seven fields on a card ≠ a reflexive chime |
| EXECUTE ≠ draft | armed ship ≠ proposed copy |
| EXECUTE ≠ packet | armed Dist/action ≠ the handoff object |

Locked 2026-09-14 with Blaze — categorized.

## Workstream adds (2026-09-14)
| Term | Bucket | Plain |
|------|--------|-------|
| **op proc** | Workstream | Operating procedures — how the fleet runs (docs in `grok-bot/ops/`) |
| **Lane H** | Practices | Human/public plain English + friend-test |
| **Lane B** | Practices | Bot-internal compressed synaptical (token-save) |
| **synaptical** | Practices | Meaningful Compression house style — dense Done/Verify/Next beats |

## Lexicon add (2026-09-15)
| Term | Bucket | Plain |
|------|--------|-------|
| **organ** | Practices | Optional module in the suit/plant |
| **repertoire** | Products (organ) | Optional compact/memory organ — fasten to claim |
| **wear** | Practices | Run with a fastened suit; inspect = wear check |

## Lexicon add (2026-10-05 — chime)
| Term | Bucket | Plain |
|------|--------|-------|
| **chime** | Practices | Needed interrupt that **supersedes** a gentle redirect (soft override). Use when the soft redirect isn't enough. Not a reflexive ack / ping — those stay refused under Cadence HARD. |

## Lexicon add (2026-10-05 — inter-bot)
| Term | Bucket | Plain |
|------|--------|-------|
| **packet** | Workstream | A card's seven fields: goal, constraints, path, acceptance, evidence, next owner, escalate. From a `## Packet` block or one line. Missing acceptance or next owner makes the card amber (`no packet`). Evidence fills from the latest beat. |
| **EXECUTE** | Practices | Armed Dist/action order with exact copy + gates; herald/seat ships only on EXECUTE (not draft/FYI). Distinct from a packet (the packet may *carry* an EXECUTE). |
| **handoff** | Workstream | The channel or file that *carries* a packet (`ops/handoffs/…` or a seat message). The packet is the content; the handoff is the pipe. |

## Lexicon add (2026-10-05 — watchers)
| Term | Bucket | Plain |
|------|--------|-------|
| **watcher** | Workstream | Signal→ticket queue: watches git/X activity and opens or bumps a board card. Does not ship or merge. |
| **workstream** | Workstream | Card/seat lane on the board (how work runs). ≠ product SKU. ≠ planes. |

Don't confuse: watcher ≠ Dist; workstream ≠ product; workstream ≠ planes.

## Lexicon add (2026-10-09 — waveboard)
| Term | Bucket | Plain |
|------|--------|-------|
| **card** | Workstream | One GitHub issue or pull request (`repo#number`). Title, url, owner seat, stage (`open` > `review` > `fix` > `merge` > `retest` > `done`), state (`live`, `parked`, or `closed`). |
| **packet** | Workstream | That card's seven fields. Cap 200 characters. Allowlisted links. Amber `no packet` badge when acceptance or next owner is missing. |
| **beat** | Workstream | One real event: opened or pushed, review verdict, CI, merge, merge-queue tick, owner message, or blocker. A watcher whose start and end fall in the same second is never a beat. |
