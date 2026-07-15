# DECISION (Vijay, 2026-07-15): NO history reset at cutover — carry over ALL history

**Binding product decision, supersedes the migration-0003 behavior flagged by the 2026-07-15
council review.** Vijay's words: "no history reset, I want to carryover any and all history and
database structure."

## What this changes

Migration `d1/migrations/0003_hardening_protocol.sql` (as reviewed 2026-07-15) demotes legacy
runs to `ranked_eligible = 0` and carries only 3 challenges forward. That is now **not
acceptable**. Whoever lands the hardening branch must rework the cutover so that:

1. **Every existing challenge survives** — no challenge subsetting.
2. **Every existing run, click, and path row survives** with its original timestamps and
   attribution (account/ghost linkage intact; claim-later re-attribution still applies to
   legacy rows).
3. **Legacy runs stay ON the leaderboards.** If a legacy run lacks fields the hardened
   protocol records (e.g. server-verified click chains), rank it from the data it has rather
   than hiding it. If a distinction is ever needed, prefer a per-run provenance marker
   (e.g. `protocol_version`) over exclusion — display, don't drop.
4. **Database structure carries over** — additive migrations only (ADD COLUMN / CREATE TABLE
   IF NOT EXISTS); no DROP/rebuild of populated tables, no destructive re-keying.

## Interaction with leaderboard integrity (council finding, still open)

The council's separate CRITICAL finding stands: runs are client-timed and unvalidated against
Wikipedia's real link graph, so boards are forgeable. When per-click adjacency validation
lands, apply it **forward from that point** (new runs fail-closed for ranked status); legacy
runs keep their standing per this decision. Do not use the integrity fix as a back-door
history reset.

## Status

- Recorded 2026-07-15 while the hardening branch (`codex/council-hardening`) was in active
  development (Daily Challenge work in flight). Migration 0003/0004 rework is owed before any
  production cutover.
- Cross-referenced from `docs/handoff/2026-07-15-overnight-council-and-fixes.md` and
  `vgames-platform/docs/CURRENT-STATE.md`.
