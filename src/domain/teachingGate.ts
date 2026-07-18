import type { AccountStats } from "./types";

export interface TeachingGateStatus {
  hasIdentifiedSession: boolean;
  stats: AccountStats | null;
}

/**
 * First-visit teaching gate (UX redesign spec, Home §First-visit teaching
 * gate; migration note iii). Whether the rules strip shows is derived
 * entirely from server-tracked account stats - never device-local storage -
 * so it fires correctly for a brand-new guest on any device/browser and
 * disappears the instant the account's first race is recorded anywhere.
 *
 * `stats: null` is ambiguous on its own - it covers "no account exists yet",
 * "an identified account whose stats haven't loaded yet", and "an
 * identified account whose stats fetch errored." Only the first of those
 * should show the gate; the other two must hide it (M1 fix) - otherwise a
 * veteran sees the newbie strip flash on every load while their real stats
 * are in flight, and it gets stuck showing forever if that fetch fails.
 * `hasIdentifiedSession` disambiguates: with no identified session at all,
 * there's nothing to fetch, so `stats` is always null and irrelevant - show.
 * With an identified session, only a *loaded* zero-completions reading
 * shows the gate; a still-pending or errored read (both surface as `stats:
 * null`) hides it instead of guessing.
 */
export function shouldShowTeachingGate({ hasIdentifiedSession, stats }: TeachingGateStatus): boolean {
  if (!hasIdentifiedSession) return true;
  return stats !== null && stats.totals.completed === 0;
}
