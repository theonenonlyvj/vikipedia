import { describe, expect, it } from "vitest";
import { createStatsSummary } from "./stats";
import type { RunRecord } from "./types";

const run = (
  id: string,
  accountId: string,
  start: string,
  target: string,
  visited: string[],
  clicks = Math.max(0, visited.length - 1),
): RunRecord => ({
  id,
  accountId,
  challengeId: `challenge-${id}`,
  mode: "daily",
  status: "completed",
  start: { canonicalTitle: start },
  target: { canonicalTitle: target },
  clicks,
  elapsedMs: clicks * 1000,
  createdAt: 100,
  completedAt: 100 + clicks * 1000,
  path: visited.slice(1).map((title, index) => ({
    sourcePage: { canonicalTitle: visited[index] },
    clickedAnchorText: title,
    requestedTitle: title,
    resolvedDestination: { canonicalTitle: title },
    timestamp: 100 + (index + 1) * 1000,
    clickNumber: index + 1,
  })),
});

describe("stats summary", () => {
  it("derives personal cognitive stats from the master run list", () => {
    const summary = createStatsSummary(
      [
        run("one", "acct_a", "Apple", "Fruit", [
          "Apple",
          "Tree",
          "Botany",
          "Fruit",
        ]),
        run("two", "acct_a", "Apple", "Philosophy", [
          "Apple",
          "Tree",
          "Knowledge",
          "Philosophy",
        ]),
        run("other", "acct_b", "Moon", "Gravity", ["Moon", "Orbit", "Gravity"]),
      ],
      "acct_a",
    );

    expect(summary.totals).toEqual({
      runs: 2,
      completed: 2,
      abandoned: 0,
      bestClicks: 3,
      averageClicks: 3,
      averageElapsedMs: 3000,
    });
    expect(summary.topStarts[0]).toEqual({ title: "Apple", count: 2 });
    expect(summary.topTargets.map((item) => item.title)).toEqual([
      "Fruit",
      "Philosophy",
    ]);
    expect(summary.mostVisited[0]).toEqual({ title: "Apple", count: 2 });
    expect(summary.bridgePages[0]).toEqual({ title: "Tree", count: 2 });
    expect(summary.commonJumps[0]).toEqual({
      sourceTitle: "Apple",
      destinationTitle: "Tree",
      count: 2,
    });
  });
});
