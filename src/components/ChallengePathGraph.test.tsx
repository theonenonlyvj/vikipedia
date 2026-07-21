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
});
