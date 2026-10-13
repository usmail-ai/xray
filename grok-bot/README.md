# @0xray/grok-bot


## Start here

**Read first:** [`OP-PROC.md`](OP-PROC.md) — the one-page operating procedure.

Board: `house/WAVEBOARD.md` and `house/ATTENTION_STATE.md` (your project house, not in this package). If `house/` is missing, run `npx @0xray/grok-bot house init` (skill [`setup-house`](skills/setup-house/SKILL.md)). It copies [`templates/house/`](templates/house/), including `watchers/` and `fleet/`, and refuses to overwrite. `house init --migrate` moves an old `ops/WAVEBOARD.md` into `house/WAVEBOARD.md`, starts missing files, and appends the template `## Cadence` block when `HOUSE.md` lacks it. It does not overwrite a ledger.

| House file | What |
|---|---|
| `house/HOUSE.md` `## Cadence` | Optional. Delete it when the house has no code loop. Defaults: [opproc-cadence.md](https://github.com/0xRayAI/xray/blob/main/docs/opproc-cadence.md) |
| `house/watchers/merge-queue.md` | Lab tester's retest ledger |
| `house/watchers/review-sent.log` | Reviewer dedupe log (PR + SHA) |
| `house/watchers/stall-sweep.log` | One line per stall nudge |
| `house/watchers/issue-sweep-last.txt` | Issue-sweep cursor (one UTC time) |
| `house/watchers/waveboard-static.md` | Hand-kept board sections, merged by heading |
| `house/fleet/activity.jsonl` | Live-mesh activity (`BURST_ACTIVITY`) |
| `house/fleet/prompts.jsonl` | Prompt pulses (`BURST_PROMPTS`) |
Complete setup path for **Grok Bot agents** on the 0xRay mill.

Agents: read `llms.txt` → `AGENTS.md` → run skills in `SKILLS.md` (**one suit per key agent**).  
Humans: same files.

## Install
```bash
npm i @0xray/grok-bot
npx @0xray/grok-bot
```

## Seat doctor (prove plant)
From an agent project root:

```bash
npx @0xray/grok-bot doctor
npx @0xray/grok-bot ready          # same command
npx @0xray/grok-bot doctor --json
```

**Plain:** this checks that mill + inspect are fastened on *this* seat, says whether Repertoire and Open Wallet (`~/.ows`) are present, then prints what to do next for hangar shops and Clearing (402 / USDC on Base). A HOUSE.md line that is exactly `wallet off` skips those wallet steps. It does not mill-plant Clearing into 0xRay. Product MCP name is `clearing`, never `xray-clearing`.

House lookup: `GROK_BOT_HOUSE` (the house directory or its `HOUSE.md`) wins. If that variable is unset, doctor walks up from the working directory for `house/HOUSE.md`. A set path that is missing warns and does not walk. No house file warns. Unfilled example lines fail. When `## Cadence` is present, doctor also warns (and does not fail) if `review-sent.log` or `stall-sweep.log` is missing or older than 2 hours, if the activity log's last line is not JSON with `t_ct`, `kind`, `action`, and `seat`, or if the suit `.xray/codex.json` term count or `lastUpdated` differs from `node_modules/0xray`. When `watchers/` exists and Cadence is missing, doctor hints `grok-bot house init --migrate`.

## Path (per agent)
1. **Suit** — mill + inspect (`fasten-suit-per-agent`)  
2. **Identity** — Groover register → mint → pin (`groover-factory-parity`) when needed  
3. **Pay** — OWS wallet + Base USDC (`setup-ows-pay`)  
4. **Hangar** — plant shops (`plant-hangar-shops`)  

## Plant pins (monitor / adjust)
- `0xray` (current npm) · mill nested in the tarball (`npx @0xray/foundry`)
- Live URLs in `llms.txt`  

This package orchestrates. It does not vendor the whole OS.

## Fleet ops
Read `house/` first (this team's board and rules). If `house/` is missing, run `grok-bot house init` to copy `templates/house/`. Longer notes under `ops/` stay in the git repo and are not in the npm package. Cadence defaults live in [opproc-cadence.md](https://github.com/0xRayAI/xray/blob/main/docs/opproc-cadence.md).
