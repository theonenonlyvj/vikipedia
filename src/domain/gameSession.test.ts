import { describe, expect, it } from "vitest";
import type { Challenge } from "./types";
import { createGameSession, followResolvedLink } from "./gameSession";

const challenge: Challenge = {
  id: "daily-2026-07-13",
  dateKey: "2026-07-13",
  mode: "daily",
  start: { title: "Apple", pageId: 18978754 },
  target: { title: "Philosophy", pageId: 13692155 },
  ruleset: "ranked_classic",
  source: "curated",
};

describe("game session", () => {
  it("starts an active ranked classic run at the challenge start page", () => {
    const session = createGameSession(challenge, 1000);

    expect(session.status).toBe("active");
    expect(session.clicks).toBe(0);
    expect(session.currentPage).toEqual({
      canonicalTitle: "Apple",
      pageId: 18978754,
    });
    expect(session.path).toEqual([]);
  });

  it("records a resolved link click and completes on canonical target match", () => {
    const session = createGameSession(challenge, 1000);

    const next = followResolvedLink(session, {
      clickedAnchorText: "philosophy",
      requestedTitle: "Philosophy",
      resolvedDestination: {
        canonicalTitle: "Philosophy",
        pageId: 13692155,
      },
      timestamp: 2500,
    });

    expect(next.status).toBe("completed");
    expect(next.clicks).toBe(1);
    expect(next.completedAt).toBe(2500);
    expect(next.currentPage.canonicalTitle).toBe("Philosophy");
    expect(next.path).toHaveLength(1);
    expect(next.path[0]).toMatchObject({
      clickedAnchorText: "philosophy",
      requestedTitle: "Philosophy",
      clickNumber: 1,
    });
  });

  it("does not mutate path or clicks after completion", () => {
    const completed = followResolvedLink(createGameSession(challenge, 1000), {
      clickedAnchorText: "philosophy",
      requestedTitle: "Philosophy",
      resolvedDestination: {
        canonicalTitle: "Philosophy",
        pageId: 13692155,
      },
      timestamp: 2500,
    });

    const unchanged = followResolvedLink(completed, {
      clickedAnchorText: "extra",
      requestedTitle: "Extra",
      resolvedDestination: {
        canonicalTitle: "Extra",
        pageId: 999,
      },
      timestamp: 3000,
    });

    expect(unchanged).toEqual(completed);
  });
});
