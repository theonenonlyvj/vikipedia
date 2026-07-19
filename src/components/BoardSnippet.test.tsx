import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BoardSnippet from "./BoardSnippet";
import type { BoardSnippetRow } from "../domain/boardSnippet";

function row(overrides: Partial<BoardSnippetRow> = {}): BoardSnippetRow {
  return {
    key: "row-1",
    rankLabel: "#1",
    rank: 1,
    displayName: "FranTheGreat",
    elapsedMs: 42_000,
    clickCount: 6,
    isYou: false,
    ...overrides,
  };
}

/**
 * QF-04 (council 2026-07-19, owner-proxy ruling): a genuine DNF rank never
 * shares the CTA-teal color a real placement gets - it's the same
 * `.rank`/`.rank-dnf` split now shared by all three DNF-rank renderers
 * (BoardSnippet, Boards' inline Stats DNF section, Challenge Detail's
 * LeaderboardList). The branch is on `rankLabel === "DNF"`, not the
 * nullable `rank` field - a completed-but-unranked run also carries
 * `rank: null` but reads "—", never "DNF" (a completion is never demoted
 * to DNF display).
 */
describe("BoardSnippet: DNF rank color (QF-04)", () => {
  it("marks a genuine DNF row with .rank-dnf, not a real placement", () => {
    render(
      <BoardSnippet
        title="Today's board"
        rows={[
          row({ key: "placement", rankLabel: "#1", rank: 1 }),
          row({ key: "dnf", rankLabel: "DNF", rank: null, displayName: "Loser" }),
        ]}
      />,
    );

    const placementRow = screen.getByText("FranTheGreat").closest("li")!;
    expect(within(placementRow).getByText("#1")).toHaveClass("rank");
    expect(within(placementRow).getByText("#1")).not.toHaveClass("rank-dnf");

    const dnfRow = screen.getByText("Loser").closest("li")!;
    expect(within(dnfRow).getByText("DNF")).toHaveClass("rank", "rank-dnf");
  });

  it("never demotes a completed-but-unranked '—' row to DNF-red - rank: null alone is not DNF", () => {
    render(
      <BoardSnippet
        title="Results board"
        rows={[row({ key: "unranked", rankLabel: "—", rank: null, displayName: "StillFinished" })]}
      />,
    );

    const unrankedRow = screen.getByText("StillFinished").closest("li")!;
    const rankSpan = within(unrankedRow).getByText("—");
    expect(rankSpan).toHaveClass("rank");
    expect(rankSpan).not.toHaveClass("rank-dnf");
  });
});
