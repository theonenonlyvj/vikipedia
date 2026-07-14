import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "./types";
import { pickBestEntry, rankLeaderboard } from "./leaderboard";

const entry = (
  accountId: string,
  clicks: number,
  elapsedMs: number,
  submittedAt: number,
): LeaderboardEntry => ({
  accountId,
  displayName: accountId,
  challengeId: "daily-2026-07-13",
  clicks,
  elapsedMs,
  submittedAt,
  pathHash: `${accountId}-${clicks}-${elapsedMs}-${submittedAt}`,
});

describe("leaderboard", () => {
  it("sorts by clicks, then elapsed time, then earliest submission", () => {
    const ranked = rankLeaderboard([
      entry("late-fast", 3, 1000, 20),
      entry("slow", 3, 2000, 1),
      entry("fewest", 2, 9000, 50),
      entry("early-fast", 3, 1000, 10),
    ]);

    expect(ranked.map((row) => row.accountId)).toEqual([
      "fewest",
      "early-fast",
      "late-fast",
      "slow",
    ]);
  });

  it("keeps the best duplicate result for an account", () => {
    const current = entry("acct", 4, 1000, 1);

    expect(pickBestEntry(current, entry("acct", 3, 9000, 2)).clicks).toBe(3);
    expect(pickBestEntry(current, entry("acct", 4, 900, 2)).elapsedMs).toBe(
      900,
    );
    expect(pickBestEntry(current, entry("acct", 4, 1000, 0)).submittedAt).toBe(
      0,
    );
    expect(pickBestEntry(current, entry("acct", 5, 100, 2))).toBe(current);
    expect(pickBestEntry(null, current)).toBe(current);
  });
});
