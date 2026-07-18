# Release Record: UX Redesign Increment 0 (Server Prerequisites)

Date: 2026-07-18 (UTC) · Runtime source commit: `0a684aa` · Released by: Claude session (Codex on break)

Implements the council-ratified Increment 0 of
`docs/superpowers/specs/2026-07-18-ux-redesign-modes-design.md` via
`docs/superpowers/plans/2026-07-18-increment-0-server-prereqs.md`. Server-only;
no client/Pages change.

## What shipped

- Migration `0006_board_exclusions.sql`: `runs.board_excluded` (0/1, default 0)
  + `runs_board_excluded_idx`. Additive only.
- `listLeaderboard`, `loadLeaderboardContext` (v2 completion rank), and
  `getPublicRunPath` all filter `board_excluded = 0` — board, "You finished
  #N", and public paths can never disagree about an excluded run. Account
  stats intentionally still include excluded runs.
- Admin containment endpoint: `POST /api/v2/admin/runs/{runId}/exclusion`
  body `{"excluded": bool}` — dailies-admin auth pattern (claimed +
  `DAILY_ADMIN_ACCOUNT_IDS` allowlist + `DAILY_ADMIN_RATE_LIMITER`), audit
  log line `run_board_exclusion` with actor.
- `listChallengePlacements(challengeId)`: best-rank-per-account dedup
  (spec invariant 2), alias-resolved, gapless, completions only. Foundation
  for Boards/trends (Increments 3-4). Not yet routed.
- Rate-limit hardening: `IDENTITY_RATE_LIMITER` (ns 51006, 10/60s per IP) on
  identity guest/secure/login; `RUN_START_RATE_LIMITER` (ns 51007, 6/60s per
  account) on runs/start — enforced on BOTH v2 and legacy routes; fail-open
  when binding absent (belt on existing critical paths).

## Review

Per-task review (4 tasks) + final whole-branch review: SAFE TO RELEASE with
two medium findings, both fixed pre-release in `0a684aa` (completion-rank
filter; legacy-route rate limits). Remaining known notes: `LIMIT 100` on
placements flagged for Increment 4 planning; `runs_board_excluded_idx` is
low-value but harmless.

## Gates (at `0a684aa`)

- `npm test` 496/496 · `npm run test:worker` 123/123 · `tsc` clean via build
- `npm run build` + verify:bundle: pass · `npm audit --omit=dev`: 0 vulns
- `wrangler deploy --dry-run`: all 7 rate-limit bindings present

## Production sequence (as executed)

1. Remote migration ledger: exactly `0006_board_exclusions.sql` pending.
2. Private backup `.private/backup-pre-0006-20260718.sql` (git-ignored,
   never printed) — sha256
   `9f1bf24e30c651f839c01a5af158c86d1df3ce07bfb474c5a8bdd1c3945de4ea`,
   466,433 bytes.
3. Migration applied: ✅; verify: 34 total runs, 0 excluded, column live.
4. Worker deployed: version `32185d48-f97a-4362-b071-06a550119815`.
5. Smoke: `GET /api/v2/challenges` 200 (~226ms); challenge-0003 board
   unchanged (2 rows); unauthenticated admin exclusion probe → 404
   (surface hidden, matching dailies-admin behavior).
6. `main` pushed → `0a684aa` (also publishes the pause handoff `925712d`,
   the council-amended spec, and the Increment 0 plan). No Pages deploy.

## Next

Increment 1 (race-flow extraction — the App.tsx seam) per the spec's
council-ratified increments. Coordinate a Codex merge window before starting.
