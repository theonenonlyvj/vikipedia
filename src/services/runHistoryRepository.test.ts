import { describe, expect, it } from "vitest";
import type { RunRecord } from "../domain/types";
import {
  createLocalRunHistoryRepository,
  type StorageLike,
} from "./runHistoryRepository";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const record: RunRecord = {
  id: "run_1",
  accountId: "acct_local_test",
  challengeId: "daily-test",
  mode: "daily",
  status: "completed",
  start: { canonicalTitle: "Apple" },
  target: { canonicalTitle: "Fruit" },
  clicks: 1,
  elapsedMs: 1000,
  createdAt: 100,
  completedAt: 1100,
  path: [
    {
      sourcePage: { canonicalTitle: "Apple" },
      clickedAnchorText: "fruit",
      requestedTitle: "Fruit",
      resolvedDestination: { canonicalTitle: "Fruit" },
      timestamp: 1100,
      clickNumber: 1,
    },
  ],
};

describe("local run history repository", () => {
  it("stores a master list of run records and filters by account", async () => {
    const storage = memoryStorage();
    const repo = createLocalRunHistoryRepository(storage);

    await repo.saveRun(record);
    await repo.saveRun({ ...record, id: "run_2", accountId: "other" });

    expect(await repo.getAllRuns()).toHaveLength(2);
    expect(await repo.getRunsForAccount("acct_local_test")).toEqual([record]);
  });
});
