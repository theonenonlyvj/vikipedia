import { describe, expect, it } from "vitest";
import { getTodayChallenge } from "../data/challenges";
import type { RunResult, VGamesAccount } from "../domain/types";
import {
  createLocalDailyChallengeRepository,
  type StorageLike,
} from "./dailyRepository";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const account: VGamesAccount = {
  accountId: "acct_local_test",
  displayName: "Vijay",
  status: "ghost",
  token: "mock-token",
};

function result(clicks: number, elapsedMs: number): RunResult {
  const challenge = getTodayChallenge("2026-07-13");
  return {
    challenge,
    accountId: account.accountId,
    clicks,
    elapsedMs,
    path: [],
    status: "completed",
  };
}

describe("daily challenge repository", () => {
  it("selects the same deterministic challenge for a date key", () => {
    const first = getTodayChallenge("2026-07-13");
    const second = getTodayChallenge("2026-07-13");

    expect(first).toEqual(second);
    expect(first.mode).toBe("daily");
    expect(first.dateKey).toBe("2026-07-13");
  });

  it("stores the best result per account and ranks leaderboard rows", async () => {
    let now = 1000;
    const repo = createLocalDailyChallengeRepository(memoryStorage(), () => now);

    const slow = await repo.submitResult(result(5, 2000), account);
    now = 2000;
    const faster = await repo.submitResult(result(5, 1500), account);
    now = 3000;
    const worse = await repo.submitResult(result(6, 100), account);
    const best = await repo.getBestResult(
      account.accountId,
      result(5, 2000).challenge.id,
    );
    const leaderboard = await repo.getLeaderboard(result(5, 2000).challenge.id);

    expect(slow.elapsedMs).toBe(2000);
    expect(faster.elapsedMs).toBe(1500);
    expect(worse.elapsedMs).toBe(1500);
    expect(best?.elapsedMs).toBe(1500);
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].displayName).toBe("Vijay");
  });
});
