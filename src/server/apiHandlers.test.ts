import { describe, expect, it, vi } from "vitest";
import { createApiHandlers } from "./apiHandlers";
import type { TrackingRepository } from "./trackingRepository";

function fakeRepository(): TrackingRepository {
  return {
    listChallenges: vi.fn(async () => []),
    createChallenge: vi.fn(async ({ startTitle, targetTitle }) => ({
      id: "challenge-0002",
      label: "Challenge #2",
      sortOrder: 2,
      isActive: true,
      mode: "daily" as const,
      start: { title: startTitle },
      target: { title: targetTitle },
      ruleset: "ranked_classic" as const,
      source: "curated" as const,
    })),
    upsertAccountProfile: vi.fn(async ({ publicName }) => ({
      accountId: "acc-1",
      publicName,
      identityStatus: "claimed" as const,
    })),
    startRun: vi.fn(async () => ({
      id: "run-1",
      challengeId: "challenge-0001",
      accountId: "acc-1",
      status: "active" as const,
      startTitle: "Moon",
      targetTitle: "Gravity",
      clickCount: 0,
      startedAt: "2026-07-14T00:00:00.000Z",
    })),
    recordClick: vi.fn(async () => ({ clickCount: 1 })),
    completeRun: vi.fn(async () => ({
      runId: "run-1",
      challengeId: "challenge-0001",
      accountId: "acc-1",
      displayName: "Vijay",
      elapsedMs: 1200,
      clickCount: 1,
      completedAt: "2026-07-14T00:00:01.200Z",
      pathPreview: [],
      rank: 1,
    })),
    abandonRun: vi.fn(async () => ({ status: "abandoned" as const })),
    listLeaderboard: vi.fn(async () => []),
    getRunPath: vi.fn(async () => []),
  };
}

describe("api handlers", () => {
  it("requires a public account name before starting a run", async () => {
    const handlers = createApiHandlers(fakeRepository());

    await expect(
      handlers.startRun({
        challengeId: "challenge-0001",
        accountId: "acc-1",
        publicName: "   ",
        identityStatus: "claimed",
      }),
    ).rejects.toMatchObject({
      code: "invalid_public_name",
      status: 400,
    });
  });

  it("trims account profile names before starting a run", async () => {
    const repository = fakeRepository();
    const handlers = createApiHandlers(repository);

    await expect(
      handlers.startRun({
        challengeId: "challenge-0001",
        accountId: "acc-1",
        publicName: "  Vijay  ",
        identityStatus: "claimed",
      }),
    ).resolves.toMatchObject({ run: { id: "run-1" } });

    expect(repository.startRun).toHaveBeenCalledWith({
      challengeId: "challenge-0001",
      accountId: "acc-1",
      publicName: "Vijay",
      identityStatus: "claimed",
    });
  });

  it("creates a challenge with trimmed article titles", async () => {
    const repository = fakeRepository();
    const handlers = createApiHandlers(repository);

    await expect(
      handlers.createChallenge({
        startTitle: "  Mars  ",
        targetTitle: "  Water  ",
      }),
    ).resolves.toEqual({
      challenge: {
        id: "challenge-0002",
        label: "Challenge #2",
        sortOrder: 2,
        isActive: true,
        mode: "daily",
        start: { title: "Mars" },
        target: { title: "Water" },
        ruleset: "ranked_classic",
        source: "curated",
      },
    });

    expect(repository.createChallenge).toHaveBeenCalledWith({
      startTitle: "Mars",
      targetTitle: "Water",
    });
  });

  it("requires both challenge titles", async () => {
    const handlers = createApiHandlers(fakeRepository());

    await expect(
      handlers.createChallenge({ startTitle: "", targetTitle: "Gravity" }),
    ).rejects.toMatchObject({
      code: "invalid_start_title",
      status: 400,
    });
  });

  it("starts a run through the repository", async () => {
    const repository = fakeRepository();
    const handlers = createApiHandlers(repository);

    await expect(
      handlers.startRun({
        challengeId: "challenge-0001",
        accountId: "acc-1",
        publicName: "Vijay",
        identityStatus: "claimed",
      }),
    ).resolves.toMatchObject({ run: { id: "run-1" } });
  });

  it("records clicks with required titles and anchor text", async () => {
    const repository = fakeRepository();
    const handlers = createApiHandlers(repository);

    await expect(
      handlers.recordClick("run-1", "acc-1", {
        sourceTitle: "Moon",
        clickedAnchorText: "orbit",
        requestedTitle: "Orbit",
        destinationTitle: "Orbit",
        clientTimestampMs: 1784000000000,
      }),
    ).resolves.toEqual({ clickCount: 1 });

    expect(repository.recordClick).toHaveBeenCalledWith("run-1", "acc-1", {
      sourceTitle: "Moon",
      clickedAnchorText: "orbit",
      requestedTitle: "Orbit",
      destinationTitle: "Orbit",
      destinationPageId: undefined,
      clientTimestampMs: 1784000000000,
    });
  });

  it("rejects completion without a final title", async () => {
    const handlers = createApiHandlers(fakeRepository());

    await expect(
      handlers.completeRun("run-1", "acc-1", { finalTitle: "" }),
    ).rejects.toMatchObject({
      code: "invalid_final_title",
      status: 400,
    });
  });
});
