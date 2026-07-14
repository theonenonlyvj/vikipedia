import { describe, expect, it } from "vitest";
import type { Challenge, LeaderboardEntry, VGamesAccount } from "./types";

describe("domain types", () => {
  it("supports the VGames-shaped identity and daily row contracts", () => {
    const account: VGamesAccount = {
      accountId: "acct_local_1",
      displayName: "Guest",
      status: "ghost",
      token: "mock-token",
    };
    const challenge: Challenge = {
      id: "daily-2026-07-13",
      dateKey: "2026-07-13",
      mode: "daily",
      start: { title: "Apple" },
      target: { title: "Philosophy" },
      ruleset: "ranked_classic",
      source: "curated",
    };
    const row: LeaderboardEntry = {
      accountId: account.accountId,
      displayName: account.displayName,
      challengeId: challenge.id,
      clicks: 4,
      elapsedMs: 12000,
      submittedAt: 1783987200000,
      pathHash: "hash",
    };

    expect(row.challengeId).toBe(challenge.id);
  });
});
