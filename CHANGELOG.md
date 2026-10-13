# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Features
- **Goggles.** Proposed plates for goggles, suit, kits, host pack, and glossary. Goggles views one plane. Recall opens a plate when speech names that plate. Plates only. Not a new skill.
- **Plates.** Pipeline schematics live in `docs-site/docs/plates/` (routing, governance, boot, orchestration, processor, reporting, memory-recall). Station keeps one pointer line. Pre-compact and the `MEMORY_ROUTING` inject carry that one schematic. A lesson is an episode. A plate is the machine. Not a new skill.
- **Vendored Repertoire 0.2.8.** `vendor/@0xray/repertoire` is that package. Lesson lines and retained ids stay at 20. Speech that names nothing mints a learned signal, and only those mints evict past 24. Not a new skill.
- **Feat rebase.** When the mandated work turns into mantra, or the job has split across planes that no longer share one present, stop and answer the original message again from this seat. On `LEAD-CADENCE.md`, the orchestrator skill, and the ship-ready mill gate. Project dest grows the name `feat-rebase` from the stack overlay. Not a new skill.

### Fixed
- **Lesson caps and speech mint.** `LESSON_LINE_CAP` is 20. `RETAINED_LESSON_ID_CAP` is 20 in insertion order. Speech that names no stored signal mints one `proposed` signal tagged `learned`. `LEARNED_SIGNAL_CAP` is 24 and evicts only those mints. Factory signals stay. Not a new skill.
- **External grade writes the line.** `governExternalProposals` grades the signals a proposal already named, the same way the local cycle does. Needs-revision and a governance error still do not write. The vendored organ puts a missing lesson ledger back when dest still has its lines, so an aged task id does not step the average again. Not a new skill.
- **A governed proposal teaches.** A route lookup does not write a lesson. When a vote finishes, the cycle grades the signals that proposal's sessions already named. A session that names a stored signal is graded even when that name appears once. Landed approaches and no wrong turn clear the solid band. A wrong turn stays below the cutoff. Earlier rejects of other codify proposals do not pull that grade down. Approve steps those signals up by a tenth. Reject steps them down by a tenth. Needs-revision, an abstain, a governance error, and a proposal whose sessions named nothing do not write. Proposal ids stay on the signal and the sessions not yet graded, so a later cycle does not teach those sessions again. A new session is a new id. Those ids remain after the history window of 50 fills, including with empty cycles. A proposal that carries an empty name list does not fall through to matching its text. A grade that passes appends one line — the task, the decision, and the approaches, solutions, or wrong turn from the sessions that named the law — on that signal and beside the average. The same task does not append again. The route for a law above 0.55 includes the law text and those lines, and Station's lessons section is refreshed from dest. Not a new skill.
- **Dynamo client on a required external call.** `govern_proposals` with external governance required starts `InferenceGovernanceIntegration` even when `inference_governance.enabled` is false. Boot still skips that client while the flag is off, and the inference cycle still uses the local matrix unless the flag is on or `XRAY_FORCE_MCP_GOVERNANCE=true`. An unreadable MCP payload is stored as the error text, not an abstain at 0.5. The MCP wait matches the governance budget (90s). Not a new skill.
- **Subsystem pass.** A session file with no `metrics.commits` is not a session, and a captured pattern with no `evidence` array is empty evidence, so the inference cycle no longer dies before it writes state. `scoreAndRoute` loads the memory organ on the first call with a synchronous require, before any dynamic import of that module. A cached null provider does not block that load, and a late null load does not replace an organ already in hand. Not a new skill.
- **Local governance pass.** When `inference_governance.enabled` is false, the inference cycle scores each proposal with the local decision matrix. That miss is not stored as a reject at confidence 0, and Dynamo is not called. The governance MCP path stays in place when the flag is on. Not a new skill.
- **Learned conviction.** A floor observation count does not change a route. Feedback moves conviction by a tenth, and a failure can leave 0.55. Retrieval hits a local clause of four definition content words. Two definition words are not a hit. The same words scattered through a long diary are not a hit. x402 prose alone is not a hit. `learned-conviction.json` beside dest restores the average when a wake flattens it to 0.55 and does not store the observation count. The vendored organ dist matches that behavior. Not a new skill.
- **Seeded conviction.** Load writes `learned-conviction.json` for dest averages already above 0.55, including historical averages with no evidence count. Evidence is the existing positive count, otherwise 1. Floor averages, including float dust at 0.55, stay out of the file. A later load restores those averages after a flatten. The vendored organ dist matches that behavior. Not a new skill.
- **Lock matches the cut.** `package-lock.json` root version and `packages[""].version` follow `package.json` on stamp. The 4.0.22 release left the lock at 4.0.21. Not a new skill.
- **Bumper writes the lock.** `reconcile --apply` updates `package.json` and the lock version fields together. `reconcile --check` (the docs mill in CI) fails when they differ. Not a new skill.
- **Cursor gate root.** The suit mill already has synthesis off. Cursor tools follow that mill when it is in the heat set, so a sibling repo's leftover synthesis checkpoint does not deny the host. Not a new skill.
- **Engine cadence.** Change the engine, ship it local (build and install the tree; a live cut stays live), test, review the diff, monitor dest and Station, then ship the PR. Missing moral fusion is not an isotopic reject; vote confidence is a clamped weighted mean; thinDispatch strategy follows the adjusted level; an empty inference cycle saves state and later getInstance options apply. On `LEAD-CADENCE.md`, the orchestrator skill, and the ship-ready mill gate. Not a new skill.
- **Operating planes.** Code, OP-PROC, model, suit, mill, host, and test/ship. Test then ship is the hero; ship without that proof is the catastrophe. Project long-term memory refreshes a changed stack definition and keeps observation stats. Heat writes the matched names onto Station. Name `operating-planes` on the stack overlay. Not a new skill.
- **Wake cascade.** Chat is not the brain. A cascade that must survive compaction is the repertoire name `wake-cascade` on the stack overlay, with the same text in NOTES for the second Read. A reflection is not this capture. Not a new skill.
- **Hero invariants.** Capture priority is an invariant you would otherwise re-read the source to relearn. Names: `heat-is-not-conviction`, `inference-cycle-invariant`, `governance-vote-invariant`, `thin-dispatch-invariant`. Heat touches last_seen and does not append a confidence sample. Heat touches last_seen when the diary contains that signal's name or a local clause of four definition content words; two definition words are not a hit; the same words scattered through a long diary are not a hit; a weak session score is not lifted to 0.55 and a sample below 0.55 is not recorded. Constructing the organ does not append workspace samples. Repertoire `mergeStackOverlay` refreshes a changed stack definition and keeps observation stats. Not a new skill.
- **Stamper strip set.** Once a version is live, the stamper strips every present-tense patch pin from shipped guides and shipped OP-PROC, or reconcile advances the next cut. The stamper does not edit Station, NOTES, dest, or node_modules. It does not publish. The release docs check uses that same strip set, including `grok-bot/skills/ship-ready-mill-gate/SKILL.md`. Proposal text stays a keyword map over session problem strings, and `generateProposals` also emits recurring-pattern titles. Not a new skill.
- **Heat + capture leftover** — module-missing resume is `Repertoire: module unresolved`, not “memory_routing stays off”. Session capture writes `matched_primitives` from existing dest laws in git. Grow receipt is post-prune dest count + heated length. Leftover `provider: null` still migrates old tarballs; explicit opt-out stays `enabled: false` + `provider: repertoire`. Does not republish.

### 📚 Documentation
- **Cold brief.** A new critic or any new subagent that does not already have this thread gets the latest commit SHA on the branch under review (fetch it) and the Station card. If the branch moves, send the new SHA before they verdict. On `LEAD-CADENCE.md` + ship-ready mill gate + orchestrator cadence. Not a new skill.
- **Jargon is not the job.** Review and cadence ask whether the change works. Do not spend the loop reciting dest names, mill liturgy, or host mantras. On `LEAD-CADENCE.md` + ship-ready mill gate + orchestrator cadence. Not a new Codex term.
- **Leftover after #102** — `station-vs-repertoire.md` opt-out ASCII no longer teaches package-absence (`no @0xray/repertoire` / `memory_routing stays off`). Explicit opt-out is `enabled: false` + `provider: repertoire`. Dead integrate note is history. Compact seed drops leftover “optional MCP”. `validate-release-docs` now gates that guide. Does not republish.
- **Leftover after #101** — stamp `package-lock.json` and `.xray/features.json` to the live package version. Rewire `updateFeaturesJsonVersion` so both features files stamp together. Guides that still called Repertoire optional now say preferred + explicit opt-out; Station is the compact ticket.

### 🧹 Cleanup
- Drop unused `src/mcps/shared/security-scanner.ts` and its unused validator twin. Live scanner stays `src/security/`.
- Archive root `integrations/` costume SKILL dump → `docs/archive/integrations-costume/`. Live wear is `src/integrations`.
- Archive root `commands/` stale copy → `docs/archive/commands-copy/`. Live wear is `src/opencode/commands`.

## [4.0.43] - 2026-10-12

### 🔄 Changes

### 🐛 Bug Fixes
- fix: stop the vendored complete-todo command from minting PASS (39c88c8fa)
- fix: bind Confer receipts to a synthesis cycle (5134c5d05)
- fix: treat ambiguous Confer text as UNREVIEWED (06acc24f1)
- fix: complete Confer only on a real approve (8776562d7)
- fix: parse only the first Confer DECISION token (c06747d95)
- fix: keep Confer off unless it is explicitly enabled (8cd356c24)

### 🧪 Tests
- test: lock no-LLM confer votes out of a PASS merge (e30628fef)

---

## [4.0.41] - 2026-10-07

### 🔄 Changes

- Wake cascade. Station and the notes page stay on the station module. Heat writes `Cascade: record-map · notes N current` on the card. A memory-recall look returns that plane, the matched law names, and the current lines from the session-note index beside the laws.
- Session notes sit in `.xray/state/repertoire/session-notes.json` beside the laws. A replaced note stays history. The short index returns the current line. A stale page does not revive a replaced line.
- `Sleeve: on` means the previous ticket came back, the worn plate matched the package, the previous ticket matched the working record, and inspect passed. Session start and compact run that check. The card keeps the named plane. Judgement is continue, retry N, stop, or start. The same miss keeps its retry. A different ticket stops. Payments is on only when the ticket is a payment.
- A fresh wear fastens mill and inspect. The durable copy is staged beside the live wear. Hooks and MCP launchers are not pinned at a temporary checkout.
- Goggles. A checkout named `0xray` records `scripts/mjs/run-goggles-mcp.mjs`. A consumer records `node_modules/0xray`. An upgrade that removes a self-install no longer leaves the handshake on a missing file.
- A machine-level Grok plugin does not fail the mill and is not stored in the mill receipt. A change to the worn skills drops that pass until the next session start or compact. When the plate or the mill is the miss, that miss is the plan until the line is on again. A copied role skill whose text was edited still stops wear.
- A SessionStart event that carries the opening prompt stays a session start, so the check runs before that first card is read.
- Live page. The mesh plays in the browser, with rewind and seat images. The watch survives a dropped connection. Fleet pushes go out as packets.
- The Playwright release-gate smoke stays on the Playwright battery. The unit runner does not load that spec.

---

## [4.0.40] - 2026-10-05

### 🔄 Changes

