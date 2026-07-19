import { describe, expect, it } from "vitest";
import { boardSnippetRowsFromBoard, boardSnippetRowsFromLeaderboard } from "./boardSnippet";
import type { RankedLeaderboardRow } from "./types";

const placement = (accountId: string, place: number, displayName: string | null = accountId) => ({
  accountId,
  displayName,
  placement: place,
  elapsedMs: place * 10_000,
  clickCount: place + 2,
});

const dnf = (accountId: string, displayName: string | null = accountId) => ({
  accountId,
  displayName,
  elapsedMs: 8_000,
  clickCount: 1,
});

const leaderboardRow = (
  runId: string,
  rank: number,
  accountId: string,
  status: "completed" | "abandoned" = "completed",
): RankedLeaderboardRow => ({
  runId,
  challengeId: "challenge-0001",
  accountId,
  displayName: accountId,
  status,
  isRepeatRun: false,
  startedAt: "2026-07-14T01:00:00.000Z",
  elapsedMs: rank * 1_000,
  clickCount: rank,
  completedAt: status === "completed" ? "2026-07-14T01:00:01.500Z" : undefined,
  abandonedAt: status === "abandoned" ? "2026-07-14T01:00:01.500Z" : undefined,
  protocolVersion: 2,
  rank,
});

describe("boardSnippetRowsFromBoard", () => {
  it("renders placements first (by server placement), then DNFs, one row per account", () => {
    const rows = boardSnippetRowsFromBoard(
      { placements: [placement("acc-a", 1), placement("acc-b", 2)], dnfs: [dnf("acc-c")] },
      null,
    );

    expect(rows.map((row) => [row.rankLabel, row.displayName])).toEqual([
      ["#1", "acc-a"],
      ["#2", "acc-b"],
      ["DNF", "acc-c"],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
  });

  it("marks your rows via accountId (placement AND dnf), never anyone else's", () => {
    const rows = boardSnippetRowsFromBoard(
      { placements: [placement("acc-you", 1), placement("acc-other", 2)], dnfs: [dnf("acc-you-dnf")] },
      "acc-you",
    );
    expect(rows.map((row) => row.isYou)).toEqual([true, false, false]);
  });

  it("treats an anonymous viewer (null accountId) as matching nothing", () => {
    const rows = boardSnippetRowsFromBoard(
      { placements: [placement("acc-a", 1)], dnfs: [] },
      null,
    );
    expect(rows[0]?.isYou).toBe(false);
  });

  it("falls back to Unknown for a null displayName (board rows may lack one)", () => {
    const rows = boardSnippetRowsFromBoard(
      { placements: [placement("acc-a", 1, null)], dnfs: [dnf("acc-b", null)] },
      null,
    );
    expect(rows.map((row) => row.displayName)).toEqual(["Unknown", "Unknown"]);
  });
});

describe("boardSnippetRowsFromLeaderboard", () => {
  it("keys rows by runId and highlights only the exact highlighted run, not every row of that account", () => {
    const rows = boardSnippetRowsFromLeaderboard(
      [
        leaderboardRow("run-1", 1, "acc-you"),
        leaderboardRow("run-2", 2, "acc-you"),
        leaderboardRow("run-3", 3, "acc-other"),
      ],
      "run-2",
    );
    expect(rows.map((row) => row.isYou)).toEqual([false, true, false]);
    expect(rows.map((row) => row.key)).toEqual(["run-1", "run-2", "run-3"]);
  });

  it("labels abandoned rows DNF and completed rows by rank", () => {
    const rows = boardSnippetRowsFromLeaderboard(
      [leaderboardRow("run-1", 1, "acc-a"), leaderboardRow("run-2", 2, "acc-b", "abandoned")],
      null,
    );
    expect(rows.map((row) => row.rankLabel)).toEqual(["#1", "DNF"]);
    expect(rows.map((row) => row.isYou)).toEqual([false, false]);
  });
});
