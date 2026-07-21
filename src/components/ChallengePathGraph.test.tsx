import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChallengePathGraph, { type ChallengePathRun } from "./ChallengePathGraph";

// GR-1 smoke test: this component's own layout math (x/y placement, label
// collision, entrance timing) is exhaustively documented/self-critiqued in
// the visualize-graph branch's PROTOTYPE.md and was ported verbatim - this
// just confirms it actually renders every player's run as a distinct strand
// once wired into the real app (not the `npx vite` preview page).
const runs: ChallengePathRun[] = [
  {
    player: "Fast",
    status: "completed",
    elapsedMs: 3_000,
    clicks: 2,
    steps: [
      { n: 1, from: "Start", to: "Middle" },
      { n: 2, from: "Middle", to: "Target" },
    ],
  },
  {
    player: "Slow",
    status: "completed",
    elapsedMs: 9_000,
    clicks: 3,
    steps: [
      { n: 1, from: "Start", to: "Other" },
      { n: 2, from: "Other", to: "Middle" },
      { n: 3, from: "Middle", to: "Target" },
    ],
  },
  {
    player: "Quitter",
    status: "abandoned",
    elapsedMs: 5_000,
    clicks: 2,
    steps: [
      { n: 1, from: "Start", to: "Other" },
      { n: 2, from: "Other", to: "Dead End" },
    ],
  },
];

describe("ChallengePathGraph", () => {
  it("renders the merged SVG graph with one legend entry per run", () => {
    render(<ChallengePathGraph runs={runs} />);

    expect(screen.getByRole("img", { name: /merged graph/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /fast/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /slow/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /quitter/i })).toBeVisible();
  });

  it("draws one strand per hop across every run - a 2-hop + 3-hop + 2-hop fixture draws 7 strands", () => {
    const { container } = render(<ChallengePathGraph runs={runs} />);

    const totalSteps = runs.reduce((sum, run) => sum + run.steps.length, 0);
    expect(container.querySelectorAll("path.cpg-edge")).toHaveLength(totalSteps);
  });

  it("marks the abandoned run's terminal node with a DNF stamp, and only that one", () => {
    const { container } = render(<ChallengePathGraph runs={runs} />);

    expect(container.querySelectorAll(".cpg-dnf-stamp")).toHaveLength(1);
    expect(screen.getByText("DNF")).toBeVisible();
  });

  // GX-1: SVG_HEIGHT used to be a flat 560px regardless of lane count,
  // leaving a big void under a solo (or 2-lane) run's graph. Height is now
  // derived from lane count (190 base + 75/lane, clamped [260, 640]) - these
  // pin the exact formula down against 1-, 2-, and the full 6-run fixture's
  // lane counts so a future tweak to the constants is a deliberate choice,
  // not a silent regression.
  describe("lane-count-driven canvas height", () => {
    function svgHeightOf(container: HTMLElement): number {
      const svg = container.querySelector(".cpg-svg");
      const viewBox = svg?.getAttribute("viewBox") ?? "";
      const height = Number(viewBox.split(" ")[3]);
      expect(svg).toHaveAttribute("height", String(height));
      return height;
    }

    it("gives a solo run a short canvas instead of the old fixed 560px void", () => {
      const soloRun: ChallengePathRun[] = [runs[0]];
      const { container } = render(<ChallengePathGraph runs={soloRun} />);
      expect(svgHeightOf(container)).toBe(265);
    });

    it("grows the canvas for a 2-lane run", () => {
      const twoRuns: ChallengePathRun[] = [runs[0], runs[1]];
      const { container } = render(<ChallengePathGraph runs={twoRuns} />);
      expect(svgHeightOf(container)).toBe(340);
    });

    it("clamps a dense multi-lane run at the max instead of growing unbounded", () => {
      const sixRuns: ChallengePathRun[] = [
        ...runs,
        { player: "P4", status: "completed", elapsedMs: 4_000, clicks: 1, steps: [{ n: 1, from: "Start", to: "Target" }] },
        { player: "P5", status: "completed", elapsedMs: 5_000, clicks: 1, steps: [{ n: 1, from: "Start", to: "Target" }] },
        { player: "P6", status: "abandoned", elapsedMs: 6_000, clicks: 1, steps: [{ n: 1, from: "Start", to: "Dead End" }] },
      ];
      const { container } = render(<ChallengePathGraph runs={sixRuns} />);
      expect(svgHeightOf(container)).toBe(640);
    });
  });
});