### 🔎 Other Changes
- house/live-mesh: full loop — feed watch, mesh render, direction, deploy, `/health`, X ledger both ways (#214, #215).
- house: define Ping-pong in OP-PROC lexicon (#213).
- house: OP-PROC cadence cleanup — muse-house lock, fleet forge0x1-merge, quiet/budget, sudo-copy seats (#216).
- house: OP-PROC eng PR coach stack + 2026-10-04 eng state lock (#210, #212).
- docs/dist: Dist packet note for 0xray 4.0.39 / repertoire 0.2.9 (#211).

---

## [4.0.39] - 2026-10-03

### 🔄 Changes

### 🔎 Other Changes
- Keep the seven stack laws already worn in the suit. (427b0538e)
- Vendor repertoire 0.2.9. (b45ed22f9)
- Merge pull request #209 from 0xRayAI/cursor/evidence-before-grade-d703 (92a4d6dd9)
- house: add Evidence before grade rules under §3 (0fa229981)

---

## [4.0.38] - 2026-10-03

### 🔄 Changes

### 🔎 Other Changes
- Merge pull request #171 from 0xRayAI/fix/solar-verdict-decides (7b6ac081a)
- Merge remote-tracking branch 'origin/main' into fix/solar-verdict-decides (a342e0b0d)
- fix(types): declare work-freshness so the Codex 70 import typechecks (16b2db194)
- feat(codex): term 70 requires current source and worn npm (dacecc916)
- fix(governance): honor Dynamo's recommendation (968cd6a14)

---

## [4.0.37] - 2026-10-02

### 🔄 Changes

### 🐛 Bug Fixes
- fix: a naked checkout wakes with repertoire on (7b75bedbc)

### ⚡ Performance
- perf: cut repeated work on the processor data path (baadb4d35)

### 📚 Documentation
- docs: move fleet house SSOT out of the kit (7dcf08e94)

---

## [4.0.36] - 2026-10-02

### 🔄 Changes

### 🔎 Other Changes
- Merge pull request #178 from 0xRayAI/fix/goggles-robust (21c8f30d9)
- fix(goggles): hold the stop through search, read, and a dist wipe (abe603265)

---

## [4.0.35] - 2026-10-02

### 🔄 Changes

### 🐛 Bug Fixes
- fix: wear rewrites a checkout dist/cli launch to node_modules/0xray (aa44ae462)

### 📚 Documentation
- docs: point the trim restore at 601cdafc0 (be2a4e91d)
- docs: say what each chat can actually do (0c70532a6)

### 🔧 Maintenance
- chore: drop unused modules and wait for the registry before tagging (3a29409a8)

---

## [4.0.34] - 2026-10-01

### 🔄 Changes

### 🐛 Bug Fixes
- fix: hold the lens on the worn build when the source is not packed (6f561ef6f)

---

## [4.0.33] - 2026-10-01

### 🔄 Changes

- Version bump

---

## [4.0.32] - 2026-10-01

Next patch after npm `4.0.31`. Not published from this commit.

Organ bolster for goggles-pipeline after #167. `0xray look` (and `goggles`) opens one plane through the organ. Digest and triage return the card pane. Status and health show the organ worn and Kind 0 quiet/match. Bot Plugin MCP `goggles` exposes lean tools `look` and `status_lens` over stdio on the same organ. Kind 0 name-checks the six outers and stays quiet on match; reading stays a dichotomy; digest/triage stay the card. Calling and confer stay off. Companion `@0xray/grok-bot` is unchanged at 0.1.8.

---

## [4.0.31] - 2026-10-01

Next patch after npm `4.0.30`. Not published from this commit.

Goggles looks at one pipeline. Kind 0 name-checks the six outer names and stays quiet when the worn list matches the map. Digest and triage return one card. A leave is denied. Session boot hands the card through `handCard` and normalizes the workspace root, including a trailing slash. The mill path is `scripts/foundry`. Run `node dist/integrations/hooks/goggles-pipeline.mjs`. This cut also carries the plate docs and the live project-file signal count that landed on main after 4.0.30. Calling and confer stay off. Companion `@0xray/grok-bot` is unchanged at 0.1.8.

---

## [4.0.30] - 2026-09-28

Next patch after npm `4.0.29`. Released 2026-09-28.

Fixes the 4.0.29 regression where `npx 0xray wear` and `npx 0xray setup` exited 1 with `cursor-wear: not a git work tree` outside a git checkout (#147). Outside a git checkout, both commands again write the 4.0.28 consumer project setup and skip only Cursor hooks, with one stderr line: `cursor-wear: hooks skipped because this folder is not a git checkout`. Inside a git checkout, `wear` and `setup` restore the 4.0.28 project setup that 4.0.29 had dropped: managed `AGENTS.md`, `.gitignore` entries, `.xray` config, the `node_modules/@0xray/repertoire` link, the mill/inspect plant, chat bridges, the `.opencode/skills` sync, and the `dist` / `scripts` links. `wear` then adds the Cursor hooks, including the six hook scripts, and the `.xray/state/cursor-hook-wear/` snapshot. Postinstall is unchanged: it links the vendored repertoire and prints `npx 0xray wear`. Companion package `@0xray/grok-bot` is unchanged at 0.1.8.

---

## [4.0.29] - 2026-09-28

Next patch after npm `4.0.28`. Released 2026-09-28.

`npm install` now only creates the relative `node_modules/@0xray/repertoire` link to the vendored repertoire and prints one line: `npx 0xray wear`. It no longer writes the suit. Run `npx 0xray wear` after install. Wear writes only the consumer project's `.cursor/hooks.json`, pointing at the installed package's dist hooks, and adds them beside existing user entries. It snapshots the pre-wear file under `.xray/state/cursor-hook-wear/`, and `npx 0xray unwear` restores it. `npx 0xray setup` writes `.mcp.json` and the OpenCode, Grok, Hermes, and OpenClaw bridges. Companion package `@0xray/grok-bot` is unchanged at 0.1.8.

---

## [4.0.28] - 2026-09-26

Next patch after npm `4.0.27`. Released 2026-09-27.

MCP servers start through `scripts/node/mcp-launch.cjs` and only see PATH, HOME, and XRAY_ROOT, plus the names on their keep list. Tokens such as NPM_TOKEN are no longer inherited. User env values stay out of argv. Postinstall keeps user edits to AGENTS.md, .mcp.json, and opencode.json. `house init` no longer copies EXAMPLE.md, and doctor FAILs while `house/EXAMPLE.md` exists. Inspect has a new machinePlugin check. The Cursor hook defaults XRAY_ROOT to the suit directory. Companion package `@0xray/grok-bot@0.1.7`.

---

## [4.0.27] - 2026-09-25

Next patch after npm `4.0.26`. Released 2026-09-26.

A counted host compact needs a non-empty generation id and a numeric `context_usage_percent`. That hook line and per-session receipt are written on the suit mill and mirrored onto nested consumer wear roots. Memory scoring rules live in `docs/memory-scoring.md`. The orchestrator links that file and does not copy the rules. Companion package `@0xray/grok-bot@0.1.6`: one general operating page, a `house/` overlay that is not in that npm pack, `templates/house/` in the pack, `grok-bot house init` (copy, refuse to overwrite), and doctor lookup via `GROK_BOT_HOUSE` or a walk-up for `house/HOUSE.md`.

### 🔄 Changes

### 🐛 Bug Fixes
- fix: a host compact proof requires a non-empty generation id and a numeric context_usage_percent (d869cbf79)
- fix: mirror preCompact proof to nested consumer wear roots (16b7481af)

### 📚 Documentation
- feat(grok-bot): house init and shared house lookup (#128) (0f93687f2)
- General operating page for grok-bot, with a fill-in house (#124) (17e02c5a7)
- docs: orchestrator links memory-scoring (#127) (bca04dba8)
- docs: add ben-proof suited compaction bench harness (13284b9d8)
- docs: core audit fixes and a readable memory-scoring doc (#126) (23b370d1e)
- docs: point 0xray at grok-bot/OP-PROC.md (#125) (53b1889dc)

### 🔎 Other Changes
- docs(grok-bot): OP-PROC amendment (Blaze 10:31) + moltbook push allow (#123) (a2abed78c)
- docs(grok-bot): OP-PROC one-page front door + WAVEBOARD/ATTENTION_STATE mirror (#122) (519b2dae0)

---

## [4.0.26] - 2026-09-25

### 🔄 Changes

### 🐛 Bug Fixes
- fix: store a lesson when the task matches no signal (e3c75b43d)
- fix: prove a Cursor compact cut with a session log and per-session receipt (bb3a1c68f)
- fix: mill check accepts a published version; mcp:status runs (a8bd79e23)

### 🔎 Other Changes
- Merge pull request #116 from 0xRayAI/cursor/mill-ci-mcp-status-fbe0 (ba94508d2)
- Merge pull request #120 from 0xRayAI/cursor/lesson-recall-fbe0 (8f4a5a62a)
- Merge pull request #119 from 0xRayAI/cursor/compact-receipt-proof-fbe0 (a911fd17b)

---

## [4.0.25] - 2026-09-24

`0xray@4.0.25` ships the plate schematics in the package. `docs-site/docs/plates/` is on the npm `files` list. A worn suit resolves `memory-recall` and `processor` from `dist/integrations/hooks/plates.cjs`.

### 🔄 Changes

### 🐛 Bug Fixes
- fix: ship plate schematics in the npm package (b1bdd7415)

### 📚 Documentation
- docs: announce 4.0.24 — hot-swap, memory organ, plates (b04b80a15)

---

## [4.0.24] - 2026-09-24

`0xray@4.0.24` is on npm. `npm install 0xray`.

Exo, not a catalog. A factory stamps a skeleton (Inference, External Governance, Autonomous Engine) and fastens a mill. Code mill, music mill (`@0xray/blip` sound), agents across TUIs and LLMs wear it and operate.

- **Hot-swappable compaction.** Compaction and host change are the same cut. The station card (`.xray/state/STATION.md`) is the handoff. The next turn continues the card.
- **Memory organ.** Finished speech and reflections become lessons on signals. Kernel and activity logs are heat (`last_seen`) only. Unnamed speech mints a signal. Caps: 20 hot lesson lines, 20 retained ids (insertion order), 24 learned proposed signals. Factory laws stay.
- **Plates.** One INPUT/PROCESSING/OUTPUT schematic per pipeline in `docs-site/docs/plates/`. Station keeps one pointer line. Recall injects that one schematic. A lesson is an episode. A plate is the machine.
- **Repertoire 0.2.8** is the organ package, vendored in 4.0.24.

### 🔄 Changes

### 🐛 Bug Fixes
- fix: put matched lesson speech on the MEMORY_ROUTING block (2a2f0411d)
- fix: process reflection markdown as inference speech (64d7a6eee)
- fix: run discovered processors and keep commit subjects off the session log (d9fb2ee15)
- fix: grade a captured operation before the wake ends (c5760000b)
- fix: heat no longer writes a gradeable lesson from commit subjects (ceeb3a536)
- fix: grade a new session when another proposal already named the signal (bf4d5e59a)
- fix: let inference:run enter the cycle and exit (12c3e5142)
- fix: grade named signals on an external vote (5fc21d174)

---

## [4.0.23] - 2026-09-23

### 🔄 Changes

### 🐛 Bug Fixes
- fix: start the Dynamo client when external governance is required (d17b9cf19)
- fix: score proposals locally when inference governance is off (ae8075116)
- fix: finish the inference cycle and load the organ before routing (69522e6c3)
- fix: vendor the organ that seeds conviction above the floor (103961128)
- fix: vendor the organ that routes on conviction, not a floor count (24d215a5a)
- fix: reconcile writes the lock version when it bumps (434ddafef)
- fix: package-lock version follows package.json on stamp (026c36d55)

---

## [4.0.22] - 2026-09-23

### 🔄 Changes

### ✨ Features
- feat: rebase — answer the original message from this seat (a9a9e432b)

### 🐛 Bug Fixes
- fix: cursor gate follows the suit mill, not a sibling synthesis checkpoint (7a21cd996)
- fix: stamper strips every present-tense patch pin from shipped prose (4962b353f)
- fix: docs check uses the stamper strip set (f46377822)
- fix: stamper strips shipped prose only and proposals name recurring patterns (2b98354f7)
- fix: worn heat matches the signal id and dest keeps that law (9952f6dc2)
- fix: wake does not append a floor sample on heat (fe0492c98)
- fix: heat law matches the organ that touches last_seen (35390de44)
- fix: stack law refresh stays on the wake hook (f4a0c5d82)
- fix: store hero invariants as repertoire laws (9deed910b)
- fix: store the wake cascade as a repertoire law (ebf5aed8a)
- fix: test/ship plane and law refresh onto Station (87ad30bc5)
- fix: encode six planes and the live-cut hand (2eb24387e)
- fix: engine cadence and the three-module defects (d11b796d9)
- fix: heat resume and session match leftover after #103 (#104) (664a2039b)
- fix: persist heated length on the working receipt (2e28d1dbe)
- fix: heat resume and session match leftover (0f8b5b4ab)
- fix: leftover opt-out teaching after #102 (#103) (b8fc6bef7)
- fix: leftover stamps and dest-as-laws docs after #101 (#102) (910a739c4)
- fix: stamp leftover lock and worn features to the live package version (41f648d43)
- fix: dest stays laws — compact boot holds (#101) (9b731441d)
- fix: cleanse stale 4.0.15 pins and leftover validate wording (5ea8e0dff)

### 📚 Documentation
- docs: cold brief is latest SHA plus Station (55c2497e4)
- docs: jargon is not the job — results first on cadence (3699a56d0)
- docs: leftover opt-out ASCII after #102 (3974a2920)
- docs: leftover Repertoire optional language after #101 (5f64b68f3)
- docs: archive unused v2-refactor harness and fix migrate leftover URLs (23042fb7e)
- docs: archive StringRay leftover reports and update mill seed (eaa85fe5a)

### 🧪 Tests
- test: gate station-vs-repertoire opt-out leftover (aef80e538)

### 🔧 Maintenance
- chore: drop unused MCP scanner twin and archive costume dumps (49fc4c96c)
- chore: drop leftover root test toys and stamp live 4.0.19 (5997a5924)
- chore: archive leftover sync-docs script that wipes the live site (a23205b5b)
- chore: alias leftover consumer check and drop blaze pipeline paths (ef98637d9)
- chore: archive unused duplicate e2e runners (7806bd21e)
- chore: tidy leftover CI harnesses, kernel repro, and live npm pins (fe1f08ad0)
- chore: tidy leftover vote harnesses, debug repro, and shipped Unreleased pins (05587368e)

---

## [4.0.21] - 2026-09-23

### ✨ Features
- **Cleanup is memory** — `applyStationHeat` grows the project copy when Repertoire is on: kernel sessions and NOTES/CLEANSE diary heat, then prunes keyword names. Dest is laws (named invariants), not hangar `repo-*` or git slugs. Groover field stays off. Opt-out still skips seed and grow. Station stays the pickup card. Not a new MCP/skill.
- **Live context memory** — capture then grow. Session `patterns` observe existing dest/stack laws mentioned in git — they do not mint commit slugs. Cursor skip / afterFileEdit, Grok heat, Hermes pre-process, and OpenClaw pre-tool share one dest lock so parallel seats write one project copy. Not a new MCP/skill.
- **Vendored Repertoire 0.2.5** — `vendor/@0xray/repertoire` is the published 0.2.5 package (overlays included). Wear replaces an older leftover in `node_modules`. A newer user-installed copy is left alone. Boot reads worn `node_modules`, then vendor, then a sibling checkout last. **Repertoire is preferred.** Explicit opt-out (`enabled: false` + `provider: repertoire`) still skips seed and grow; Station is the memory when it is off.
- **Cursor fifth wear** — `install-bridges.cjs` fastens project `.cursor/hooks.json` plus relative `.cursor/hooks/*.sh` so Cursor Cloud heats Station and gates tools. Leftover env-assignment commands are rewritten. Not a fifth chat TUI. No new MCP/skill surface. Pack gate (`REQUIRED_PACK_PATHS`) now requires `dist/integrations/cursor/hooks/{hooks.json,pre-tool-use.js,pre-compact.js,after-file-edit.js,cursor-hook-utils.js,cursor-usage-receipt.js,xray-cloud-hook.sh,pre-tool-use.sh,pre-compact.sh,after-file-edit.sh}` so a published tarball cannot ship a dead consumer command. `preToolUse` / `afterFileEdit` rewrite the card when git HEAD or Repertoire count diverges — Ticket / Durable / Seed stay. OP-PROC stays in the hook, not on Station.

### 📚 Documentation
- Cursor fifth wear in README integrations table, AGENTS / AGENTS-consumer / SKILLS / llms.txt, and Docusaurus integrations / getting-started / consumer-migration.
- **Lead cadence (syncopation)** — `grok-bot/ops/LEAD-CADENCE.md` is the peer-lead OP-PROC: dummy `SKILLS.md` tests, same-sess wear + Station card, npm OTP+poll, always branch/worktree/PR, loop until Station is done, workstreams not idle pacers. Wired into `orchestrator` skill, AGENTS hot-swap, OPS-CATALOG. Not a new skill (Codex 69).
- **Repertoire is preferred** — README, SKILLS.md, llms.txt, AGENTS, AGENTS-consumer, and the memory guides say wear it. Dest is named laws. Station is the compact ticket, not a substitute. Shipped `signalsPath` is `.xray/state/repertoire/curated_signals.json`. Do not pin 0.1.8.
- **Few files have versions** — patch stamps live in `package.json`, CHANGELOG, and stamped JSON only. Guides, Station, and OP-PROC do not pin a cut. `release:docs-check` refuses present-tense `0xray@x.y.z` / “this cut is” on those surfaces.
- **Board clock** — critique board wakes on PR events and resumes the same critic. Two idle pacers (reviewer + lead-reader) are forbidden; they inflate context and cause compact. Merge after PASS+CI (gate A). Publish only after mill-gate D + `foundry gate`.
- **Dispatch encode** — lead cards ticket + PR URLs + “Wear, then review.” Critic OP-PROC lives on `SEATS.md` Reviewer. When a law is spoken twice, write it to disk this wake. No new skill.
- **Ship decision matrix** — lead-owned. A PR+CI · B pack (`assert-packed-dist-cli` + consumer smoke) · C `npm run release:docs-check` · D `npx @0xray/foundry release --i-mean-it`. Green CI is not ship. Spend / credentials stay Ask-first. Host Auto Review may still card npm/Railway; that is not the OS decision.
- **Metamorphosis** — an LLM becomes OP-PROC through in-context worn seats (same critic, same dummy, four-line dispatch). Spawning more bots is the old skin.
- **Publish OTP latch** — stay logged in (do not `npm logout`). Every time run `npm publish --access public` in the live TTY (no `--auth-type=web`, no `--otp=` from chat, no `tee`). Paste the clickable `auth/cli` URL. Do not ask for a 6-digit authenticator code in chat. Do not press Enter. Do not hand publish to a browser subagent. Poll `npm view` until the version is live. Then prove **fresh** and **upgrade** registry installs. `npm view` is not an install.
- **`npx 0xray validate` cleansed** — no longer shells leftover `.opencode/init.sh` (macOS `md5` + `enforcer-config.json`). Wear check: `REQUIRED_PACK_PATHS`, Cursor hooks, mill+inspect, repertoire. `init.sh` still boots OpenCode but accepts Linux `md5sum` and consumer `.xray/codex.json`.
- **Swamp reflection (new arch)** — `docs/reflections/swamp-new-arch-reflection-2026-09-20.md`. Card, organ, hook. Lying metal. Live tarball lag.
- **Clean ticks every cycle** — `/loop` prompt is rewritten at the end of every live tick. `subscribe_timer` name-dedupe does not update the prompt. Unsubscribe then resubscribe. A tick that contradicts metal is dirty: rewrite, do not act. Not on Station.
- **Idle `/loop` stop** — if Station `Working` and the WAVEBOARD (open ship PR, live OTP, unfinished close) are idle, unsubscribe and do not resubscribe. A parked mill is not an active wave.
- **Subject review. Fix n ship.** After board PASS, review the worn dest / domain (not only CI), close leftovers, then mill-gate D. PASS is not ship. On `LEAD-CADENCE.md` Ship track + `SEATS.md` Reviewer. Not on Station.
- **OP-PROC reload after compact** — overlay dest names *are* OP-PROC. Heat writes them to `.xray/state/repertoire-working.json` `opProcNames`. Station stays a ticket (count + four working matches). Not a new skill.
- **Groover is not Repertoire.** Groover was a broken experiment of the organ. Do not grow dest from Groover field as if that is the KB. On `LEAD-CADENCE.md` Heads from tails. Not on Station.

### 🐛 Bug Fixes
- **Dest is laws, not keywords** — wake hydrate is seed + stack only. `patternsFromGit` observes existing laws. Grow skips `syncWorkspaceRepos`. `pruneKeywordDest` drops `repo-*` / release-stamp slugs / generic field-observed names unless factory or stack protects them. Compact `hookEvent` / `event_class` hold across later preToolUse even when HEAD moves. Not a new MCP/skill.
- **Cursor Cloud host fire** — leftover `XRAY_AI_PATH=` / invoke-probe one-liners never start on Cloud (argv[0] is not a shell). Fasten copies `.cursor/hooks/*.sh` and rewrites leftover env-assignment templates to relative paths (`preToolUse` / `preCompact` / `afterFileEdit` / `beforeShellExecution` / `beforeReadFile`). Workspace wrapper (`/agent` with `repos/xray`) is not a dest heat root, even with a leftover wrapper card. Heat discovers mill cards under `repos/` and the Read path. Dest `EACCES` fail-opens so a wired hook cannot deny every tool. Fasten also writes the daemon workspace root when visible, then pokes local `ReloadAgentSkills` so a mid-session wear binds this daemon. Cloud `preCompact` is supported (hooks.md: Yes). It fires on a real window compact after bind — this seat `event=preCompact` at 2026-09-22T23:16:22 with host stdin (256k / 230861 / 90%). Hook stdout cannot spawn; persist `conversation_id` + `generation_id` on the receipt and resume that id (same as Task's returned agent id). Not a new MCP/skill.
- **Station ticket survives heat** — leftover `session-boot` extras (`Subject brain` / Draft #96) no longer overwrite a live Station Intent/Plan. Pickup beats a boot-echo card. HEAD move drops a leftover lead-dev-plan that still echoes boot. Not a new MCP/skill.

### 🔄 Changes
- **Durable Hold npm** — heat + `cursorBootNeedsRefresh` + `npx 0xray validate` drop/fail `Hold npm` on Station. Identity stays. Mill-gate holds the ship latch. Not a new skill.
- **Hangar catalog** — mill hangar docs use Clearing `GET /v1/catalog` as the directory (listed hangars: Groover DID + pin, plus solar + live shop), not a hardcoded extract/witness/pin route table. Groover MCP `list_hangars` reads that catalog.
- **foundry-plant/0** — fasten is a protocol any mill implements, not a 0xray-owned catalog of plant kinds. Builtin plant is mill+inspect only. `foundry.json` `"plant": "@0xray/blip"` (alias `"blip"`) fastens whatever that mill package declares. Organs (looker, vibe, mixer) live in the mill; adding one is a mill publish, not an xray catalog PR. Nested mill `@0xray/foundry@0.1.12`. CLI shims `foundry blip|sound` still exist on foundry 0.1.11+.
- **Blip/sound mills moved to `@0xray/blip`** — 4.44s drawers (render, kapow, vibe, wow-pass listen/cel, sound bed/mixer, looker) live in the blip product mill. `@0xray/foundry@0.1.11` shims `foundry blip|sound` including `blip look`. Railway plant consumes the product mill, not a hand-vendored copy.

---

## [4.0.20] - 2026-09-22

### 🔄 Changes

### 🐛 Bug Fixes
- fix: rewrite session-boot when HEAD moves — first-wins skip froze metal (same session still heats dest)
- fix: grow dest from live git on every floor (a7685eb09)
- fix: heat grows the project copy — cleanup is memory (be10c82eb)

---

## [4.0.19] - 2026-09-22

### ✨ Features
- **Vendored Repertoire 0.2.5** — published 0.2.5 lives in `vendor/@0xray/repertoire`. Wear replaces older leftovers. Optional; Station is the memory when it is off.

### 🔎 Other Changes
- Load worn Repertoire first; sibling checkout last. (f8a90b531)
- Put published Repertoire 0.2.5 inside 0xray vendor and wear it. (a90b0a7a4)

---

## [4.0.18] - 2026-09-22

### 🔄 Changes

### ✨ Features
- feat: wake heat joins bookmark, index, and mind (ad596aae2)

### 🐛 Bug Fixes
- fix: pin subject hits on wake rematch (65de9d37a)
- fix: wake match loads 0.2.5 and keeps subject hits (80b61236d)

### 📚 Documentation
- docs: memory-wake join — BRAIN-003 (1c128e69c)

---

## [4.0.17] - 2026-09-22

### 🔄 Changes

### ✨ Features
- feat: write session-*.json from Cursor heat when HEAD moves (363186a02)
- feat: persist overlay OP-PROC on repertoire-working after compact heat (8c55793e8)

### 📚 Documentation
- docs: ASCII gather/store/retrieve trees for Station memory (d8f2f3b89)
- docs: Station is always the pickup memory after compact (bec431c61)
- docs: Groover is not Repertoire — do not grow dest from Groover field (203147d19)
- docs: Subject review. Fix n ship. — dest review then leftover then D (ad4ffa7f6)
- docs: stop /loop when the card and WAVEBOARD are idle (60f0fd53f)
- docs: clean ticks every cycle — rewrite /loop prompt, do not act on stale metal (e71a19559)

### 🧪 Tests
- test: match Compact cut wording on Station-as-memory (7f9a4f091)

### 🔎 Other Changes
- Merge main — include weekday-mirror #97 in 4.0.17 tarball (86fdec7ce)
- Merge pull request #97 from 0xRayAI/cursor/weekday-mirror-dist-voice-9b4d (d0853aad1)
- docs(grok-bot): weekday mirror for Dist reply voice and CoS wake hygiene (f91233b59)
- Merge branch 'cursor/clean-ticks-fbe0' — clean ticks every cycle (12dd06362)
- Merge branch 'cursor/leftover-validate-d-fbe0' — release 4.0.16 live, leftover validate gone (8fa037212)

---

## [4.0.16] - 2026-09-20

### 🔄 Changes

### 🐛 Bug Fixes
- fix: type validate pack paths — no untyped mjs import in src/cli (ff936b276)
- fix: cleanse npx 0xray validate — wear check, not leftover init.sh (741cca410)

### 📚 Documentation
- docs: new-arch reflection after wading part of the swamp (12d1fff69)
- docs: persist peer-boot seat bc-49e17122 after four-line wear (5c8be98bb)
- docs: encode registry install as live-verify after npm view (bd32bd1c4)
- docs: encode npm CLI OTP latch — lead publishes, no subagent (d600d12a2)

### 🔎 Other Changes
- Merge branch 'cursor/npm-cli-otp-fbe0' — OTP latch, two-path live-verify, cleanse leftover validate (568797952)

---

## [4.0.15] - 2026-09-17

### ✨ Features
- **Factory-blip vibe seat** — `blip-vibe` plant agent scores still + Rippel five + kapow on the same aesthetic organ. Appeal 0–10. Ship bar is **8**. Shared fill / tint / contrast / outline / flash / differ; kapow extras stay kapow-only. Kapow is a comic burst: 8–10 outer points, 6–8 inner, some spikes longer than others. `npx @0xray/foundry blip vibe`. Inspect stays duration / mode / file. No `@0xray/foundry` bump.
- **Factory-sound mixer seat** — `sound-mixer` plant agent levels every genre × tempo × motif (hats, plate, glue, phrase). `npx @0xray/foundry sound mix`. Dries the plate, pulls hot hats, eases glue. Inspect stays the last-bed gate. No `@0xray/foundry` bump.
- **Factory-blip kapow opt** — `--mode motion:kapow` is a two-tier stamp on the same stanza (outer cyan burst winds, inner gold burst + `KAPOW!` hit the jewel cut). Not a third look. v0 five stay. No `@0xray/foundry` bump.

### 🐛 Bug Fixes
- **Mixer matrix CI timeout** — the 60-seat `mixMatrix` mill test keeps the same gates; the `all` project 30s cap was killing a ~34s PASS on GitHub runners. Per-test timeout is 120s. No `@0xray/foundry` bump.

### 🔄 Changes

### 📚 Documentation
- docs: Claim C compact 8 — quiz-first no restates (e66ffe11f)
- docs: mention blip render on the consumer agents card (9cd6662bc)
- docs: Claim C compact 7 — quiz-first still summarizer keep (931547be6)
- docs: Claim C compact 6 — summarizer kept canaries, not the old window (a3a6a83a8)
- docs: Claim C memory protocol — quiz-first, no canary values (b38dcd5d4)
- docs: Station guide also denies mind-survival overclaim (af7b686ca)
- docs: compact scores disk, not conversation memory (6cf1d5d2f)
- docs: Station is survive-the-cut; Repertoire 0.1 is judgment (d87a39d37)

### 🧪 Tests
- test: Claim C quiz printer and canary leak scan for compact 7 (d1cff2de4)

---

## [4.0.14] - 2026-09-16

### ✨ Features
- **Factory-blip music drop** — every genre bed hits on the jewel cut (shared crash + motif answer), stamps the hook cell on the tag, and keeps six tellable bodies. Not a sectionGain fader. Inspect still PASSes. No `@0xray/foundry` bump.
- **Factory-blip drop seats** — cage recoils then whips (shards off the lantern). Cameras read as different shots (top flattens, low hero-lifts, dutch slashes the floor). Snap still cracks. Looker still eclipses. No `@0xray/foundry` bump.
- **Factory-blip drop rupture** — orb-cage and snap crack on the turn (gold lantern / held slash through the noun), not a linear spin. Looker wears one large eclipse moon the noun eats. Floor still fades; the punch lives on the jewel. No `@0xray/foundry` bump.
- **Factory-blip camera seats** — six seed shots (`front` `three-quarter` `top` `low` `dutch` `side`) plus a phrase travel / turn push-in. Cube jewel keeps its faces (quads → tris). Large faces actually fill. Floor fades on the turn. Horizon wash stays cyan/blue (no olive). Inner moons graze the disc so the noun can occlude. Embers stay tethered after the burst. `--camera` overrides; seed picks if omitted. Receipt `visualConfig.mesh.camera`. No `@0xray/foundry` bump.
- **Factory-blip prod-grade phrase** — hook/turn/tag now crossfade (`hookEase`/`turnEase`/`tagEase`). Still plates dissolve (~300ms) instead of hard-cutting. Focus orb wears field + mesh mass so two briefs do not clone. Ambient bed writes a 3-section score (turn crash, tag stab, walk on turn). Mill stays deterministic — no LLM in the render loop. No `@0xray/foundry` bump.
- **Factory-blip Rippel v2** — 4.44s is a Short: hook → turn → tag on one motion grid for picture and bed. Two looks (`focus` disc-satellites | `cage` Wu+field). Stereo AAC bed with a written motif (not `pick()` soup), better voices, mix pocket. Missing stream or inaudible bed FAILs inspect. No `@0xray/foundry` bump.
- **Factory-blip plant** — new factory plant sibling to mill + sound (not a mill copy). `foundry.json` `"plant": "blip"` fastens `blip` + `blip-inspect`. Dynamic motion registry (not a frozen Rippel enum). v0: still + Rippel five (`still` `orb` `swirl` `snap` `waves` `spark`). `kapow` is a growth stub. Still generator wears the Power Plant intro plate (void `#08090B` · ink `#F5F7FA` · cyan `#3DE0E8` · gold `#F5C518` · agent blue `#4A7FD4`). Hangar shop pair later. Brief → seed → still|motion:<id> → 4.44s mp4 → `.xray/blip/receipt.json`. Unknown id FAIL. No `@0xray/foundry` bump.
- **Factory-sound crystal mill** — sound plant render locks Rippel SSOT numbers (Membrane octaves 10 / pitchDecay 0.08, Metal harmonicity 5.1, Duo bass, ProfessionalMixer) then mixes crystal-clear (rumble HP, mud cut, sidechain, one limiter). Prototype was the topology, not the quality bar. Tone.Offline blocked in Node. Metrics stay fail-closed. No `@0xray/foundry` bump.
- **Factory-sound Rippel retool** — sound plant render is membrane kick + metal hat + mixer (Rippel prototype topology). Tone.Offline blocked in Node (`OfflineAudioContext`). `phonk` is first-class. Metrics stay fail-closed. No `@0xray/foundry` bump.
- **Factory-sound plant** — `foundry.json` `"plant": "sound"` fastens `sound` + `sound-inspect` (mill optional/off). Brief → checksum seed → genre → headless wav → metrics gate → `.xray/sound-bed-receipt.json`. `npx @0xray/foundry sound render|inspect`. Foundry inspect reports sound plant + last bed PASS/FAIL. Not a mill copy. Not costume. No `@0xray/foundry` bump — dogfood from branch/pack.
- **Cursor cloud hooks adapter** — repo `.cursor/hooks.json` (version 1) runs `preToolUse` / `preCompact` / `afterFileEdit` against 0xRay gates + Station merge. No `sessionStart` (unavailable on managed cloud). Path C seed: `examples/cursor-cloud-compact/` (COMPACT-BEN-001).
- **Cursor cloud real-usage receipt** — `writeCursorUsageReceipt` records host `preCompact` fire from invoke-probe (Y/N, no hand-invoke) and accepts only host/MCP/dashboard usage fields. FILL / chars÷4 is `ok: false`. Station compact-row + `.xray/state/cursor-usage-receipt.json`. Killer-dual Arm S: `examples/killer-dual/`.
- Mill inspect treats factory shop plant (`shop-extract`, `shop-witness`, `shop-pin`) as first-class with mill plant. `foundry.json` `shopPlant` names more shops. Not `"costume": true`. Nested mill **0.1.10**.
- Exo agent map: root `llms.txt` (mill+inspect plant, 7 MCPs, hangar/`shopPlant` coexistence, Codex 69, no costume dump). README / AGENTS / SKILLS / Docusaurus no longer claim default 45-skill sync.
- Pack → tmp suit proof: `npm run pack:tmp-proof` (and consumer smoke) installs the packed tgz, runs `foundry mint --skip-live`, plants factory hangar shops, and inspects without costume dump. Playwright n/a (mill CLI).

### 🐛 Bug Fixes
- **Packed dist/cli gate** — `0xray@4.0.13` listed `dist/` in `files[]` but the npm tarball shipped **0 dist files** (`npx 0xray` fell back to 4.0.9). `npm pack` silently omits missing `files[]` entries. `prepack`, mill `release` / `gate`, and consumer smoke now fail unless the tarball contains `dist/cli/index.js`, `dist/mcps/orchestrator.server.js`, and Grok `session-start.js`. This PR does not publish; forge PUT is 4.0.14 after merge.
- **Station merge on compact** — PreCompact / PostCompact / SessionStart `writeStationMarkdown` updates stock heat (intent, repertoire, working, host) and **merges** unknown keys plus `## Durable` / `## Seed` blocks. COMPACT-AB-001: no wipe-then-write of ticket / seed / open cloud / unfinished path.
- **Cursor session-boot is runtime** — `.xray/state/session-boot.json` is gitignored with the Station projection. A tracked leftover Grok boot no longer resurrects on rebase and clobber live compact heat.
- **Grok multi-seat wear** — last-mile dest is project `.grok/plugins/0xray`. Shared HOME (passwd `$HOME`) no longer writes machine `~/.grok/plugins/0xray`, so two seats (forge/critic/herald/blinky) cannot last-wins clobber each other's `XRAY_ROOT`. Isolated HOME may wear `$HOME/.grok/plugins/0xray` and still must not write the passwd machine plugin. Inspect reports project dest. Not a 45-skill dump.
- **Foundry inspect dest lag** — nested mill **0.1.10**. `npx @0xray/foundry inspect` isolated-home `dest` matches `resolveGrokPluginDests` (project `.grok/plugins/0xray` on shared HOME). Published `@0xray/foundry@0.1.9` still joined dest from `$HOME` after 4.0.12 / #29 wear. This PR does not publish the mill.
- **Grok marketplace pack** — `package.json` `files` includes `.grok-plugin/` so `npm pack` ships the mill-default Grok manifest (`package/.grok-plugin/plugin.json`). Consumers no longer receive only stale `.plugin/plugin.json`.
- **Grok marketplace manifest** — `.grok-plugin/plugin.json` matches `4.0.10`: `author` is an object, `mcpServers` is a flat path (not `components.mcpServers`), description is mill+inspect default wear (not a 45 knowledge-skills claim). Fixes `grok plugin validate`.
- **Consumer install of packed `0xray`** — stop shipping `@0xray/repertoire` as `file:./vendor/@0xray/repertoire`. npm `--install-links`, pnpm, and yarn resolve that path from the **consumer** root (`ENOENT .../vendor/@0xray/repertoire/package.json`), not from `node_modules/0xray`. The organ stays in the tarball at `vendor/@0xray/repertoire/`; postinstall wears it into `node_modules/@0xray/repertoire`. Fresh `npm install 0xray` / `npm install 0xray-*.tgz` no longer needs a consumer-root `vendor/` tree. Mill plant (`mill`+`inspect`) unchanged.

### 🔧 Maintenance
- **HOST-FIRE Arm S** — first live `cursor-host-precompact` on `bc-cd19bb4e` (count=2). Survive receipt + compare: `examples/killer-dual/RECEIPT-HOST-PRECOMPACT.md`, `COMPARE.md`.
- **HOST-FIRE #3** — `examples/cursor-cloud-compact/RECEIPT-HOST-PRECOMPACT-3.md`: hooks bound at boot + live `preToolUse` spawn; host `preCompact` still did not fire (`cursor-host-precompact-FAIL`).
- Foundry mill: one bumper (`reconcile-version.mjs`); `version-manager.mjs` is `--artifacts-only` (JSON + CHANGELOG). Bump and `--tag` are refused.
- Docs mill verifies era kernel headers (`4.0`) and skill counts; it does not rewrite markdown prose.
- Exo cannot ship: `executeReleaseWorkflow` is blocked (`FOUNDRY_EXO_CANNOT_SHIP`).
- Full `release-gate` now runs `validate-release-docs` (not only `--verify-only`).
- `VersionComplianceProcessor` treats `package.json` as SSOT; UVM is frozen.
- CI: version-compliance and AGENTS.md workflows target `main`; mill check is `validate-release-docs` (not UVM 1-ahead). `publish.yml` runs the docs mill before PUT.
- Mill extracted to `scripts/foundry/` (`@0xray/foundry`). `release:npm` is `release.mjs --publish-only`. UVM file removed. Consumer mint writes `foundry-inventory.json` from their package.json.
- Consumer postinstall overlays their mill SSOT onto the hanger: constitution (`xray/codex.json`), features/temperament, config, `src/skills/<name>/SKILL.md`, `src/opencode/agents/*.yml`. Remap with `foundry.json`. Overlay is **project** skill hangers. JSON mill-fill always merges. CLI re-wear mints once after mill copies. `npx @0xray/foundry mint` reapplies overlay.
- `@0xray/foundry@0.1.0` mills `FOUNDRY_ROOT` or cwd. Full docs corpus only on the 0xray exo; light mill otherwise. Stamp creates CHANGELOG when missing. Publish refuses a nameless `package.json`. Mill PUT is `cd scripts/foundry && npm publish`; stranger `release` does not force `--access public`. Deprecated `sync-versions.mjs` and `release.js` wrappers removed.
- Honesty: consumer card does not claim it writes root `SKILLS.md`; mill help is `npx @0xray/foundry`; shims mill cwd; mill-managed `AGENTS.md` overlays from `xray/AGENTS.md`. Mill-fill stays law.
- Scar tissue cut: no `homeSkills`, no `codexMode`/`featuresMode`/`configMode`. JSON always merge. One `mintConsumerSuit` after mill copies (not inside `syncBuiltinSkills`).
- Mill flesh: live `npx @0xray/foundry release` is opt-in (`--i-mean-it` / `FOUNDRY_RELEASE=1`). Packed mill mint and Unreleased stamp are executed tests. `@0xray/foundry` tree is 0.1.1 (not a 0xray bump).
- Mill CI: `0xRay CI/CD` is the mill gate on `main` (typecheck, lint, mill tests, build, curated tests, smoke). Monitor reports Actions; it does not auto-push. `npx @0xray/foundry ci` / `hooks`. Mill package 0.1.2.
- GitHub Pages: stop copying stale `docs-site/static/index.html` over the Docusaurus homepage (unprefixed `/docs` links 404ed). `npx @0xray/foundry docs-build` is the mill Docusaurus build. Mill 0.1.3.
- Mill self-host: `0xRay CI/CD` lives in `mill-ci.yml` so GitHub registers push/PR after the inactivity disable. Mill CI always builds Docusaurus.
- GitHub Pages homepage: no client `<Redirect to="/docs/…">` (that 404s at the org root). Meta refresh + `useBaseUrl('/docs/')`. `.nojekyll` in static.
- Mill CI report: `mill-monitor.yml` (fresh workflow ID) listens for mill CI completion. Report only.
- Published mill `hooks` uses the 0xray garment installer (`node_modules/0xray/scripts/hooks`), not `node_modules/@0xray/hooks`. Mill tree 0.1.4 (not a 0xray bump).
- Nested mill in the 0xray tarball (`scripts/foundry/`). Wear no longer needs a second `npm i @0xray/foundry` for mint-on-install. 4.0.2.
- Empty garment: mill plant (`mill` skill) is the hanger. Not 45/42 costume unless `foundry.json` `"costume": true`. Mill 0.1.5.
- Mill plant fastens **inspect** (inspect AI work) plus `mill`. Not empty. Mill 0.1.6.
- Nested mill **0.1.7**: inspect organ, four floors, passwd HOME, mill CI receipt. 4.0.5.
- Nested mill **0.1.8**: isolated Hermes/OpenClaw, consumer tarball GET, CLI mint inspects. 4.0.6.
- Nested mill **0.1.9**: inventory DNA for Groover 0xray-suit pack. 4.0.7.

---

## [4.0.13] - 2026-09-14

Station PreCompact merge keeps custom STATION.md keys.

---

## [4.0.12] - 2026-09-12

Public npm is still `0xray@4.0.11`, which predates #29. Isolation cannot be proven from `main` alone — bots dogfood the registry. This patch PUT wears project-scoped Grok plugin dest so multi-seat wear does not last-wins clobber machine `~/.grok/plugins/0xray`. Shared HOME writes project `.grok/plugins/0xray` only. Isolated HOME may wear `$HOME/.grok/plugins/0xray` and still must not write the passwd machine plugin. Mill+inspect default. Nested mill stays **0.1.9**. Not 5.0.0. This PR does not publish.

- fix(grok): project-scoped plugin dest so multi-seat wear does not last-wins clobber machine ~/.grok (747816635)

---

## [4.0.11] - 2026-09-12

npm pack now includes `.grok-plugin/` so the mill-default Grok marketplace manifest ships in the tarball (`package/.grok-plugin/plugin.json`). Published `0xray@4.0.10` omitted it — the `files` whitelist landed in #27 after that PUT. Not 5.0.0. This PR does not publish.

- fix(pack): ship .grok-plugin in npm files whitelist (5a65851cb)

---

## [4.0.10] - 2026-09-12

### 🔄 Changes

- Version bump

---

## [4.0.9] - 2026-09-11

Postinstall does **not** mill npm global prefix or npx cache as a consumer. `resolveConsumerTargetDir` treats `_npx` and a prefix without `package.json` as an install prefix: mill `INIT_CWD` if it is a real project, else mill the 0xray package (dogfood skip). Isolated HOME still skips machine `~/.grok`. Mill plant stays `mill` + `inspect`. Not 45/42 costume. Nested mill stays **0.1.9**. Not 5.0.0.

- fix(foundry): do not mill npm global prefix or npx cache as a consumer (b08b19612)

---

## [4.0.8] - 2026-09-11

### 🔄 Changes

### 🔎 Other Changes
- fix(foundry): mill release gate uses test:comprehensive like mill CI (bd980ea3f)
- fix(confer): allow undefined on optional local vote fields (e4436af8f)
- fix(confer): abstain locally; do not rubber-stamp analyze_proposal (0f6c61cbe)
- fix(confer): local vote when nested LLM is not configured (eb6004b07)

---

## [4.0.7] - 2026-09-09

Nested mill **0.1.9**. Inventory writes `dna` (keccak256 of canonical JSON without `mintedAt`). Inspect echoes dna + pack `0xray-suit`. Mill does not mint on chain. Not 5.0.0.

---

## [4.0.6] - 2026-09-09

Nested mill **0.1.8**. Isolated HOME skips machine Hermes/OpenClaw. Inspect GETs public consumer `.tgz`. CLI `mint` runs inspect (chat is not done). Postinstall does not inspect. Not 5.0.0.

---

## [4.0.5] - 2026-09-04

Nested mill **0.1.7**. Inspect is a mill command (`npx @0xray/foundry inspect`): costume dump fails mint, live PUT GETs the `.tgz`, four project floors, mill CI receipt, passwd HOME isolation. Mill plant stays `mill` + `inspect`. Not 45/42 costume. Not 5.0.0.

---

## [4.0.4] - 2026-09-04

Mill **fastens** an inspect suit: mill plant is `mill` + `inspect` (inspect AI work — diffs, traces, mill receipts, CI). Not empty. Not 45/42 costume unless `foundry.json` `"costume": true`. Factory Repertoire + PPE stay. Mill **0.1.6**. Not 5.0.0.

Naming: inventory `suit` (`fastened` / `overlay` / `costume`). Not garment. Not hanger. Costume is the 45/42 dump flag only.

---

## [4.0.3] - 2026-09-04

Empty garment. Their plant is the suit. Mill plant (`mill` skill) is the factory discipline on the hanger. Not 45/42 costume unless `foundry.json` `"costume": true`. Factory Repertoire still enable-when-resolves. PPE stays worn. Mill **0.1.5**. Not 5.0.0.

---

## [4.0.2] - 2026-09-04

Nested mill in the **0xray tarball**. `npm i 0xray` mill-fills via `scripts/foundry/` (postinstall + CLI re-wear `require` it). `@0xray/foundry` stays the standalone mill CLI (**0.1.4**). Not 5.0.0.

Pack tests and consumer smoke require `scripts/foundry/mint-suit.cjs` in the tarball. Mill self-host (mill-ci, mill-monitor, Pages `docs-build`, mill-fill overlay) was already on main; this patch is the npm PUT of that mill next to the garment.

### 🐛 Bug Fixes
- Processor-test ESLint config is ESLint 9 ESM

---

## [4.0.1] - 2026-09-02

Patch on the 4.0 temperament line. npm **4.0.0** stays latest until this tag publishes.

### 🐛 Bug Fixes
- CLI `-V` / `--version` no longer dumps a Commander stack after `exitOverride`
- Hermes: post-processor logs `[nudge]`; e2e calls `session-start`
- OpenClaw e2e reads `plugins.entries` (OpenClaw 2026.8.2)
- Release gate: consumer smoke expects organ **on**; no `scripts.publish` after the registry PUT; reconcile allows tagged-but-unpublished

### 📚 Documentation
- Archive catalog / enterprise Docusaurus boiler; live site is exo wear
- Version-manager stamps live Docusaurus kernel headers (no archived `docs-site/docs/README.md`)

---

## [4.0.0] - 2026-09-02

First ship of the **temperament** line on the **v2 three-subsystem OS** (Inference · External Governance · Autonomous Engine). npm **4.0.0**. Tag `v4.0.0` on `0xRayAI/xray` `main` (`f80b42c`).

### ✨ Features
- **Factory memory organ** — `@0xray/repertoire@0.2.0` vendored as a runtime dependency. Shipped `memory_routing` is **on** (8 factory primitives). Extra host MCP stays `repertoire`, not an 8th `xray-*` server. Compact ingest writes `.xray/state/repertoire/`. Explicit opt-out: `enabled: false` + `provider: "repertoire"`.
- **Four-floor compact + memory** — station heat matches Repertoire on every host (not only Grok). Compact on Grok Pre/PostCompact, Hermes session-start, OpenCode plugin boot, OpenClaw PreToolUse keeps intent, Working signals, and `Repertoire: on`.
- **Suit temperament** — `frontier` | `guided` | `strict` | `auto`. Constitution (Codex 11/29/69, destructive shell) always on. Ceremony (spawn-plan deny, confer, synthesis) scales by host.
- **Grok 4.6 / Grok Build** — `auto` → frontier: spawn missing/stale/todo-mismatch **warns**; confer off unless opted in.
- **OpenCode / Hermes** (including free models) — stay **guided**: full v2 engine ceremony.
- **Upgrade safety** — consumers without `suit_temperament` stay **guided**; postinstall merge will not frontier existing Grok installs.
- **Codex 69** — in `codex.json` (blocking). PreToolUse already denied new MCP/skill/handler files.
- **OpenClaw host PreToolUse** — `evaluateOpenClawHostPreTool` SSOT + `~/.openclaw/hooks/xray-pre-tool.mjs` on `0xray openclaw install`. Platform still has no native abort API; this is the host adapter.
- **Repertoire harness** — leftover `memory_routing` default-off auto-enables when sibling `@0xray/repertoire` or `node_modules/@0xray/repertoire` resolves (install **and** runtime provider load). Explicit `enabled: false` + `provider: repertoire` is opt-out. Consumers without the module stay off. Not an 8th 0xRay MCP.
- **Repertoire working state** — station heat writes `.xray/state/repertoire-working.json` and a `Working:` line on the card. Compact may ingest non-Bedrock matches. Registry primitives are routing; the working file is session memory.
- **Session resume** — Grok session-start writes `repertoireResume` (one line, signal count) into `session-boot.json` so the next station survives compaction.
- **Hot-swap station card** — `.xray/state/STATION.md` is the projection of `session-boot.json` (intent, git, **live** plan, last host, Repertoire). PreCompact/PostCompact persist it. AGENTS.md tells the model to Read it (Grok does not inject). Host change sets `hotSwap`. Same-host compact **keeps** the last swap stamp. OpenClaw first PreToolUse heats the card. Intent strips `<user_query>` wrappers. Works without Repertoire.
- **Framework dogfood wear** — `installAllBridges` on the 0xRay package still patches `<project>/.grok/hooks/0xray.json` and enable-when-resolves. Does not deploy consumer copies over the package.
- **Repertoire MCP names** — unprefixed server tools; Grok TUI namespaces them as `repertoire__*`. Grok install resolves sibling *or* `node_modules/@0xray/repertoire`.
- **Configurable archive marker** — `plan_archive_marker_hours` (default 24) in `features.json`
- **grok_postprocessor_light** — PostToolUse write-tool marker + activity.log
- **P2 session capture** — git post-commit → `captureSessionInference` when `inference_session_capture.min_commits` met
- **Docs** — [4.0 vision](docs-site/docs/architecture/v4-vision.md), [v3 from v2](docs-site/docs/architecture/v3-from-v2.md), [temperament](docs-site/docs/guides/v3-temperament.md), [trim list](docs-site/docs/architecture/v3-museum.md).

### 🔄 Changes
- Product version **4.0.0** throughout (`package.json`, `features.json`, plugin, banners). 3.x entries below are historical (npm `3.0.0`–`3.5.5`).
- `evaluatePreToolGate` is constitution-first (Grok, Hermes, OpenCode). Grok PreToolUse no longer re-runs 11/29/69/surface/destructive after the SSOT.
- Codex 69 denies **new** surface only (existing MCP/skill files may be rewired). `paths[]` / `target_notebook` / `prompt` content are in the SSOT collector.
- **strict** locks `no_new_surface` on (cannot opt out).
- Dual-host session-boot: Hermes / OpenCode / OpenClaw write `host` + `suit_profile`. A Hermes host ignores leftover Grok boot (and vice versa). Kernel/`generic` uses last boot.
- Frontier `auto_consult` follows confer opt-in (`confer.enabled` / `confer_on_synthesis`).
- Session-boot refreshes leftover host/workspace from another machine.
- Post-commit log maintenance prefers consumer `node_modules/0xray/dist` and ESM `pathToFileURL`.

### 🐛 Fixes
- OpenClaw plugin ships in the npm tarball; install resolves `dist` then `src`.
- Bare `node scripts/node/release.mjs` no longer defaults to patch (that path applied npm `3.5.5` → `3.5.6` over the 4.0 plant). Bump type is required. CJS/MJS loadability syntax-checks version/release/reflection/prepare/setup/CI-report scripts instead of executing them.
- Postinstall wears OpenClaw PreToolUse (stdin hook + plugin link), not only `0xray openclaw install`.
- Ephemeral e2e consumers no longer overwrite machine Hermes/OpenClaw `xray-consumer-root.txt`.
- Hermes postinstall copies hook runtimes; plugin enable prefers `xray-hermes`.
- OpenClaw install writes `opencode-cli` backend when `opencode` is on PATH (CLI pickle, not Zen HTTP).
- `0xray grok install` always runs `patchGrokHooks` (command strings, PreCompact/PostCompact) even when the plugin already exists. Stale `args[]` / smoke / blaze paths no longer leave compact cold. Patched JSON is also copied to `<project>/.grok/hooks/0xray.json` — the path Grok TUI actually loads.
- `buildLeadDevPlan` / `buildSynthesisCheckpointPlan` resolve temperament from `projectRoot`, not `process.cwd()` session-boot. A Grok frontier checkout no longer empties guided confer todos in tmp asides and release-gate verify scripts.
- Stop committing machine-local `.grok/` (absolute hook paths). Template stays `src/integrations/grok/plugin/0xray`.
- Grok hook `command` strings quote `XRAY_AI_PATH` and the script path so installs with spaces still start PreToolUse (Grok fail-opens on crash).
- OpenClaw `maybeHeatHostStation` skips only when both sides have a concrete matching session id. An install card with no session no longer swallows first PreToolUse.
- `postinstall.cjs` always calls `installAllBridges` (framework dogfood wear is no longer gated out of the production caller).
- `loadFeatures` forwards `grok_postprocessor_light`; PostToolUse can run the advertised write-tool marker path.
- `0xray grok install` writes `[mcp_servers.repertoire]` to `<project>/.grok/config.toml` and resolves the sibling from the consumer root.
- OpenClaw 2026.8.2 handshake uses client id `gateway-client` (not `openclaw-tui`). Control-UI id requires device identity; TUI id is rejected on loopback.
- OpenClaw e2e falls back to `openclaw agent` when token-only WS lacks `operator.write`. Grok e2e asserts `evaluatePreToolGate` SSOT instead of inlined gate names.

### ✅ Tests
- `suit-temperament.test.ts`; leftover-plan warn; confer frontier opt-in; install-bridges guided pin; Codex 69 rewrite vs create; strict lock; `paths[]`; dual-host boot.
- `spawn-plan-stale` after archival in `verify-delegation-gate-core` (6/6); OpenCode host in `release-gate`.
- OpenClaw PreToolUse unit coverage; live temperament probe across Grok, Hermes, OpenCode, OpenClaw.
- Wear-layout: plugin/hook resolve, ephemeral marker skip, opencode-cli backend write.
- `grok-hooks-json`: stale `args[]` smoke hooks gain compact events; station compact keeps `hotSwap`.
- `autonomy-kernel`: plan consults follow `projectRoot` profile; confer/synthesis verify scripts pass tmp, not cwd Grok boot.
- Repertoire enable-when-resolves + session-start `repertoireResume` unit coverage.
- Quoted Grok hook commands; postinstall dogfood wear; OpenClaw install-then-first-tool heat; `grok_postprocessor_light` loadFeatures; project Repertoire `config.toml`.
- Four-floor compact survival attests Codex 11 / 69 / destructive shell plus temperament after the cut. `XRAY_LIVE_SUCCESSOR=1` asks each host CLI to quote the station card.

---

## [3.5.5] - 2026-06-20

### ✨ Features
- **User-asides P0** — PreToolUse **denies** aside spawns without `cwd` / `working_directory` matching `aside.worktree`; `aside-worktree.ts` SSOT; synthesis-gate parity
- **Worktree auto-provision** — `analyze-complexity` runs guarded `git worktree add` when `user_asides.auto_provision_worktree: true`
- **Pipeline P3** — `verify:pipeline-facets` script; consumer `confirm:suit:full --pipeline-audit` wiring

### 🐛 Fixes
- **Worktree cwd enforce** — `auto_chain_delegations: false` no longer bypasses aside worktree cwd check; synthesis-gate parity retained
- **`isAutoProvisionWorktreeEnabled`** — requires `user_asides.enabled` before honoring `auto_provision_worktree`
- **`provisionGitWorktree`** — macOS `/var` vs `/private/var` path resolution for idempotent worktree detection

### 🔄 Changes
- **`verify:pipeline-facets --package-only`** — release-gate probes shipped artifacts without consumer feature matrix
- **`release-gate.mjs`** — wires pipeline facet verify (package-only mode)

### ✅ Tests
- `aside-worktree.test.ts`; delegation-gate cwd deny/allow; auto_chain-off + synthesis worktree deny; `provisionGitWorktree` guards; `verify-user-aside-core` 10/10

---

## [3.5.4] - 2026-06-19

### ✨ Features
- **Synthesis consult receipt gate** — s.1–s.3 todos require `.xray/state/synthesis-consult-{id}.json` before completion; `evaluatePostToolSpawn` records receipts from subagent output; Grok post-tool hook wired
- **User asides** — parallel work tracks (worktree-like) via `.xray/state/asides/{id}.json`; namespaced `{asideId}.a.*` todo routing; `analyze-complexity` + `orchestrate-task` rewire (no new MCP); session-boot hints; synthesis/pending bypass for aside spawns; `verify:user-aside` 9/9; docs `guides/user-asides.md`
- **Confer quorum** — `confer.ts` SSOT; auto-runs at synthesis `analyze-complexity` (researcher → architect-tools → code-review); `verify:confer` 7/7; config `confer_on_synthesis` (default true); session-boot `conferPending` hint; emoji agent panel in quorum report
- **Pipeline integration (P0–P2)** — enforcement-gate `{ proposals: [...] }` shape; `applyDecisionMatrix` + `calculateMetamorphosisScore` in `GovernanceService`; Grok `pipeline-hook-runtime.mjs` (reflection stubs, routing outcomes, reporting, inference-improvement light); `SelfProposalEngine` wired in PostProcessor; aside worktree cwd warn in delegation-gate; `autonomous_reporting` config key fix in SessionSummaryProcessor
- **Stale lead-dev plan** — archive after `plan_stale_hours`; `spawn-plan-stale` persists after archival via recent archive marker; synthesis realignment (s.1–s.3) exempt until consult todos complete
- **Hermes session-start parity** — `bridge.mjs` `session-start` command archives stale plans; lazy `plan-hook-runtime.mjs`; `verify-hermes-session-start.mjs` (4/4)
- **Pre-commit / pre-push codex** — diff-hunk and commit-range scope verifiers (`verify:pre-commit-diff`, `verify:pre-push-diff`)
- **Reflection noise** — minimal defaults 50 commits / `autoGenerate: false`; shell fallbacks synced
- **Multi-repo boot** — `sibling_repos` in `session-boot.json`

### 🔄 Changes
- **autonomy-command.md** — SSOT is `analyze-complexity` + `multi_agent_orchestration`; removed stale `autonomy-intake` / `autonomy_kernel` references

### ✅ Tests
- `synthesis-consult-receipt.test.ts`; E2E/outcome verifiers write fixture receipts
- `governance-service-metamorphosis.test.ts`; `confer.test.ts` emoji panel

---

## [3.5.3] - 2026-06-19

### 🔄 Changes

### 🔎 Other Changes
- fix(release): ship verify-grok-synthesis-gate.mjs in npm tarball (c2d32627e)

---

## [3.5.2] - 2026-06-19

### 🐛 Bug Fixes
- **Grok synthesis gate** — `pre-tool-use.js` wires `evaluatePreToolGate` SSOT (synthesis deny, gate slices, `govern-and-apply` block); fail-closed on hook errors
- **Consumer bridge root** — `findProjectRoot` git-root + devDependency detection; `findGitRoot` applies `normalizePath`
- **Consumer hooks** — stale xray pre-commit reinstall; post-commit hook installed; pre-commit fails closed when runner missing; non-xray hooks backed up before overwrite
- **Consumer `.gitignore`** — idempotent suit block merge on postinstall; preserves orphan tail on incomplete marker
- **`bridge.mjs`** — `handleGetConfig` fixes undeclared `envDir` ReferenceError
- **Post-commit reflection** — `load-reflection-config.mjs` mode whitelist + `--json` output (no shell `eval`); macOS/BSD `stat` support

### ✅ Tests
- `verify-grok-synthesis-gate.mjs` (4/4 live Grok hook); chained in `verify:grok-delegation-gate` and `verify:delegation-gate`
- `verify-consumer-gitignore` incomplete-marker fixture; `verify:find-project-root` 3/3

---

## [3.5.1] - 2026-06-19

### ✨ Features
- **Multi-host delegation gates** — `src/nucleus/delegation-gate.ts` SSOT; `evaluatePreToolGate` / `evaluatePostToolSpawn` shared across Grok, Hermes, OpenCode
- **Hermes** — `pre_tool_call` returns `{"action":"block"}` via bridge `delegation-gate`; `post_tool_call` clears pending on `delegate_task`
- **OpenCode** — `tool.execute.before` / `after` enforce delegation gate + post-spawn clear

### ✅ Tests
- `delegation-gate.test.ts`; `verify-delegation-gate-core.mjs`; `verify-hermes-delegation-gate.mjs`; shared `delegation-gate-fixture.mjs`
- Grok hook-utils deduped — re-exports nucleus SSOT via `delegation-gate-runtime.mjs`

### 📋 Deferred
- **OpenClaw host veto** — no consumer tool-block API; observability-only until platform supports pre-tool deny

---

## [3.5.0] - 2026-06-19

### ✨ Features
- **Auto-chain bridge (PR1)** — `pending-delegations.json` SSOT on `delegate-deferred`; PreToolUse surgical gate blocks writes while pending; PostToolUse logs + targeted clear on Task; session-bound TTL; `delegations[]` in orchestrate response
- **Spawn todo persistence (PR2)** — lead-dev plan stays enforced while outstanding todos remain (beyond 4h mtime); `checkSubagentGate` validates Task targets next plan todo; plan todo `in_progress` sync on matched spawn; new intake clears pending delegations + binds `sessionId`/`planGeneration`
- **`auto_chain_delegations: false`** — disables PR1 delegation gate and PR2 spawn-todo validation (opt-out of full auto-chain enforcement)

### 🐛 Bug Fixes
- **verify-orchestrator-behavior** — checks `pending-delegations.json` in consumer cwd (not package root)

### ✅ Tests
- `pending-delegations`, `lead-dev-plan-persistence`, `grok-pending-delegation-gate` unit tests; `verify-grok-delegation-gate.mjs` hook fixture (4/4); orchestrator behavior verify 8/8

### 📋 Deferred (3.5.1+)
- **#3 Observability** — full session trail (`sessionId` / `taskId` / `planTodoId` / gate deny count correlation)
- **#4 Rule 1 vs Rule 2** — lead-dev arbitration when read/triage conflicts with spawn-first gate
- **#5 Codex hard-fail** — silent fallback removal (independent of auto-chain)

---

## [3.4.10] - 2026-06-19

### 🐛 Bug Fixes
- **Routing SSOT** — `selectAgentForTask` checks `routeSubagent(taskType)` before capability scoring or memory routing; `type: implement` → `backend-engineer` (not `code-reviewer`)
- **Unified complexity** — `buildLeadDevPlan` uses `max(thin-dispatch, MCP overallComplexity)`; `dependencyCount: 8` at complexity 70 forces phased plan

### ✅ Tests
- `verify-orchestrator-behavior.mjs` ships in tarball — 5 behavior assertions (NaN, multi-task todos, implement routing, phased plan, honest deferral)
- Unit coverage: `agent-capabilities-routing`, extended `autonomy-kernel` + `execution-planner-dependencies`

---

## [3.4.9] - 2026-06-19

### ⚠️ Breaking Changes
- **`orchestrate-task`** — returns `success: false` when implementation agents (backend-engineer, frontend-engineer, bug-triage, etc.) are **deferred**. Only MCP consult skills execute in-process. Callers must not treat a completed response as work done; delegate via host `Task` / `spawn_subagent` per lead-dev-plan.

### 🐛 Bug Fixes
- **Orchestrator honesty** — no fake-complete for implementation agents; `delegate-deferred` + `lead-dev-plan-persisted` logged to `activity.log`
- **`analyze-complexity` NaN** — `dependencyCount` + `dependencies[]` schema; numeric dependency hints no longer produce NaN scores
- **Lead-dev plan** — `buildLeadDevPlan` uses per-task inputs; multi-task intake forces phased plan (not collapsed "Direct execution")
- **Hermes governance voters** — route through `hermes -z` CLI (same path as groover `hermes-runner`); honor `HERMES_BIN`, `HERMES_HOME`

### ✅ Tests
- Unit coverage: `execution-planner-dependencies`, deferred task-handler, per-task lead-dev todos

---

## [3.4.8] - 2026-06-19

### 🐛 Bug Fixes
- **Hermes v2 OAuth** — governance LLM voters read `providers.xai-oauth.tokens` from `~/.hermes/auth.json` (npm consumers on modern Hermes no longer abstain)
- **Headless deliberation** — honor `XRAY_GOVERNANCE_IN_PROCESS=1` for in-process skill voters without MCP subprocesses
- **Governance MCP HTTP** — per-session Streamable HTTP transports on Railway

### ✅ Tests
- Unit coverage for Hermes v2 auth parsing and `XRAY_GOVERNANCE_IN_PROCESS` governance path

---

## [3.4.7] - 2026-06-18

### 🐛 Bug Fixes
- **Release gate upgrade smoke** — `consumer-install-smoke` simulates consumer opt-in merge on every publish
- **Release pipeline** — artifacts sync before gate; idempotent `npm publish`; tag after publish
- **Postinstall** — skip customized `AGENTS.md`; hard-fail on bridge wiring errors
- **pre-publish-guard** — allow `.xray/config.json` and `.xray/state/` runtime dirt between gate steps

---

## [3.4.6] - 2026-06-18

### 🐛 Bug Fixes
- **Postinstall config merge** — `deployXrayConfig` deep-merges existing consumer `features.json`, `codex.json`, and `config.json` instead of overwriting on mtime; consumer opt-ins (e.g. `memory_routing`) are preserved and `features.version` bumps to the installed package

---

## [3.4.5] - 2026-06-18

### ✨ Features
- **Native bridge MCP wiring** — `bridge-mcp-wiring.cjs` SSOT wires 7 xray MCP servers (+ repertoire auto-detect) into Hermes `mcp_servers`, OpenCode `opencode.json`, and OpenClaw `mcp.servers` via `npx 0xray {hermes,opencode,openclaw} install` and postinstall

---

## [3.4.4] - 2026-06-18

### 🐛 Bug Fixes
- **Researcher MCP trap routing** — `analyze_proposal` awaits `getMemoryRoutingProvider()` so MEMORY_ROUTING is not silently omitted when the MCP subprocess starts (P0.5 e2e)

---

## [3.4.3] - 2026-06-18

### ✨ Features
- Shipped `xray/features.json` template: `inference_governance` + `memory_routing` **disabled by default** (opt-in via `@0xray/repertoire`)
- `govern_proposals` `require_external` defaults align with `inference_governance.enabled`
- Postinstall prefers `xray/` template over dev `.xray/` runtime copy

### 🐛 Bug Fixes
- `prepublishOnly` keeps `.d.ts` in dist (strips source maps only)
- CI: `main` branch, blocking codex-check, consumer smoke on PR

### 📚 Documentation
- README: thinDispatch documented in nucleus (`0xray/nucleus`), not orchestrator MCP tools

---

## [3.4.2] - 2026-06-18

### ✨ Features
- **Ironclad Grok hooks** — PreToolUse stdin contract, codex pattern blocks, spawn_subagent gate, `activity.log` via `grok-hook-activity.js`
- **SessionStart + UserPromptSubmit** — `session-start.js` writes `.xray/state/session-boot.json`
- **Lead-dev plan persist** — `analyze-complexity` persists `.xray/state/lead-dev-plan.json` via `autonomy-kernel`
- **Codex term 69** — No New Surface Without Consolidation (blocking)
- **package.json `xray` field** — `dist` + `mcpServersPath` for consumer server-config-registry
- Memory routing provider enabled with live feedback session
- Blocking release docs freshness guard (`validate-release-docs.mjs`)

### 🐛 Bug Fixes
- `server-config-registry` resolves `name === "0xray"` without requiring `xray` field
- Ship `features.json` in npm package for `memory_routing`
- Pre-publish guard: correct git porcelain parsing, ignore `.xray/inference` runtime state

---

## [3.4.1] - 2026-06-18

### ✨ Features
- Unified 4-platform bridge installer (`install-bridges.cjs`) runs on consumer `npm i 0xray` postinstall — OpenCode, Grok, Hermes, OpenClaw
- All 7 MCP servers registered via `npx -y 0xray mcp <cmd>` (no brittle `dist/` paths)
- `npx 0xray grok install` aligned with postinstall: 7 servers via npx, idempotent skill/MCP sync on re-run
- Grok skills synced to both `~/.grok/plugins/0xray/skills/` and `~/.grok/skills/` (Grok Build / Cursor)
- Canonical `release.mjs` pipeline: reconcile-version → release-gate → artifacts → tag → publish
- Consumer smoke gate (`release-gate.mjs`) — pack, clean install, verify 7 MCP + 4 bridges

### 🐛 Bug Fixes
- `setup.cjs` consumer detection uses `isConsumerInstall()` — works for both `node_modules/0xray` and `node_modules/xray`
- Hermes bridge honors `XRAY_ROOT` env and `xray-consumer-root.txt` marker for correct project root resolution

### 📚 Documentation
- README, AGENTS, AGENTS-consumer, and Docusaurus synced for v3.4.1 (42 agents, 45 skills, 7 MCP servers, 68 codex terms)
- New guides: Repertoire integration, features.json reference, features since 3.1, memory routing, platform integrations
- Repertoire: `features.json` `memory_routing` config, MCP tools, confidence gate, ExecutionPlanner/thinDispatch/researcher wiring
- AsideContext guide: `spawnAside` lifecycle, observation extractors, Repertoire `inheritedContext.memoryRouting` link
- `.grok-plugin/plugin.json` version and MCP description corrected

---

## [3.4.0] - 2026-06-17

> Tagged locally; not published to npm. Superseded by 3.4.1 for consumer install.

### ✨ Features
- Governance default-on with Railway endpoint
- 10-step E2E pipeline smoketest
- Source-change governance detector with external Dynamo
- Nucleus exports (`0xray/nucleus`, `0xray/nucleus/*`) for consumer plugin-registry access
- Consumer path hygiene audit (postinstall/setup/prepare-consumer)
- Compat shim scanner (term 78), orphan pre-PR check (term 73)

### 🐛 Bug Fixes
- Codex closure: processorRoadmap 7/74/75 done, validationCriteria 6/8 true
- 2,880 tests pass, typecheck clean, 0 `console.*` in non-CLI source

---

## [3.3.1] - 2026-06-18

### ✨ Features
- Initial `install-bridges.cjs` scaffold and repertoire researcher wiring tests
- Orchestrator **confidence gate** wired into execution planning (d7910b610)

### 🐛 Bug Fixes
- Postinstall consumer detection and bridge install hooks refined

---

## [3.3.0] - 2026-06-18

### ✨ Features
- **Pluggable Memory Routing** — `MemoryRoutingProvider` interface + `features.json` `memory_routing` block
- `features.schema.json` runtime validation at load time
- Repertoire as first plug-in provider (framework repo default)
- Per-task `ingestFeedback` (not aggregate-only) for provider learning loop
- Memory routing enriches orchestrator selection, thinDispatch scoring, researcher votes
- 24 memory-routing integration tests; 3,221 tests passing (0 failures)

---

## [3.2.0] - 2026-06-17

### 🔄 Changes

### ✨ Features
- Orphan file resolution: 5 dead files deleted, ~39 files integrated under typecheck
- feat: 58 type errors fixed across 6 source files
- feat: pre-existing e2e failures fixed (OpenClaw 9/9, Grok CLI 62/0)
- feat: vitest config testTimeout added for processor-logger stability
- feat: pre-tool-use hook rewritten from skeleton to full hook with resonance/decision-matrix/JSON
- feat: SelfProposalEngine integrated under typecheck with metamorphosis type support

### 🐛 Bug Fixes
- fix: postinstall e2e version assertions (3.1.1 → 0.5.2)
- fix: AGENTS.md session entry and test assertions cleaned
- fix: enforcement-gate fallback dynamic imports `as string` cast

### ♻️ Refactoring
- chore: removed ~180 stale @version JSDoc tags from source files
- chore: cleaned stale version badges from README, AGENTS.md, docs-site docs
- chore: removed "xray 2.0" from command docs (26 files)
- chore: release.mjs checks npm view 0xray version (was xray)
- chore: release.mjs push target master → main

---

## [3.1.1] - 2026-06-16

### ✨ Features
- Complete **StringRay → 0xRay** rename; archive cleanup, skill syncing, MCP tools
- Root `.mcp.json` and `.grok-plugin/plugin.json` for xAI marketplace discovery
- Postinstall ships `AGENTS-consumer.md` → `AGENTS.md`, `.gitignore.default`, `SKILLS.md`
- AsideContext restoration + plugin module split; Hermes E2E 44/0/0
- Config consolidation, MCP base class, expanded test coverage

### 🐛 Bug Fixes
- ConfigLoader supports `mcpServers` format in `.mcp.json`
- Railway deployment: MCP host, in-process skills, Hermes OAuth decode, OAuth daemon mode
- Publish guard fixes — 4 test files, plugin build, `ConfigLoader.clearConfigPaths()`
- Remove `.opencode/xray/` fallback from auto-reflection-generator
- Pre-publish-guard handles missing `features.json`

### 🗑️ Removals
- `hermes bridge` CLI — use `npx 0xray hermes install`

---

## [3.1.0] - 2026-06-15

### 🔄 Changes

### 🐛 Bug Fixes
- fix: pre-publish-guard handles missing features.json (855e3cfdb)

---

## [3.0.14] - 2026-06-14

### 🔄 Changes

### 🐛 Bug Fixes
- fix: grok plugin dir naming, broken symlink, stale validate script refs (7bbee499c)
- fix: update integrations-e2e test for XrayAPIServer rename (b68eeb845)
- fix: exports map, openclaw XrayAPIServer rename, validator count 29→28 (035ba4986)
- fix: rename StringRay* class names to Xray* across server files and update strray-codex- internal IDs (ec1182bfb)

### 🔎 Other Changes
- v3.0.13 release fixes: main/types, files cleanup, testing-best-practices registration, e2e guards (c26e1ec28)
- v3.0.13 release: rename, test fixes, E2E postinstall config tests (177fa12c5)

---

## [3.0.13] - 2026-06-14

### 🚀 Major Release — v3 MCP-Centric Pure v2 Three-Subsystem

#### 🔄 Rename: `strray-ai` → `0xray`
- Renamed across 60+ source files, CLI help text, grok plugin, hermes-agent bridge (Python + JS), docusaurus config
- Updated `.gitignore`, `.npmignore`, package name to `0xray`
- Hermes-agent bridge backward compat: all JS/Python bridge files check for both `strray-ai` (old) and `0xray` (new)

#### 🧠 MCP-Centric Architecture
- Centered on **MCP (Model Context Protocol)** as the primary surface for agent skills
- Three agent MCP servers: `code-review`, `security-audit`, `researcher`
- YML agent declarations in `.opencode/agents/*.yml` — zero manual setup
- thinDispatch 7-flow routing in MCP orchestrator for autonomous engine

#### 🛠️ Build & Test Hardening
- **Build fix**: removed stale `.opencode/plugin/xray-codex-injection.js` copy that broke due to relative imports
- `package.json` canonical reference: `"opencode"."plugin": "./dist/plugin/xray-codex-injection.js"`
- **Fixed 8 failing test files**: class name references, missing exports, source-inspection, monkey-patch for tool extraction
- **Full suite**: 182 test files, 3113 tests, 0 failures
- **E2E**: 25 tests passing across 4 consumer platforms

#### 🧹 Technical Debt
- Cleaned AGENTS.md + README.md: rewritten v2 MCP-centric
- Dead docs git-rm'd: 12 stale doc files
- Cleaned `.gitignore` stale `.strray/` entries
- CLI help text: removed dead `dashboard` command

## [2.0.0] - 2026-06-05

### 🚀 Major Release — Pure v2 Three-Subsystem Architecture

#### 🧠 Three-Subsystem Architecture (Wired & Complete)
- feat: extract and wire CodexPolicyService as Governance SSOT for codex reads (enforcer-tools.server.ts, governance.server.ts)
- feat: wire opencode-cli-invoker into inference-cycle as Autonomous Engine process spawner
- feat: wire ProposalApplier via callback pattern into inference-cycle (git/PR execution)
- feat: add handleGetActiveCodex MCP tool to governance server (delegates to CodexPolicyService)
- feat: add strray/codex.json to resolveCodexPath() fallback candidates

#### 🛡️ Governance Pipeline Hardening
- feat: add end-to-end timeout (default 90s) to govern() with AbortController
- feat: add configurable timeoutMs and maxAbstentionThreshold to GovernOptions
- feat: add 30s timeout wrapper for callInProcessSkill() (Vercel/serverless path)

#### 🧹 Cleanup
- chore: remove aside-context.ts (160 lines, zero consumers — dead code)
- chore: update repo URLs to github.com/0xRayAI/xray
- chore: bump version to 2.0.0

#### ✅ Test Coverage
- 158 test files passing, 2822 tests, 0 failures
- 20 new tests for three-subsystem wiring (enforcer-tools, cli-invoker, proposal-applier)
- Fixed 9 failing test files (codex-validators, governance-client, mcp-servers-integration, inference-governance-integration, session-capture, integrations-e2e, context-loader)

#### 📦 Breaking Changes
- Version 2.0.0 under 0xRay org (not a merge to master)
- aside-context.ts removed (was unused)
- GovernOptions extended with timeoutMs and maxAbstentionThreshold

## [1.22.61] - 2026-05-19

### 🔄 Changes

### ✨ Features
- feat: Make Grok CLI a first-class citizen with full plugin + working governance hooks (#91) (635ff55d3)
- feat: wire govern_with_solar as the primary governance endpoint (72263a12c)
- feat: enable spawn gate monitoring mode + release reflection doc (5746fa8fc)
- feat: enable inference_governance + solar enhancement for monitoring (b4d782fa2)
- feat: wire govern_with_solar tool — real-time NOAA solar context into governance decisions (4ba49d56f)
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: robust entry-point detection for Grok stdio MCP startup — use fileURLToPath + path.resolve (9b3b42f79)
- fix: resolve tsc errors, duplicate KEEP, vortexVolume default, and consumer runner pack capture (f480905e4)
- fix: replace console.log with frameworkLogger in governance-client; propagate SolarGovernanceVoteResult through inference cycle (d1537bfae)
- fix: increase opencode spawn timeout from 60s to 300s to prevent premature timeouts during agent voting (31f0fe679)
- fix: initialize external governance in inference:run CLI command for two-oscillator governance (c187e0488)
- fix: two-oscillator governance — trust endpoint decision, remove local confidence override (caa444f98)
- fix: singleton + state management to prevent recursive agent spawning (2b2a018e5)
- fix: add centralized OpenCode spawn gate to prevent all recursive agent spawning (b8ff0e7d8)
- fix: disable auto-spawning of opencode agents to prevent runaway processes (294870376)
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### ♻️ Refactoring
- refactor: complete governance client refactor — callTool proxy, evaluateGovernance route, remove dead code (770a131cf)
- refactor: use confidenceAdjustment numeric threshold instead of solarActivityLevel string for recommendation logic (470556aa3)

### 📚 Documentation
- docs: add deep reflection on Grok CLI first-class integration journey (2026-05-19) (1651246c0)
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: sync config files to v1.22.56, add inference_governance feature block (1584fd1a9)
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

---

## [1.22.60] - 2026-05-19

### 🔄 Changes

### ✨ Features
- feat: Make Grok CLI a first-class citizen with full plugin + working governance hooks (#91) (635ff55d3)
- feat: wire govern_with_solar as the primary governance endpoint (72263a12c)
- feat: enable spawn gate monitoring mode + release reflection doc (5746fa8fc)
- feat: enable inference_governance + solar enhancement for monitoring (b4d782fa2)
- feat: wire govern_with_solar tool — real-time NOAA solar context into governance decisions (4ba49d56f)
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: resolve tsc errors, duplicate KEEP, vortexVolume default, and consumer runner pack capture (f480905e4)
- fix: replace console.log with frameworkLogger in governance-client; propagate SolarGovernanceVoteResult through inference cycle (d1537bfae)
- fix: increase opencode spawn timeout from 60s to 300s to prevent premature timeouts during agent voting (31f0fe679)
- fix: initialize external governance in inference:run CLI command for two-oscillator governance (c187e0488)
- fix: two-oscillator governance — trust endpoint decision, remove local confidence override (caa444f98)
- fix: singleton + state management to prevent recursive agent spawning (2b2a018e5)
- fix: add centralized OpenCode spawn gate to prevent all recursive agent spawning (b8ff0e7d8)
- fix: disable auto-spawning of opencode agents to prevent runaway processes (294870376)
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### ♻️ Refactoring
- refactor: complete governance client refactor — callTool proxy, evaluateGovernance route, remove dead code (770a131cf)
- refactor: use confidenceAdjustment numeric threshold instead of solarActivityLevel string for recommendation logic (470556aa3)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: sync config files to v1.22.56, add inference_governance feature block (1584fd1a9)
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

---

## [1.22.59] - 2026-05-11

### 🔄 Changes

### ✨ Features
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: disable auto-spawning of opencode agents to prevent runaway processes (294870376)
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: sync config files to v1.22.56, add inference_governance feature block (1584fd1a9)
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

---

## [1.22.58] - 2026-05-11

### 🔄 Changes

### ✨ Features
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: sync config files to v1.22.56, add inference_governance feature block (1584fd1a9)
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

---

## [1.22.57] - 2026-05-11

### 🔄 Changes

### ✨ Features
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

### 🔎 Other Changes
- Address: Bug: fix: increase timeout for processor auto-discovery tests to prevent flak... (112x) (02d8fa97f)
- v1.22.55 (c34376720)
- v1.22.53 (6ddf31de5)
- v1.22.51 (3d96823ff)

---

## [1.22.56] - 2026-05-11

### 🔄 Changes

### ✨ Features
- feat: integrate chrono-warp-drive governance MCP for inference checking (a61cd6f02)
- feat: add auto-rotation to activity logger at 5MB threshold (ee6a4da4c)
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: update strray-ai to v1.22.55, add vote scripts and reflection (13280fd4c)
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

### 🔎 Other Changes
- Address: Bug: fix: increase timeout for processor auto-discovery tests to prevent flak... (112x) (02d8fa97f)
- v1.22.55 (c34376720)
- v1.22.53 (6ddf31de5)
- v1.22.51 (3d96823ff)

---

## [1.22.55] - 2026-05-08

### 🔄 Changes

### ✨ Features
- feat: wire 3 orphaned features + add tests + remove empty api-gateway (077b8dc33)
- feat: wire apply phase via MCP routing + fix e2e tests (41/41 PASS) (db8abef39)
- feat: wire apply phase for real code changes instead of markdown markers (f1903187f)
- feat: add centralized TraceContext + integrate Reflection Governance with ValidatorRegistry (1a79c8818)
- feat: implement governance-approved stagger + trace propagation, add reflection governance pipeline (27d6e29e3)
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: remove unused imports and any type from processor-manager.interfaces.test.ts (processor-test-rules ESLint) (529d3d228)
- fix: address all open bugs (#29-32, #34) and prevent noise PRs from inference cycle (c32d711c3)
- fix: remove enforcer references from integration test, add fetch-depth:0 for e2e git tests (deb49f4dd)
- fix: triage and fix all GitHub workflow pipelines (097b48c7c)
- fix: restore package.json, mcp-install.ts, workflows, and govern-reflection.mjs gutted by 84dae31b1 (7417fd63c)
- fix: add npm audit fix to main CI workflow (84dae31b1)
- fix: run npm audit fix to resolve moderate vulnerabilities (314cc0619)
- fix: remove duplicate case undefined in mcp-install.ts (lint error) (9b713b93e)
- fix: make trace-context more robust + fix ESM issues in govern-reflection (e665442f4)
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: add apply phase design — real code changes via MCP routing (8eab05057)
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 👷 CI/CD
- ci: improve ci-cd-monitor.yml - better error handling + governance integration (a095f1701)
- ci: improve all workflows - add caching, coverage, security hardening, and new governance test step (05a8c08d4)

### 🔧 Maintenance
- chore: trigger ci-cd-monitor with force_fix=true (b36970ff1)
- chore: trigger monitoring script (0dddd302d)
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### ⏪ Reverts
- revert: roll back apply phase marker system — needs real agent invocation via plugin/MCP routing (10309b23a)

### 🔎 Other Changes
- v1.22.53 (6ddf31de5)
- v1.22.51 (3d96823ff)

---

## [1.22.53] - 2026-05-06

### 🔄 Changes

### ✨ Features
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: UVM sync v1.22.52 — all version references updated (ce3b70eba)
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### 🔎 Other Changes
- v1.22.51 (3d96823ff)

---

## [1.22.52] - 2026-05-06

### 🔄 Changes

### ✨ Features
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: UVM sync to v1.22.51 (b53a5ac10)
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

### 🔎 Other Changes
- v1.22.51 (3d96823ff)

---

## [1.22.51] - 2026-05-06

### 🔄 Changes

### ✨ Features
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: agent registry cleanup — remove skill-only entries, delete deprecated agents (1cafc3a68)
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

---

## [1.22.50] - 2026-05-06

### 🔄 Changes

### ✨ Features
- feat: wire apply phase + researcher double-check for PRs (7bfa4ca6e)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (fca44e6ef)
- feat: unify governance — wire WeightedVotingAggregator, expand agents, connect orchestrator (191536d9f)
- feat: lower inference thresholds to trigger on real data, keep raw problem text (c7c09a4d7)
- feat: production-ready inference governance — CLI, real agents, DI, learning loop (501eb8d65)
- feat: inference layer — semantic patterns, session capture, accumulator, governance cycle, deploy verifier (5963ce170)

### 🐛 Bug Fixes
- fix: agent export naming + single-architect governance (b5c6100ec)
- fix: complete inference-cycle.ts — all fixes applied. (cef1ecd12)
- fix: guard inference:run for StringRay internal use only (beefefb94)
- fix: governance pipeline — force flag, skipDeployVerify default, deploy failure handling (40ae8ae4f)
- fix: increase timeout for processor auto-discovery tests to prevent flaky failures (baae75541)
- fix: inference processor double-joining absolute path created bogus Users/ dir (a795635f9)

### 📚 Documentation
- docs: deep reflection — inference apply phase journey (honest assessment) (1a05086af)
- docs: governance unification saga — deep reflection on wiring four systems into one loop (9cd5b8bc1)
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

---

## [1.22.49] - 2026-04-29

### 🔄 Changes

### 📚 Documentation
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: v1.22.48, add prepublishOnly to strip source maps and declarations (112ef8977)
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

---

## [1.22.48] - 2026-04-29

### 🔄 Changes

### 📚 Documentation
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: v1.22.47, add .npmignore to strip .d.ts and source maps from package (e2f722523)
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

---

## [1.22.47] - 2026-04-29

### 🔄 Changes

### 📚 Documentation
- docs: the engine that built the engine — deep reflection on the meta-system, consumer tweet, release reflection (522c28b9a)

### 🔧 Maintenance
- chore: remove 92 build artifacts (.d.ts, .d.ts.map) from .opencode git tracking, add to .gitignore (22f9ddfd9)
- chore: rebuild dist after path fix (4453c41c7)

---

## [1.22.44] - 2026-04-29

### 🔄 Changes

### ✨ Features
- feat: fortress build — 96 processor tests, DI auto-discovery, DocWriteGuard, structural inference, processor consolidation (6fc30f8ca)

### 🐛 Bug Fixes
- fix: remove circular self-dep, delete 375 lines dead code, append-only docs, version sync script, upgrade stubs (69ce59696)

### 📚 Documentation
- docs: deep reflection — the day 0xray learned to talk (5400 words) (75e1a9389)

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.43] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.42] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.41] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.40] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.39] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: sync .strray (1b32155c2)
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.38] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: rebuild dist v1.22.37 (4d1035b7a)
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.37] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.36: processor extraction complete, dist rebuilt (d27069c05)
- v1.22.35: rebuild dist, version sync (615b16d0b)
- v1.22.34: extract 24 inline execute methods from processor-manager into standalone BaseProcessor files (1836→823 lines) (ce3893a40)
- v1.22.32: sync version for next development cycle (b90315d47)
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.36] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.35: rebuild dist, version sync (615b16d0b)
- v1.22.34: extract 24 inline execute methods from processor-manager into standalone BaseProcessor files (1836→823 lines) (ce3893a40)
- v1.22.32: sync version for next development cycle (b90315d47)
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.35] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.34: extract 24 inline execute methods from processor-manager into standalone BaseProcessor files (1836→823 lines) (ce3893a40)
- v1.22.32: sync version for next development cycle (b90315d47)
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.34] - 2026-04-29

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.32: sync version for next development cycle (b90315d47)
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.33] - 2026-04-28

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.32: sync version for next development cycle (b90315d47)
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.32] - 2026-04-28

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

### 🔎 Other Changes
- v1.22.31: processor registry pattern, auto-reflection generation, report formatter fixes, 36 new tests (2569 total) (2d71dbf67)

---

## [1.22.31] - 2026-04-28

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.30] - 2026-04-28

### 🔄 Changes

### 🔧 Maintenance
- chore: update activity logs and test results (dcb5bf018)

---

## [1.22.25] - 2026-04-28

### 🔄 Changes

### 🔎 Other Changes
- release: v1.22.24 - OpenClaw compilation fix (f3cd8ccee)
- release: v1.22.23 (7c512366b)
- release: v1.22.22 - OpenClaw TypeScript compilation fix, integration test scripts (3bcbb8969)

---

## [1.22.24] - 2026-04-27

### 🔄 Changes

### 🔎 Other Changes
- release: v1.22.23 (7c512366b)
- release: v1.22.22 - OpenClaw TypeScript compilation fix, integration test scripts (3bcbb8969)

---

## [1.22.23] - 2026-04-27

### 🔄 Changes

### 🔎 Other Changes
- release: v1.22.22 - OpenClaw TypeScript compilation fix, integration test scripts (3bcbb8969)

---

## [1.22.22] - 2026-04-27

### 🔄 Changes

- Version bump

---

## [1.22.20] - 2026-04-27

### 🔄 Changes

- Version bump

---

## [1.22.19] - 2026-04-27

### 🔄 Changes

- Version bump

---

## [1.22.18] - 2026-04-27

### 🔄 Changes

### 🐛 Bug Fixes
- fix: add validate script and hooks to dist/scripts, include mcps registry in build (fc059458e)
- fix: add mcps directory to build, fix MCP registry path resolution (c17ca67e9)

---

## [1.22.18] - 2026-04-27

### 🔄 Changes

### 🐛 Bug Fixes
- fix: add mcps directory to build, fix MCP registry path resolution (c17ca67e9)

---

## [1.22.17] - 2026-04-27

### 🔄 Changes

- Version bump

---

## [1.22.16] - 2026-04-27

### 🔄 Changes

- Version bump

---

## [1.22.15] - 2026-04-27

### 🔄 Changes

### ✨ Features
- feat: add Nudge Watchdog for stuck AI pattern detection (f923265a1)
- feat: add community MCP registry and mcp:install command (d0f45a86b)
- feat: comprehensive validation + context-aware reflection hook (194a0e6e9)

### 🐛 Bug Fixes
- fix: opencode.json now replaces 0xRay agents, keeps other settings (d9a969423)
- fix: add smart merge for opencode.json on npm install (0f73ead02)

### 📚 Documentation
- docs: update MCP commands with setup instructions (2b362d390)
- docs: remove duplicate sections from system-design (b548bdf4d)
- docs: consolidate duplicate 'What is 0xRay' sections (4afb17c32)
- docs: add honest 'what is 0xRay' assessment (00c1fd4a8)
- docs: add honest differentiation section to system-design (174afe0b3)
- docs: update system-design with full diagram v1.22.14 (7ea1d3598)

### 🔧 Maintenance
- chore: add mcp commands to CLI (3db119fbf)

---

## [1.22.13] - 2026-04-22

### 🔄 Changes

### ✨ Features
- feat: deprecate enforcer/orchestrator, add voting/metrics/security systems (0a73bcda7)
- feat: production-ready MCPs, complete documentation, fixed pipeline tests (6f62a5cda)

### 🐛 Bug Fixes
- fix: memory leaks, ES6 imports, production readiness (f0f87937a)
- fix: kernel-routing pipeline test inputs, complete all 22 pipelines (6d0a7ced5)
- fix: pipeline runner cwd, ESM require, missing processors, version config (44754822c)

### ♻️ Refactoring
- refactor: cleanup dead modules, archive unused docs, update all docs to match code (3bb55c65e)
- refactor: eliminate any types, add proper TypeScript interfaces (d88c37e10)

### 📚 Documentation
- docs: clarify plugin execution path in code comments (b87c2a483)

### 🔧 Maintenance
- chore: update .gitignore with temp files (9435b17e1)
- chore: cleanup dead code and temp files (a3471683e)

---

## [1.22.2] - 2026-04-07

### 🔄 Changes

Fix npm publish

---

## [1.22.1] - 2026-04-07

### 🔄 Changes

Hotfix

---

## [1.22.0] - 2026-04-07

### 🔄 Changes

Plugin system - hot-reload, npm install, auto-discovery, CLI, example plugin

---

## [1.21.0] - 2026-04-07

### 🔄 Changes

Plugin system major release

---

## [1.20.0] - 2026-04-07

### 🔄 Changes

Plugin system - hot-reload, npm install, auto-discovery, CLI, example plugin

---

## [1.19.1] - 2026-04-07

### 🔄 Changes

Release patch - fix npm publish version conflict

---

## [1.19.0] - 2026-04-07

### 🔄 Changes

Plugin system enhancements - hot-reload, npm install, example plugin

---

## [1.18.6] - 2026-04-01

### 🔄 Changes

### ✨ Features
- feat: add storyteller CLI command and register processor (8d6f5123a)
- feat: add storyteller enforcement for reflections/sagas (6198b74ab)
- feat: add CI report generator script (732a94d83)
- feat: add publish and commit_cycle config to features.json, update processors (f7948df70)
- feat: add publish preflight processor - validates docs, reflections, pipelines before publish (f9402f624)

### 🐛 Bug Fixes
- fix: correct artifact prefix paths in pre-publish-guard.js (bb7fdd7f7)
- fix: add storytelling config to .opencode/strray/features.json (2c38937b9)
- fix: copy all src/skills and src/integrations non-TS files to dist for consumer mode (4259ea141)
- fix: copy skills/registry.json and integrations configs to dist for consumer mode (19f583fc8)
- fix: add readme field to package.json for npm (034891c18)
- fix: copy README/docs to dist for npm publish (faa9e3af3)
- fix: convert all pipeline tests to ESM imports - use readFileSync/existsSync instead of require('fs') (ffee9746b)
- fix: JSON syntax error in features.json - duplicate require_reflection key (f70ebde01)
- fix: commit_cycle config - remove max_files_per_commit, change reflection to count by commits (aacf0b924)
- fix: pipeline test requirement now reads exact count from PIPELINE_INVENTORY.md (f900f7aa0)
- fix: pipeline test count reads from PIPELINE_INVENTORY.md - counts all discoverable pipelines (45a282498)
- fix: implement 8 placeholder validators - deployment safety, multi-agent, substrate, framework self-validation, emergent improvement, debug logs, performance regression, security vulnerability reporting (446f12d2b)
- fix: activate dormant processors - spawnGovernance, performanceBudget, asyncPattern, consoleLogGuard; add CI enforcement gate (b08068b9a)
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 📚 Documentation
- docs: enhance AGENTS.md storyteller section with enforcement details (cce78f12b)
- docs: add plan for enforcing storyteller skill for reflections/sagas (47859dccd)
- docs: add saga documenting journey from v1.15.40 to v1.18.2 (45b39e037)
- docs: add versioned deep system reflection (4eb98cb41)
- docs: add deep system reflection - the journey from plugin to agent OS (9a88868d4)

### 🧪 Tests
- test: add 11 new pipeline tests - complete coverage of all discoverable pipelines (61dd11695)
- test: add 3 new sub-pipeline tests - enforcement, MCP-server, inference; docs: update pipeline inventory, add sub-pipeline discovery guide (1b004586c)
- test: add CLI and MCP-Server pipelines to test suite, fix removed install.cjs tests (71c2ba153)

### 🔧 Maintenance
- chore: version sync v1.15.41 (cc549e2d0)
- chore: version sync artifacts for v1.15.41 (1c6a3c5dc)
- chore: bump UVM to 1.15.41 (21cfabc8e)
- chore: version sync artifacts for v1.15.40 (505ac3140)
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

### 🔎 Other Changes
- release: v1.18.2 - fix consumer file copying, add readme field (c28617bad)
- release: v1.18.0 - publish pipeline, CI report generator, ESM fixes (cb4ac2e1b)
- release: bump to v1.17.0 (9ae9d7725)
- Revert "chore: version sync artifacts for v1.15.41" (dd01f27f0)

---

## [1.18.5] - 2026-04-01

### 🔄 Changes

### ✨ Features
- feat: add storyteller enforcement for reflections/sagas (6198b74ab)
- feat: add CI report generator script (732a94d83)
- feat: add publish and commit_cycle config to features.json, update processors (f7948df70)
- feat: add publish preflight processor - validates docs, reflections, pipelines before publish (f9402f624)

### 🐛 Bug Fixes
- fix: add storytelling config to .opencode/strray/features.json (2c38937b9)
- fix: copy all src/skills and src/integrations non-TS files to dist for consumer mode (4259ea141)
- fix: copy skills/registry.json and integrations configs to dist for consumer mode (19f583fc8)
- fix: add readme field to package.json for npm (034891c18)
- fix: copy README/docs to dist for npm publish (faa9e3af3)
- fix: convert all pipeline tests to ESM imports - use readFileSync/existsSync instead of require('fs') (ffee9746b)
- fix: JSON syntax error in features.json - duplicate require_reflection key (f70ebde01)
- fix: commit_cycle config - remove max_files_per_commit, change reflection to count by commits (aacf0b924)
- fix: pipeline test requirement now reads exact count from PIPELINE_INVENTORY.md (f900f7aa0)
- fix: pipeline test count reads from PIPELINE_INVENTORY.md - counts all discoverable pipelines (45a282498)
- fix: implement 8 placeholder validators - deployment safety, multi-agent, substrate, framework self-validation, emergent improvement, debug logs, performance regression, security vulnerability reporting (446f12d2b)
- fix: activate dormant processors - spawnGovernance, performanceBudget, asyncPattern, consoleLogGuard; add CI enforcement gate (b08068b9a)
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 📚 Documentation
- docs: add plan for enforcing storyteller skill for reflections/sagas (47859dccd)
- docs: add saga documenting journey from v1.15.40 to v1.18.2 (45b39e037)
- docs: add versioned deep system reflection (4eb98cb41)
- docs: add deep system reflection - the journey from plugin to agent OS (9a88868d4)

### 🧪 Tests
- test: add 11 new pipeline tests - complete coverage of all discoverable pipelines (61dd11695)
- test: add 3 new sub-pipeline tests - enforcement, MCP-server, inference; docs: update pipeline inventory, add sub-pipeline discovery guide (1b004586c)
- test: add CLI and MCP-Server pipelines to test suite, fix removed install.cjs tests (71c2ba153)

### 🔧 Maintenance
- chore: version sync v1.15.41 (cc549e2d0)
- chore: version sync artifacts for v1.15.41 (1c6a3c5dc)
- chore: bump UVM to 1.15.41 (21cfabc8e)
- chore: version sync artifacts for v1.15.40 (505ac3140)
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

### 🔎 Other Changes
- release: v1.18.2 - fix consumer file copying, add readme field (c28617bad)
- release: v1.18.0 - publish pipeline, CI report generator, ESM fixes (cb4ac2e1b)
- release: bump to v1.17.0 (9ae9d7725)
- Revert "chore: version sync artifacts for v1.15.41" (dd01f27f0)

---

## [1.18.4] - 2026-04-01

### 🔄 Changes

### ✨ Features
- feat: add storyteller enforcement for reflections/sagas (6198b74ab)
- feat: add CI report generator script (732a94d83)
- feat: add publish and commit_cycle config to features.json, update processors (f7948df70)
- feat: add publish preflight processor - validates docs, reflections, pipelines before publish (f9402f624)

### 🐛 Bug Fixes
- fix: copy all src/skills and src/integrations non-TS files to dist for consumer mode (4259ea141)
- fix: copy skills/registry.json and integrations configs to dist for consumer mode (19f583fc8)
- fix: add readme field to package.json for npm (034891c18)
- fix: copy README/docs to dist for npm publish (faa9e3af3)
- fix: convert all pipeline tests to ESM imports - use readFileSync/existsSync instead of require('fs') (ffee9746b)
- fix: JSON syntax error in features.json - duplicate require_reflection key (f70ebde01)
- fix: commit_cycle config - remove max_files_per_commit, change reflection to count by commits (aacf0b924)
- fix: pipeline test requirement now reads exact count from PIPELINE_INVENTORY.md (f900f7aa0)
- fix: pipeline test count reads from PIPELINE_INVENTORY.md - counts all discoverable pipelines (45a282498)
- fix: implement 8 placeholder validators - deployment safety, multi-agent, substrate, framework self-validation, emergent improvement, debug logs, performance regression, security vulnerability reporting (446f12d2b)
- fix: activate dormant processors - spawnGovernance, performanceBudget, asyncPattern, consoleLogGuard; add CI enforcement gate (b08068b9a)
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 📚 Documentation
- docs: add plan for enforcing storyteller skill for reflections/sagas (47859dccd)
- docs: add saga documenting journey from v1.15.40 to v1.18.2 (45b39e037)
- docs: add versioned deep system reflection (4eb98cb41)
- docs: add deep system reflection - the journey from plugin to agent OS (9a88868d4)

### 🧪 Tests
- test: add 11 new pipeline tests - complete coverage of all discoverable pipelines (61dd11695)
- test: add 3 new sub-pipeline tests - enforcement, MCP-server, inference; docs: update pipeline inventory, add sub-pipeline discovery guide (1b004586c)
- test: add CLI and MCP-Server pipelines to test suite, fix removed install.cjs tests (71c2ba153)

### 🔧 Maintenance
- chore: version sync v1.15.41 (cc549e2d0)
- chore: version sync artifacts for v1.15.41 (1c6a3c5dc)
- chore: bump UVM to 1.15.41 (21cfabc8e)
- chore: version sync artifacts for v1.15.40 (505ac3140)
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

### 🔎 Other Changes
- release: v1.18.2 - fix consumer file copying, add readme field (c28617bad)
- release: v1.18.0 - publish pipeline, CI report generator, ESM fixes (cb4ac2e1b)
- release: bump to v1.17.0 (9ae9d7725)
- Revert "chore: version sync artifacts for v1.15.41" (dd01f27f0)

---

## [1.18.3] - 2026-04-01

### 🔄 Changes

### ✨ Features
- feat: add CI report generator script (732a94d83)
- feat: add publish and commit_cycle config to features.json, update processors (f7948df70)
- feat: add publish preflight processor - validates docs, reflections, pipelines before publish (f9402f624)

### 🐛 Bug Fixes
- fix: copy all src/skills and src/integrations non-TS files to dist for consumer mode (4259ea141)
- fix: copy skills/registry.json and integrations configs to dist for consumer mode (19f583fc8)
- fix: add readme field to package.json for npm (034891c18)
- fix: copy README/docs to dist for npm publish (faa9e3af3)
- fix: convert all pipeline tests to ESM imports - use readFileSync/existsSync instead of require('fs') (ffee9746b)
- fix: JSON syntax error in features.json - duplicate require_reflection key (f70ebde01)
- fix: commit_cycle config - remove max_files_per_commit, change reflection to count by commits (aacf0b924)
- fix: pipeline test requirement now reads exact count from PIPELINE_INVENTORY.md (f900f7aa0)
- fix: pipeline test count reads from PIPELINE_INVENTORY.md - counts all discoverable pipelines (45a282498)
- fix: implement 8 placeholder validators - deployment safety, multi-agent, substrate, framework self-validation, emergent improvement, debug logs, performance regression, security vulnerability reporting (446f12d2b)
- fix: activate dormant processors - spawnGovernance, performanceBudget, asyncPattern, consoleLogGuard; add CI enforcement gate (b08068b9a)
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 📚 Documentation
- docs: add plan for enforcing storyteller skill for reflections/sagas (47859dccd)
- docs: add saga documenting journey from v1.15.40 to v1.18.2 (45b39e037)
- docs: add versioned deep system reflection (4eb98cb41)
- docs: add deep system reflection - the journey from plugin to agent OS (9a88868d4)

### 🧪 Tests
- test: add 11 new pipeline tests - complete coverage of all discoverable pipelines (61dd11695)
- test: add 3 new sub-pipeline tests - enforcement, MCP-server, inference; docs: update pipeline inventory, add sub-pipeline discovery guide (1b004586c)
- test: add CLI and MCP-Server pipelines to test suite, fix removed install.cjs tests (71c2ba153)

### 🔧 Maintenance
- chore: version sync v1.15.41 (cc549e2d0)
- chore: version sync artifacts for v1.15.41 (1c6a3c5dc)
- chore: bump UVM to 1.15.41 (21cfabc8e)
- chore: version sync artifacts for v1.15.40 (505ac3140)
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

### 🔎 Other Changes
- release: v1.18.2 - fix consumer file copying, add readme field (c28617bad)
- release: v1.18.0 - publish pipeline, CI report generator, ESM fixes (cb4ac2e1b)
- release: bump to v1.17.0 (9ae9d7725)
- Revert "chore: version sync artifacts for v1.15.41" (dd01f27f0)

---

## [1.15.41] - 2026-04-01

### 🔄 Changes

### 🐛 Bug Fixes
- fix: activate dormant processors - spawnGovernance, performanceBudget, asyncPattern, consoleLogGuard; add CI enforcement gate (b08068b9a)
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 🔧 Maintenance
- chore: version sync artifacts for v1.15.41 (1c6a3c5dc)
- chore: bump UVM to 1.15.41 (21cfabc8e)
- chore: version sync artifacts for v1.15.40 (505ac3140)
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

### 🔎 Other Changes
- Revert "chore: version sync artifacts for v1.15.41" (dd01f27f0)

---

## [1.15.40] - 2026-03-31

### 🔄 Changes

### 🐛 Bug Fixes
- fix: add Node.js type declarations to tsconfig (40cdf34bb)
- fix: implement keyword-based routing in getTaskRoutingRecommendation (0ca8a9ea1)

### 🔧 Maintenance
- chore: bump UVM to 1.15.40 (3b07094f7)
- chore: version sync artifacts for v1.15.39 (2a5b4d7cd)
- chore: bump UVM to 1.15.39 (3a51e70ac)

---

## [1.15.39] - 2026-03-31

### 🔄 Changes

### 🔧 Maintenance
- chore: bump UVM to 1.15.39 (3a51e70ac)

---

## [1.15.38] - 2026-03-31

### 🔄 Changes

### 🐛 Bug Fixes
- fix: skill-install always tries gh first, supports bare repo names, symlink .opencode/skills -> .strray/skills (40abe23cd)
- fix: properly detect console.log in comments - line-by-line check (1046b8bd4)
- fix: pre-publish-guard.js uses createRequire for ESM compat (94d57ceba)

### 🔧 Maintenance
- chore: remove main branch references, point all docs to master (683e58799)
- chore: bump UVM to 1.15.38 (658fac590)
- chore: version sync artifacts for v1.15.37 (a11e459d5)

---

## [1.15.37] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: plugin dynamic import path resolution breaks in Docker/container environments (#26) (518a67a0d)

### 🔧 Maintenance
- chore: bump UVM to 1.15.37 (7ca44e193)
- chore: version sync artifacts for v1.15.36 (7c61f5232)

---

## [1.15.36] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: init.sh fallback for Hermes consumers + prioritize gh in skill:install (#25) (6e2121bd1)

### 🔧 Maintenance
- chore: version sync artifacts for v1.15.35, bump UVM to 1.15.36 (d70f3db42)

---

## [1.15.35] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: ship .opencode/init.sh in npm package (da1cc665b)

### 🔧 Maintenance
- chore: bump UVM to 1.15.35 (f349dce07)
- chore: version sync artifacts for v1.15.34 (eddc46f64)

### 🔎 Other Changes
- Merge pull request #24 from htafolla/fix/init-sh-missing-from-npm (f93111d15)

---

## [1.15.34] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: bridge enforcement wiring, dedup helpers, version alignment (6481e09ef)

### 🔧 Maintenance
- chore: bump UVM to 1.15.34 + version sync artifacts (0dab64a2b)

### 🔎 Other Changes
- Merge pull request #23 from htafolla/fix/hermes-bridge-enforcement-and-cleanup (048e66fa3)

---

## [1.15.33] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: add node_modules candidate paths for consumer env imports (fd289e4f6)

### 🔧 Maintenance
- chore: bump UVM to 1.15.33 (5a773d42b)
- chore: version sync artifacts (6df9eb63b)

### 🔎 Other Changes
- Merge pull request #22 from htafolla/fix/consumer-node-modules-candidates (c32e97cbe)

---

## [1.15.32] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: remove 3 phantom lifecycle hooks that don't exist in the host (932270ac6)

### 🔧 Maintenance
- chore: version sync artifacts (0bf9c7c44)
- chore: bump UVM to 1.15.32 (54596d9ca)

### 🔎 Other Changes
- Merge pull request #21 from htafolla/fix/remove-phantom-hooks (cdf4d2059)

---

## [1.15.31] - 2026-03-30

### 🔄 Changes

### 🔎 Other Changes
- fix prepare-consumer regex, clean dist artifacts (63165ba65)
- fix double-escaped regex in prepare-consumer (7b658fbdb)

---

## [1.15.30] - 2026-03-30

### 🔄 Changes

### 🔧 Maintenance
- chore: bump UVM to 1.15.30, version sync artifacts for v1.15.29 (876f79ea6)

### 🔎 Other Changes
- remove marketplace stub, rename plugins→plugin, archive dead quality-gate (04ef266d0)

---

## [1.15.29] - 2026-03-30

### 🔄 Changes

### 🔧 Maintenance
- chore: archive 217 stale scripts, fix postinstall .strray symlink, remove dead pkg refs (2f35dab56)
- chore: v1.15.28 version sync artifacts, bump UVM to 1.15.29 (2404907f1)

---

## [1.15.28] - 2026-03-30

### 🔄 Changes

### ✨ Features
- feat: postinstaller installs all 4 git hooks (pre-commit, post-commit, pre-push, post-push) (7ec26177d)

### 🐛 Bug Fixes
- fix: Hermes consumer cleanup — skip .opencode/, fix bridge state dir (8c1751bcf)
- fix: add 14 missing agents to opencode.json (c88bce973)
- fix: eliminate all hardcoded config paths — centralize on config-paths resolver (715541d80)
- fix: eliminate hardcoded config paths — use config-paths resolver throughout (40121d2d7)
- fix: agents_template.md not found in consumer installs + add missing routing-mappings.json (dda25b90e)
- fix: resolve stale version display and add missing report CLI flags (6bf18b53a)

### 📚 Documentation
- docs: fix stale .opencode/state path in README — .strray/state/ (a2519e889)
- docs: deep reflection — the invisible .mjs build gap (v1.15.27) (b8c5f3680)

### 🔧 Maintenance
- chore: remove all references to deleted .opencode/OpenCode.json (16111ec54)
- chore: bump UVM to 1.15.28 + sync .strray artifacts (dcf60eb73)

### 🔎 Other Changes
- Merge pull request #20 from htafolla/fix/minor-issues-v1.15.27 (6ec4d8b7d)

---

## [1.15.27] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: copy .mjs files to dist in build script (28efc9fbb)

### 🔧 Maintenance
- chore: bump UVM to 1.15.27 (45a210e42)

### 🔎 Other Changes
- Merge pull request #19 from htafolla/fix/mjs-copy-build (400bf6daa)
- v1.15.26 (730e61701)

---

## [1.15.26] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: wire enforcement validators into codex-check bridge command (#18) (9ef222d9a)
- fix: prevent self-referencing .strray symlink in dev repo (e3d2a7c09)

### 📦 Builds
- build: consumer artifacts for v1.15.25 (c7dfe5eb3)

### 🔧 Maintenance
- chore: bump UVM to 1.15.26 (3804272a9)

---

## [1.15.25] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: server.ts regression, plugin imports, stale plugin copy, config hook guard (6f6194063)

---

## [1.15.24] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: stale plugin copy caused 3-4x init.sh + server.ts regression + import consistency (e955df3a6)

### 📦 Builds
- build: consumer artifacts for v1.15.23 (001bf5616)

---

## [1.15.23] - 2026-03-30

### 🔄 Changes

### 🐛 Bug Fixes
- fix: plugin config hook fires 4x during startup + publish lifecycle fixes (a863cdf77)

### 📦 Builds
- build: consumer artifacts for v1.15.22 (82884591c)

---

## [1.15.22] - 2026-03-30

### 🔄 Changes

### ✨ Features
- feat: decouple framework from OpenCode — fully headless mode (305d4df52)

### 🐛 Bug Fixes
- fix: init.sh dedup guard, plugin framework-logger dynamic import, delegation barrel exports (fdfe643f7)

### 📦 Builds
- build: consumer artifacts for v1.15.19 (c72b53279)

### 🔧 Maintenance
- chore: fix .strray from broken symlink to real dir (d382e7740)
- chore: UVM bump to 1.15.21, fix .strray symlink to real dir (e3f363a1a)

### 🔎 Other Changes
- Merge pull request #17 from htafolla/fix/init-dedup-plugin-logger-delegation-exports (fe6b902d2)
- Merge pull request #16 from htafolla/fix/opencode-decouple-headless (f7ba93b36)
- merge: resolve version conflict — keep 1.15.20 (5de7c68c9)

---

## [1.15.19] - 2026-03-29

### 🔄 Changes

### ✨ Features
- feat: record routing outcomes on every tool call in both plugins (9bace72fd)
- feat: auto inference tuning every 100 tool calls in both plugins (c5fdfc1f5)
- feat: activate inference feedback loop — analytics pipeline now writes back (f2a3f34ef)
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: security hardening, path traversal, code injection, auth bypass, repo hygiene, test cleanup (#13) (#13) (0af058e66)
- fix: state persistence path, enforcer blocked logic, console bleed, test fixes, subagent enforcement (#12) (044a0e393)
- fix: resolve config-paths.js import failure from .opencode/plugins/ (a365843e9)
- fix: UVM version corruption, delete 42 stub test files (509b5ac39)
- fix: add express dep, version sync, bridge codex dedup, repo cleanup (f9c3dd96d)
- fix: post-merge cleanup — deps, index.ts, pipelines, root artifacts (bcbc31b01)
- fix: merge PR #11 fixes — bugs, security, dead code, version (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### ♻️ Refactoring
- refactor: replace console.* with frameworkLogger across 36 production files (293b51827)

### 📚 Documentation
- docs: deep reflection — inference feedback loop activation (581bf11e8)

### 🔧 Maintenance
- chore: rebuild dist after console.* cleanup (07e4a6872)
- chore: update performance-baselines.json (8f791388f)
- chore: sync performance baselines (3c1e6f647)
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

---

## [1.15.18] - 2026-03-29

### 🔄 Changes

### 🐛 Bug Fixes
- fix: state persistence path, enforcer blocked logic, console bleed, test fixes, subagent enforcement (#12) (044a0e3)

### 🔧 Maintenance
- chore: rebuild dist after console.* cleanup (07e4a68)

---

## [1.15.17] - 2026-03-29

### 🔄 Changes

### ✨ Features
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: resolve config-paths.js import failure from .opencode/plugins/ (a365843e9)
- fix: UVM version corruption, delete 42 stub test files (509b5ac39)
- fix: add express dep, version sync, bridge codex dedup, repo cleanup (f9c3dd96d)
- fix: post-merge cleanup — deps, index.ts, pipelines, root artifacts (bcbc31b01)
- fix: merge PR #11 fixes — bugs, security, dead code, version (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### ♻️ Refactoring
- refactor: replace console.* with frameworkLogger across 36 production files (293b51827)

### 🔧 Maintenance
- chore: update performance-baselines.json (8f791388f)
- chore: sync performance baselines (3c1e6f647)
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

### 🔎 Other Changes
- release: v1.15.15 (ed0e26699)
- release: v1.15.14 (98df6004c)
- release: v1.15.13 (c055785f3)

---

## [1.15.16] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: UVM version corruption, delete 42 stub test files (509b5ac39)
- fix: add express dep, version sync, bridge codex dedup, repo cleanup (f9c3dd96d)
- fix: post-merge cleanup — deps, index.ts, pipelines, root artifacts (bcbc31b01)
- fix: merge PR #11 fixes — bugs, security, dead code, version (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### 🔧 Maintenance
- chore: sync performance baselines (3c1e6f647)
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

### 🔎 Other Changes
- release: v1.15.15 (ed0e26699)
- release: v1.15.14 (98df6004c)
- release: v1.15.13 (c055785f3)

---

## [undefined] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: post-merge cleanup — deps, index.ts, pipelines, root artifacts (bcbc31b01)
- fix: merge PR #11 fixes — bugs, security, dead code, version (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### 🔧 Maintenance
- chore: sync performance baselines (3c1e6f647)
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

### 🔎 Other Changes
- release: v1.15.14 (98df6004c)
- release: v1.15.13 (c055785f3)

---

## [undefined] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: post-merge cleanup — deps, index.ts, pipelines, root artifacts (bcbc31b01)
- fix: merge PR #11 fixes — bugs, security, dead code, version (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### 🔧 Maintenance
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

---

## [1.15.13] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: decouple 0xRay from OpenCode — bridge, codex formatter, codex-gap processors (#10) (a24f3b406)

### 🐛 Bug Fixes
- fix: post-merge PR #10 review issues — bugs, security, dead code, version (#11) (ef32821f2)
- fix: README version regex to exclude IP addresses (127.0.0) (80967acaa)

### 🔧 Maintenance
- chore: move @types/* packages to devDependencies, remove unused @types/express
- chore: fix require() in ESM in index.ts — use static import
- chore: UVM 1.15.13 (1 ahead of npm) (e3220847c)
- chore: fix package.json version to 1.15.12 (35b158283)
- chore: UVM 1.15.12 (1 ahead of npm) (33ed3793c)
- chore: update test performance baselines (a2ae8e93c)
- chore: version sync to 1.15.11 (92fb03d92)

---

## [1.15.11] - 2026-03-28

### 🔄 Changes

- Version bump

---

## [1.15.9] - 2026-03-28

### 🔄 Changes

- Version bump

---

## [1.15.8] - 2026-03-28

### 🔄 Changes

- Version bump

---

## [1.15.7] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: Hermes plugin v2.1 — git hooks, lifecycle hooks, and strray_hooks tool (#9) (f081d1e40)

---

## [1.15.6] - 2026-03-28

### 🔄 Changes

### ✨ Features
- feat: Hermes Agent plugin v2 with full test coverage and zero TS errors (#8) (562e7d404)
- feat: Hermes plugin v2 — bridge pipeline, file logging, 2359 tests (0 skipped) (#7) (52185dd1a)

### 🐛 Bug Fixes
- fix: add eslint-plugin-vitest dependency for processor test linting (5c16c1eb0)
- fix: eliminate flaky timing assertions in tests (3bf04c3ec)

---

## [undefined] - 2026-03-27

### 🔄 Changes

### ✨ Features
- feat: Hermes Agent integration with MCP servers and standalone mode (b8f39fe25)

### 🐛 Bug Fixes
- fix: update ANTIGRAVITY_INTEGRATION.md path reference to archive (84d417a46)
- fix: update counts (30→44 skills, 2,368→2311 tests) and MCP terminology (7ccafa80a)
- fix: update skill counts from 30 to 44 in README and AGENTS (231fe9c34)
- fix: skip removed routing pipeline test (f1b6240bc)
- fix: implement critical code fixes (aecd2f89c)

### ♻️ Refactoring
- refactor: organize docs, sync agent counts, add Hermes MCP integration (72ba69bcb)
- refactor: Remove deprecated methods from processor-manager.ts (eba1892ff)

### 🔧 Maintenance
- chore: bump UVM to 1.15.1 (891685014)
- chore: v1.15.0 published, bump UVM to 1.15.1 (5aabfef3e)
- chore: Rename StringRayOrchestrator to KernelOrchestrator (089c988ed)
- chore: v1.14.9 published, bump UVM to 1.14.10 (aa0304c98)

### 🔎 Other Changes
- fix(UVM): remove all count patterns - UVM only maintains versions now (17269a331)
- fix(UVM): add pattern for 'X framework skills' count maintenance (61d79768b)

---

## [1.14.7] - 2026-03-26

### 🔄 Changes

add gh repo clone fallback for authenticated users on skill:install

---

## [1.14.6] - 2026-03-26

### 🔄 Changes

fix: use tarball download instead of git clone for skill:install

---

## [1.14.5] - 2026-03-26

### 🔄 Changes

fix: add git:// protocol fallback for skill:install auth failures

---

## [1.14.4] - 2026-03-26

### 🔄 Changes

convert 13 agents to skills, add namespaced community installs, fix post-processor

---

## [1.14.3] - 2026-03-26

### 🔄 Changes

update docs for skills registry, remove stale references

---

## [1.14.2] - 2026-03-26

### 🔄 Changes

consolidate licenses, remove stale artifacts, remove claude-seo from registry

---

## [1.15.0] - 2026-03-24

### 🔄 Changes

### ✨ Features
- feat: Phase 0-1 - one-command installer with OpenCode detection, auto-install, kernel layering
- feat: Phase 1 - Impeccable + OpenViking skill integration with proper Apache 2.0 licensing
- feat: Phase 2 - New CLI commands: publish-agent, antigravity-status, credible-init
- feat: Phase 3 - README polish, version bump to v1.15.0

### 🧪 Tests
- test: CLI install command tests (8 tests)
- test: CLI status command tests (14 tests)
- test: CLI publish-agent command tests (20 tests)
- test: CLI antigravity-status command tests (24 tests)
- test: CLI credible-init command tests (18 tests)
- test: CLI pipeline integration tests (37 tests)

---

## [undefined] - 2026-03-23

### 🔄 Changes

### ✨ Features
- feat: comprehensive docs and refactoring session (e5684c4d)
- feat: register LogProtectionProcessor in ProcessorManager (80224d29)

### 🐛 Bug Fixes
- fix: update processor pipeline tree with all 13 processors (bbdb3b8e)

### ♻️ Refactoring
- refactor: remove unused deprecated stub methods from processor-manager (08518dc8)
- refactor: extract shutdown handler utility and update MCP servers (0ac823f4)
- refactor: remove console.* from core library files (4a3adcaf)

### 📚 Documentation
- docs: add integration research and strategy documents (b1862951)
- docs: add deep reflection on building with AI agents as dev team (098784b5)
- docs: fix processor count and update methodology with completed tasks (d91276a8)
- docs: add deep reflection on pipeline testing journey (7287da64)
- docs: add NO STUBS verification checklist and detailed task list (02ec6e70)
- docs: add agent review findings and pipeline creation rules (af901802)
- docs: add detailed architecture diagrams to pipeline trees (d3ea1d52)
- docs: create pipeline trees and update methodology (4384dd9d)
- docs: add pipeline inventory via researcher agent (9cd7ec2a)
- docs: finalize saga via storyteller agent (db3c9236)
- docs: rewrite saga following narrative template (c037dfe9)
- docs: add deep saga reflection - The Pipeline Paradox (8ff69bae)
- docs: add comprehensive journey chronicle of inference pipeline (7f876f20)
- docs: add deep session reflection on inference pipeline journey (1fd67474)
- docs: add pipeline testing methodology guide (694fbcc8)
- docs: add deep reflection on pipeline testing discovery (7df2a0de)

### 🧪 Tests
- test: add integration tests for processors and MCP knowledge servers (510aea6b)
- test: enhance all pipeline tests with REAL component integration (1b4a45b0)
- test: enhance routing pipeline test with full analytics verification (f7c105fa)
- test: rewrite all pipeline tests following actual pipeline methodology (f1ee35da)
- test: add pipeline tests for all 6 remaining pipelines - 3 passes each (345de878)
- test: add governance pipeline test - 3 consecutive passes (ff9b2d60)

### 🔎 Other Changes
- tests: rewrite pipeline tests to reference their trees (50e3ce7d)

---

## [1.13.5] - 2026-03-20

### 🔄 Changes

### 🐛 Bug Fixes
- fix: empty catch blocks in plugin routing (ea53c946)
- fix: update tests to match new lexicon-based routing (cda659ec)

### 🔧 Maintenance
- chore: remove auto-generated state file (764e93b4)
- chore: remove codex version from plugin comment (4fe126f1)
- chore: remove hardcoded version from plugin file (18ec16b0)
- chore: update version manager to 1.13.2 (f426a681)
- chore: remove auto-generated files from git tracking (105742a7)
- chore: add performance-baselines.json to gitignore (3ea19094)
- chore: update auto-generated state files (86871023)
- chore: update auto-generated files for v1.13.2 (1ac40d7f)
- chore: bump version to 1.13.2 (24bb1343)

### 🔎 Other Changes
- feat(plugin): add experimental.chat.user.before hook for user message routing (fc69242f)
- chore(release): v1.13.3 - Clean plugin versions and sync fixes (f881b44d)
- chore(release): v1.13.2 - Fix plugin distribution and enhance postinstall (8ba831a7)

---

## [1.13.4] - 2026-03-19

### 🔄 Changes

### 🔧 Maintenance
- chore: remove codex version from plugin comment (4fe126f1)
- chore: remove hardcoded version from plugin file (18ec16b0)
- chore: update version manager to 1.13.2 (f426a681)
- chore: remove auto-generated files from git tracking (105742a7)
- chore: add performance-baselines.json to gitignore (3ea19094)
- chore: update auto-generated state files (86871023)
- chore: update auto-generated files for v1.13.2 (1ac40d7f)
- chore: bump version to 1.13.2 (24bb1343)

### 🔎 Other Changes
- feat(plugin): add experimental.chat.user.before hook for user message routing (fc69242f)
- chore(release): v1.13.3 - Clean plugin versions and sync fixes (f881b44d)
- chore(release): v1.13.2 - Fix plugin distribution and enhance postinstall (8ba831a7)

---

## [1.13.3] - 2026-03-19

### 🔄 Changes

### 🔧 Maintenance
- chore: remove codex version from plugin comment (4fe126f1)
- chore: remove hardcoded version from plugin file (18ec16b0)
- chore: update version manager to 1.13.2 (f426a681)
- chore: remove auto-generated files from git tracking (105742a7)
- chore: add performance-baselines.json to gitignore (3ea19094)
- chore: update auto-generated state files (86871023)
- chore: update auto-generated files for v1.13.2 (1ac40d7f)
- chore: bump version to 1.13.2 (24bb1343)

### 🔎 Other Changes
- chore(release): v1.13.2 - Fix plugin distribution and enhance postinstall (8ba831a7)

---

## [1.13.2] - 2026-03-19

### 🔄 Changes

### 🔎 Other Changes
- chore(release): v1.13.2 - Fix plugin distribution and enhance postinstall (8ba831a7)

---

## [1.13.1] - 2026-03-19

### 🔄 Changes

- Version bump

---

## [undefined] - 2026-03-19

### 🔄 Changes

### ✨ Features
- feat: integrate activity logger into post-processor and git hooks (595bbcca)
- feat: add global activity logger with enable/disable switch (c6ee8392)

### 🐛 Bug Fixes
- fix: add direct activity logging to plugin hooks (58c0d679)
- fix: migrate console.* to frameworkLogger + fix plugin hook export format (3edac59a)

### 🧪 Tests
- test: add activity logger tests (35 tests) (43df4662)

### 🔎 Other Changes
- reflections: evening reflection - it works (f55c2a0e)

---

## [1.12.0] - 2026-03-18

### 🔄 Changes

### 🔧 Maintenance
- chore: update performance baselines (b0299654)

---

## [1.11.0] - 2026-03-18

### 🔄 Changes

### ✨ Features
- feat: add documentation sync system with smart triggers (c63fa186)

### 🐛 Bug Fixes
- fix: routing outcomes now saved immediately, orchestrator tracks outcomes (c9922b62)
- fix: activity.log now includes task details, routing-outcomes.json initialized immediately (9e5fc142)
- fix: init.sh priority - node_modules first, source as fallback (d7ca8f49)
- fix: init.sh version detection to show actual version instead of fallback (779c979a)

---

## [1.10.7] - 2026-03-18 (from v1.10.0)

### ✨ Features

- complete processor migration to polymorphic classes (Part 2)|feat: complete processor migration to polymorphic classes (Part 2) (`842b238`)
- extract processor switch to polymorphic classes (Part 1)|feat: extract processor switch to polymorphic classes (Part 1) (`83529b6`)
- add standalone archive-logs CLI command|feat: add standalone archive-logs CLI command (`605d714`)
- enable task routing and add comprehensive analytics logging|feat: enable task routing and add comprehensive analytics logging (`be39379`)
- wire up archiveLogFiles to run before cleanup|feat: wire up archiveLogFiles to run before cleanup (`ff44996`)
- Add Estimation Validator with calibration learning|feat: Add Estimation Validator with calibration learning (`6410607`)
**integration:**
- Add OpenClaw integration with tool event hooks|feat(integration): Add OpenClaw integration with tool event hooks (`0ea5986`)

### 🐛 Bug Fixes

- persist routing outcomes to disk for analytics|fix: persist routing outcomes to disk for analytics (`b63f35f`)
- archive activity.log only after verification, leave intact on failure|fix: archive activity.log only after verification, leave intact on failure (`9234bd6`)
- pre-commit test check in ci-test-env|fix: pre-commit test check in ci-test-env (`4d208ca`)
- pre-commit test check uses correct test command|fix: pre-commit test check uses correct test command (`8d03417`)
- restore eslint config|fix: restore eslint config (`2ee7085`)
- use temp directory for test-consent.json instead of root|fix: use temp directory for test-consent.json instead of root (`66f2943`)
- write test log files to logs/ directory instead of root|fix: write test log files to logs/ directory instead of root (`20a089a`)
- cleanup test files from both root and logs/ folders|fix: cleanup test files from both root and logs/ folders (`c2cc967`)
- update reflection path references to new consolidated location|fix: update reflection path references to new consolidated location (`0d0a8e2`)
- protect critical logs from deletion + move test-activity to logs/|fix: protect critical logs from deletion + move test-activity to logs/ (`a1cd89b`)
- protect all critical logs from cleanup deletion|fix: protect all critical logs from cleanup deletion (`467f377`)
- protect activity.log from deletion in cleanupLogFiles|fix: protect activity.log from deletion in cleanupLogFiles (`317ddac`)
**plugin:**
- Remove debug console.error statements|fix(plugin): Remove debug console.error statements (`b38f784`)
- Enable processors for all tools and improve debugging|fix(plugin): Enable processors for all tools and improve debugging (`ffb4b64`)

### 📚 Documentation

- add deep reflection on processor architecture refactoring|docs: add deep reflection on processor architecture refactoring (`9be3fac`)
- add OpenClaw integration section and project structure to README|docs: add OpenClaw integration section and project structure to README (`0b5e3d8`)
- Add comprehensive architecture analysis|docs: Add comprehensive architecture analysis (`1649873`)
- Add Estimation Validator demo documentation|docs: Add Estimation Validator demo documentation (`2bdc3e8`)
- Add deep saga reflection 'The Refactorer's Odyssey'|docs: Add deep saga reflection 'The Refactorer's Odyssey' (`7a834b7`)
### ♻️ Code Refactoring

- extract quality gates to dedicated module|refactor: extract quality gates to dedicated module (`aace35e`)
- flush dead plugin system, add routing for all 25 agents|refactor: flush dead plugin system, add routing for all 25 agents (`a9efc7c`)
- organize temp folders and configs|refactor: organize temp folders and configs (`265565c`)
- organize report and config files to proper locations|refactor: organize report and config files to proper locations (`d82d23f`)
- consolidate all reflection files into docs/reflections/|refactor: consolidate all reflection files into docs/reflections/ (`e8ea22a`)
- Consolidate complexity analyzers (Technical Debt #1)|refactor: Consolidate complexity analyzers (Technical Debt #1) (`dcfeadc`)
- Split orchestrator.server.ts into modular structure|refactor: Split orchestrator.server.ts into modular structure (`1fc54dc`)
**plugin:**
- Add TaskSkillRouter integration scaffolding|refactor(plugin): Add TaskSkillRouter integration scaffolding (`d60c28c`)

### 🧪 Tests

- add processor architecture validation script|test: add processor architecture validation script (`819450e`)
### 🔧 Chores

- add var/ to gitignore|chore: add var/ to gitignore (`a358315`)
- add test log files to .gitignore|chore: add test log files to .gitignore (`effa3b4`)
- Update scripts to use consolidated complexity analyzer API|chore: Update scripts to use consolidated complexity analyzer API (`de5bea4`)
- Remove dead code - secure-authentication-system|chore: Remove dead code - secure-authentication-system (`589cb8e`)
- Sync version to 1.10.0 across all files|chore: Sync version to 1.10.0 across all files (`26f5ec3`)
- Update auto-generated state and performance baselines|chore: Update auto-generated state and performance baselines (`75345d4`)
- Bump version to 1.10.0|chore: Bump version to 1.10.0 (`4497035`)
---

*Generated by `scripts/node/generate-changelog.js`*
