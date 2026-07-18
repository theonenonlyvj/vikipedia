import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StateChip from "./StateChip";

describe("StateChip", () => {
  it("renders NEW when there is no outcome entry (never touched)", () => {
    render(<StateChip outcome={undefined} />);
    expect(screen.getByText("NEW")).toBeVisible();
  });

  it("renders DNF for an attempted-never-completed outcome", () => {
    render(<StateChip outcome={{ challengeId: "challenge-0001", outcome: "dnf", best: null }} />);
    expect(screen.getByText("DNF")).toBeVisible();
  });

  it("renders the permanent checkmark with time/clicks for a completed outcome (invariant 2)", () => {
    render(
      <StateChip
        outcome={{
          challengeId: "challenge-0001",
          outcome: "completed",
          best: { elapsedMs: 42_000, clickCount: 6 },
        }}
      />,
    );
    expect(screen.getByText("✓ 0:42 · 6 clk")).toBeVisible();
  });
});
