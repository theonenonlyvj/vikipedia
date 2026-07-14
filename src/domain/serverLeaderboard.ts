import type { RankedLeaderboardRow, ServerLeaderboardRow } from "./types";

export function rankLeaderboardRows(
  rows: ServerLeaderboardRow[],
): RankedLeaderboardRow[] {
  return rows
    .slice()
    .sort((a, b) => {
      if (a.elapsedMs !== b.elapsedMs) {
        return a.elapsedMs - b.elapsedMs;
      }
      if (a.clickCount !== b.clickCount) {
        return a.clickCount - b.clickCount;
      }
      return Date.parse(a.completedAt) - Date.parse(b.completedAt);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
