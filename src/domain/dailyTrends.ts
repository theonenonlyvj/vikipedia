import { centralDateDaysBefore } from "./challengeSelection";

/**
 * Boards' rolling-trend windows (Increment 4, UX redesign spec §Boards -
 * "7d/30d/lifetime" paragraph; §Data requirements - "Rolling avg placement").
 * `windowDays` is `null` for lifetime (no window, all dailies ever played).
 */
export type TrendWindowDays = 7 | 30 | null;

/**
 * Participation guard cap - the ceiling `dailyTrendGuard` clamps to once the
 * catalog has produced enough dailies (spec: 7d → 3, 30d/lifetime → 10).
 */
function dailyTrendGuardCap(windowDays: TrendWindowDays): number {
  return windowDays === 7 ? 3 : 10;
}

/**
 * PKG-14 (owner-proxy ruling, 2026-07-19 - direct owner feedback overriding
 * round-1 council materials): the original fixed guards (7d always 3, 30d/
 * lifetime always 10) assumed a mature catalog. In real prod use, only 4
 * dailies had EVER existed - nobody, including the owner (4/4 played), could
 * ever clear a flat 10-daily lifetime guard. The guard now scales to how
 * many dailies actually exist in the window: `ceil(dailiesAvailable / 3)`,
 * clamped to [1, cap] - so a young catalog ranks its earliest players
 * immediately instead of gatekeeping everyone until an arbitrary, unreachable
 * total. With today's 4 dailies the lifetime guard is `ceil(4/3) = 2`; once
 * the catalog has produced enough dailies the clamp keeps the guard from
 * exceeding the spec's original steady-state cap (3 for 7d, 10 for 30d/
 * lifetime). `dailiesAvailable` must be counted the same way the caller
 * counts the window itself (lifetime = all `daily_features` rows ever;
 * 7d/30d = rows inside that window) - see `listDailyTrends`.
 */
export function dailyTrendGuard(windowDays: TrendWindowDays, dailiesAvailable: number): number {
  const cap = dailyTrendGuardCap(windowDays);
  return Math.min(cap, Math.max(1, Math.ceil(dailiesAvailable / 3)));
}

/**
 * The inclusive Central-date start of a fixed-size trend window ending at
 * `todayCentral` - e.g. a 7-day window ending today covers today and the 6
 * days before it. Lifetime (`windowDays: null`) has no start boundary and
 * shouldn't call this.
 */
export function dailyTrendWindowStart(todayCentral: string, windowDays: 7 | 30): string {
  return centralDateDaysBefore(todayCentral, windowDays - 1);
}

/**
 * F3 (trend arrows): the Central-date end of the trend window immediately
 * preceding the one ending at `todayCentral` - spec: "7d: [t-13,t-7]; 30d:
 * [t-59,t-30]". Feeding this back in as the `todayCentral` argument to a
 * second `listDailyTrends(windowDays, ...)` call reproduces exactly that
 * prior window, because a `windowDays`-length window ending `windowDays`
 * days before today starts the calendar day immediately after the current
 * window's own start (`dailyTrendWindowStart`) - e.g. 7d: current window is
 * [t-6,t], so ending the previous window at t-7 gives [t-13,t-7], matching
 * the spec exactly. Lifetime has no "previous window" (spec: no arrow on
 * lifetime) and shouldn't call this.
 */
export function dailyTrendPreviousWindowEnd(todayCentral: string, windowDays: 7 | 30): string {
  return centralDateDaysBefore(todayCentral, windowDays);
}
