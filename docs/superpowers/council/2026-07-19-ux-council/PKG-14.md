# PKG-14 [P0/M] Owner feedback: rename Boards→Stats; Lifetime must include everyone who's played; guards must scale to reality

Three direct owner reports (2026-07-19, live use):
1. "lifetime/board stats isn't thorough. doesn't include other (fran, lollerskates) that have played"
2. "today board always defaults to day 1" — that half is PKG-01; do NOT duplicate its fix here, but this package must not conflict with it.
3. "Boards - rename to stats"

## Diagnosis (verified against prod D1, 2026-07-19)
- lollerskates: 2 runs / 2 completions / **0 daily challenges** played. FranTheGreat: 1 run / 0 completions / 0 dailies. The trends aggregation (`listDailyTrends`) only counts daily-featured challenges, so accounts who only raced custom challenges can never appear on 7d/30d/Lifetime — not even as "not yet ranked".
- The Lifetime ranked guard is a flat ≥10 played dailies, but only 4 dailies have EVER existed (07-15..07-18) — nobody can rank, including the owner (4/4 played). Same flaw hits 30d (flat 10 while only 4 dailies ran in the window).
- Test pollution: runs by `zz*` E2E accounts and `zephyr` are now `board_excluded=1` in prod (done by hand tonight). Queries feeding any board/roster/trends surface MUST filter `board_excluded = 0` — verify `listDailyTrends` and anything this package adds does.

## Files
- src/server/d1TrackingRepository.ts (listDailyTrends guard; new roster query)
- src/server/worker.ts (extend trends route or add roster route)
- src/modes/Boards.tsx, src/modes/AppShell.tsx (label, sections)
- src/domain/dailyTrends.ts (guard math), src/domain/types.ts
- tests: worker trends tests, App.test.tsx label assertions

## Changes
1. RENAME (user-visible only): nav tab label "Boards" → "Stats"; the mode heading "Boards" → "Stats"; aria-labels that say Boards. Do NOT rename internal identifiers/routes/files (mode key stays "boards") — churn without benefit. Update every test assertion that matches the visible label.
2. GUARD MATH: replace flat guards with reality-scaled ones, one shared helper: guard(window) = clamp(ceil(dailies_available_in_window / 3), 1, cap) where cap = 3 for 7d, 10 for 30d, 10 for Lifetime; dailies_available_in_window = count of daily_features rows in the window (Lifetime = all time). Server computes and echoes the guard (client copy already reads server-echoed guard per Boards.tsx F5 invariant — keep that). With today's data (4 dailies) the Lifetime guard becomes 2: the owner (4 played) and Reks (2 played) rank immediately.
3. ALL-PLAYERS ROSTER: Lifetime segment gains a second section "Everyone who's played" listing EVERY account with ≥1 `board_excluded = 0` run across ANY challenge (daily or custom): public name, races started, finishes, wins (rank-1 placements using the deduped placement rule), resolved via account aliases like existing queries. Ranked daily-trends stay the top section; the roster sits below with a one-line explainer ("Daily rankings need N played dailies — every racer counts here."). Server: new repository method + route (follow the trends endpoint's shape/caching/rate-limit pattern, e.g. GET /api/v2/boards/roster) OR fold into the trends response for one fetch — implementer's choice, but document it.
4. The 7d/30d segments: apply the new guard math; below-guard accounts keep the existing "not yet ranked" progress framing (now reachable since guards are sane). No roster section on 7d/30d — Lifetime only.

## Acceptance criteria
- Nav shows Home / Stats / Challenges / You; no user-visible "Boards" string remains (grep the rendered strings)
- Lifetime shows a ranked section (guard = 2 with current data — owner and Reks ranked) AND an "Everyone who's played" roster including lollerskates and FranTheGreat
- zz*/zephyr excluded runs appear NOWHERE (trends, roster, boards)
- Guards echo from the server; no client-hardcoded guard numbers
- Unit tests: guard math (4 dailies → lifetime guard 2; 30 dailies → 10; 1 daily → 1), roster query (includes custom-only players, excludes board_excluded), label rename test updates
- Full client + worker suites green

## Risk
Guard change alters ranked output the moment it ships — that is the point, but state it in the commit message. Roster query must alias-resolve accounts the same way placements do or the same player could appear twice.

## OWNER-PROXY RULING (binding)
This is direct owner feedback and outranks round-1 council materials where they conflict. Keep the ranked-trends framing (spec) but the roster ensures nobody who has played is invisible. Time+clicks invariant applies to leaderboard rows, not roster count rows — roster shows counts (races/finishes/wins), not times.
