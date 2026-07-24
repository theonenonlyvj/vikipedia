import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeaderboardList from "./LeaderboardList";
import type { ChallengeBoardDnfRow, ChallengeBoardPlacement } from "../domain/types";

function placement(overrides: Partial<ChallengeBoardPlacement> = {}): ChallengeBoardPlacement {
  return {
    accountId: "acc-1",
    displayName: "FranTheGreat",
    placement: 1,
    elapsedMs: 42_000,
    clickCount: 6,
    ...overrides,
  };
}

const noDnfs: ChallengeBoardDnfRow[] = [];

describe("LeaderboardList: RC-06 tri-state", () => {
  it("defaults to 'ready' when status is omitted, unchanged for any pre-existing caller", () => {
    render(
      <LeaderboardList
        dnfs={noDnfs}
        identityAccountId={null}
        onDisclosePath={vi.fn()}
        pathsUnlocked={false}
        placements={[placement()]}
        runPaths={{}}
      />,
    );
    expect(screen.getByText("FranTheGreat")).toBeVisible();
  });

  it("renders a distinct error + Retry - never 'No completed runs yet.' - and wires Retry through", async () => {
    const onRetry = vi.fn();
    render(
      <LeaderboardList
        dnfs={noDnfs}
        identityAccountId={null}
        onDisclosePath={vi.fn()}
        onRetry={onRetry}
        pathsUnlocked={false}
        placements={[]}
        runPaths={{}}
        status="error"
      />,
    );

    expect(screen.getByText(/couldn.t load the leaderboard/i)).toBeVisible();
    expect(screen.queryByText("No completed runs yet.")).toBeNull();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the genuine empty state only once 'ready' resolves with zero placements", () => {
    render(
      <LeaderboardList
        dnfs={noDnfs}
        identityAccountId={null}
        onDisclosePath={vi.fn()}
        pathsUnlocked={false}
        placements={[]}
        runPaths={{}}
        status="ready"
      />,
    );
    expect(screen.getByText("No completed runs yet.")).toBeVisible();
  });

  it("stages 'loading' honestly - nothing before 300ms, 'Loading board…' at 300ms, never 'No completed runs yet.' meanwhile", () => {
    vi.useFakeTimers();
    try {
      render(
        <LeaderboardList
          dnfs={noDnfs}
          identityAccountId={null}
          onDisclosePath={vi.fn()}
          pathsUnlocked={false}
          placements={[]}
          runPaths={{}}
          status="loading"
        />,
      );
      expect(screen.queryByText(/loading board/i)).toBeNull();
      expect(screen.queryByText("No completed runs yet.")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText(/loading board/i)).toBeVisible();
      expect(screen.queryByText("No completed runs yet.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the DNF section entirely while loading (empty placeholder dnfs), matching the zero-DNF rule", () => {
    render(
      <LeaderboardList
        dnfs={[]}
        identityAccountId={null}
        onDisclosePath={vi.fn()}
        pathsUnlocked={false}
        placements={[]}
        runPaths={{}}
        status="loading"
      />,
    );
    expect(screen.queryByRole("region", { name: "DNF" })).toBeNull();
  });
});
