import type { LeaderboardEntry } from "./types";

export function rankLeaderboard(
  entries: LeaderboardEntry[],
): LeaderboardEntry[] {
  return [...entries].sort(compareLeaderboardEntries);
}

export function pickBestEntry(
  current: LeaderboardEntry | null,
  next: LeaderboardEntry,
): LeaderboardEntry {
  if (!current) {
    return next;
  }

  return compareLeaderboardEntries(next, current) < 0 ? next : current;
}

export function compareLeaderboardEntries(
  left: LeaderboardEntry,
  right: LeaderboardEntry,
): number {
  return (
    left.clicks - right.clicks ||
    left.elapsedMs - right.elapsedMs ||
    left.submittedAt - right.submittedAt
  );
}
