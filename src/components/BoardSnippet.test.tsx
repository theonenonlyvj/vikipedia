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

function rankedRows(count: number, youRank: number | null): BoardSnippetRow[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return row({
      key: `row-${rank}`,
      rankLabel: `#${rank}`,
      rank,
      displayName: rank === youRank ? "Vijay" : `Player${rank}`,
      isYou: rank === youRank,
    });
  });
}

/**
 * RC-05 (owner ask: "Today's board lists ALL finishers up to ~6 rows"):
 * `maxRows` widens the shared cap without touching Results'/the yesterday
 * card's existing 3-row default - those callers omit the prop entirely.
 */
describe("BoardSnippet: maxRows (RC-05)", () => {
  it("defaults maxRows to 3, unchanged for Results/yesterday callers", () => {
    render(<BoardSnippet title="Yesterday's results" rows={rankedRows(8, null)} />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("Player1")).toBeVisible();
    expect(within(list).getByText("Player3")).toBeVisible();
    expect(within(list).queryByText("Player4")).toBeNull();
  });

  it("still appends your own row below the default 3-row cap when you placed outside it", () => {
    render(<BoardSnippet title="Yesterday's results" rows={rankedRows(8, 5)} />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByText("Vijay")).toBeVisible();
  });

  it("renders all 6 rows with maxRows={6} and no append needed when you're inside the cap", () => {
    render(<BoardSnippet title="Today's board" rows={rankedRows(6, 6)} maxRows={6} />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("Vijay")).toBeVisible();
  });

  it("with 7+ finishers and maxRows={6}, renders 6 plus your appended row when you're outside them", () => {
    render(<BoardSnippet title="Today's board" rows={rankedRows(9, 9)} maxRows={6} />);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(within(list).getByText("Player1")).toBeVisible();
    expect(within(list).getByText("Player6")).toBeVisible();
    expect(within(list).queryByText("Player7")).toBeNull();
    expect(within(list).getByText("Vijay")).toBeVisible();
  });

  it("renders children (the 'see full board' link) in both the populated and empty branches", () => {
    const { rerender } = render(
      <BoardSnippet title="Today's board" rows={rankedRows(6, 6)} maxRows={6}>
        <button type="button">see full board ›</button>
      </BoardSnippet>,
    );
    expect(screen.getByRole("button", { name: /see full board/i })).toBeVisible();

    rerender(
      <BoardSnippet title="Today's board" rows={[]} maxRows={6}>
        <button type="button">see full board ›</button>
      </BoardSnippet>,
    );
    expect(screen.getByRole("button", { name: /see full board/i })).toBeVisible();
  });
});
