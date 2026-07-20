import { describe, expect, it } from "vitest";
import { SERVER_CHALLENGES, getSortedChallenges } from "./challenges";

describe("server challenge catalog", () => {
  it("seeds Challenge #1 as Moon to Gravity", () => {
    expect(SERVER_CHALLENGES[0]).toMatchObject({
      id: "challenge-0001",
      label: "Challenge #1",
      start: { title: "Moon" },
      target: { title: "Gravity" },
      ruleset: "ranked_classic",
      source: "curated",
      sortOrder: 1,
      isActive: true,
    });
  });

  // FB-9 (owner ruling, 2026-07-20): "ALL CHALLENGES" reads newest-created
  // first - `sortOrder` is a monotonically increasing creation-sequence
  // number, so descending sortOrder is descending creation order.
  it("sorts active challenges by sortOrder, newest (highest sortOrder) first", () => {
    const sorted = getSortedChallenges([
      { ...SERVER_CHALLENGES[0], id: "challenge-0002", sortOrder: 2 },
      { ...SERVER_CHALLENGES[0], id: "challenge-0003", sortOrder: 3 },
      { ...SERVER_CHALLENGES[0], id: "challenge-hidden", isActive: false },
    ]);

    expect(sorted.map((challenge) => challenge.id)).toEqual([
      "challenge-0003",
      "challenge-0002",
    ]);
  });
});
