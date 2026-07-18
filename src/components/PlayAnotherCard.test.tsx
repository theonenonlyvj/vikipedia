import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PlayAnotherCard from "./PlayAnotherCard";
import type { Challenge } from "../domain/types";

const suggestedChallenge: Challenge = {
  id: "challenge-0002",
  label: "Challenge #2",
  mode: "solo",
  start: { title: "Mars" },
  target: { title: "Water" },
  ruleset: "ranked_classic",
  source: "curated",
};

function renderCard(overrides: Partial<Parameters<typeof PlayAnotherCard>[0]> = {}) {
  const onOpenChallenge = vi.fn();
  const onBrowseChallenges = vi.fn();
  const onCreateRandomChallenge = vi.fn();
  const props = {
    suggestion: { status: "loading" as const },
    onOpenChallenge,
    onBrowseChallenges,
    randomChallengeBusy: false,
    randomChallengeError: null,
    onCreateRandomChallenge,
    ...overrides,
  };
  render(<PlayAnotherCard {...props} />);
  return { onOpenChallenge, onBrowseChallenges, onCreateRandomChallenge };
}

describe("PlayAnotherCard", () => {
  it("always renders the Browse-all link, and the heading", () => {
    renderCard();
    expect(screen.getByRole("region", { name: /play another challenge/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /browse all challenges/i })).toBeVisible();
  });

  it("shows a specific suggestion with player count, opening Detail (Browse-card-consistent route) on click", async () => {
    const user = userEvent.setup();
    const { onOpenChallenge } = renderCard({
      suggestion: { status: "ready", challenge: suggestedChallenge, playerCount: 4 },
    });

    const suggestionButton = screen.getByRole("button", { name: /🏁 mars → water · 4 players/i });
    expect(suggestionButton).toBeVisible();
    await user.click(suggestionButton);
    expect(onOpenChallenge).toHaveBeenCalledWith("challenge-0002");
  });

  it("omits player count when unknown rather than fabricating it", () => {
    renderCard({ suggestion: { status: "ready", challenge: suggestedChallenge, playerCount: null } });
    expect(screen.getByRole("button", { name: /^🏁 mars → water$/i })).toBeVisible();
  });

  it("swaps to 'Create a random new one' when the suggestion is empty (started everything)", () => {
    renderCard({ suggestion: { status: "empty" } });
    expect(screen.getByRole("button", { name: /create a random new one/i })).toBeEnabled();
    expect(screen.queryByText(/🏁/)).toBeNull();
  });

  it("fires onCreateRandomChallenge from the empty slot", async () => {
    const user = userEvent.setup();
    const { onCreateRandomChallenge } = renderCard({ suggestion: { status: "empty" } });

    await user.click(screen.getByRole("button", { name: /create a random new one/i }));
    expect(onCreateRandomChallenge).toHaveBeenCalledTimes(1);
  });

  it("shows the bounded loading copy and disables the button while a random challenge is in flight (no double-fire)", async () => {
    const user = userEvent.setup();
    const { onCreateRandomChallenge } = renderCard({
      suggestion: { status: "empty" },
      randomChallengeBusy: true,
    });

    const button = screen.getByRole("button", { name: /rolling the dice on wikipedia/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onCreateRandomChallenge).not.toHaveBeenCalled();
  });

  it("shows a random-challenge error message respecting the caller's copy (e.g. Retry-After-derived)", () => {
    renderCard({
      suggestion: { status: "empty" },
      randomChallengeError: "Wikipedia wasn't cooperating — try again.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Wikipedia wasn't cooperating — try again.");
  });

  it("renders neither a suggestion nor create-random while loading or on a fetch error (F6: never fake the empty state)", () => {
    renderCard({ suggestion: { status: "loading" } });
    expect(screen.queryByText(/🏁/)).toBeNull();
    expect(screen.queryByRole("button", { name: /create a random new one/i })).toBeNull();

    renderCard({ suggestion: { status: "error" } });
    expect(screen.queryByText(/🏁/)).toBeNull();
    expect(screen.queryByRole("button", { name: /create a random new one/i })).toBeNull();
  });
});
