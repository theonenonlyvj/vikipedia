import type { RankedLeaderboardRow, ServerLeaderboardRow } from "./types";

export function rankLeaderboardRows(
  rows: ServerLeaderboardRow[],
): RankedLeaderboardRow[] {
  return [...rows]
    .sort((a, b) => {
      return compareLeaderboardRows(a, b);
    })
    .slice(0, 100)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function compareLeaderboardRows(
  a: ServerLeaderboardRow,
  b: ServerLeaderboardRow,
): number {
  if (a.status !== b.status) return a.status === "completed" ? -1 : 1;
  if (a.status === "abandoned") {
    if (a.elapsedMs !== b.elapsedMs) return b.elapsedMs - a.elapsedMs;
    if (a.clickCount !== b.clickCount) return b.clickCount - a.clickCount;
    const abandonedAt = Date.parse(a.abandonedAt ?? "") - Date.parse(b.abandonedAt ?? "");
    return abandonedAt || a.runId.localeCompare(b.runId);
  }
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
  if (a.clickCount !== b.clickCount) return a.clickCount - b.clickCount;
  const completedAt = Date.parse(a.completedAt ?? "") - Date.parse(b.completedAt ?? "");
  return completedAt || a.runId.localeCompare(b.runId);
}
