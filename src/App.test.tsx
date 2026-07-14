import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { appleParseResponse, fruitParseResponse } from "./test/fixtures";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Vikipedia app", () => {
  it("plays the daily challenge to completion and shows a leaderboard row", async () => {
    let now = 1000;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("page=Fruit")
        ? fruitParseResponse
        : appleParseResponse;

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const user = userEvent.setup();

    render(
      <App
        fetchImpl={fetchImpl}
        now={() => now}
        storage={memoryStorage()}
        todayKey="2026-07-13"
      />,
    );

    await user.clear(await screen.findByLabelText(/display name/i));
    await user.type(screen.getByLabelText(/display name/i), "Vijay");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    await user.click(
      await screen.findByRole("button", { name: /daily challenge/i }),
    );
    expect(await screen.findByRole("heading", { name: "Apple" })).toBeVisible();

    now = 2500;
    await user.click(await screen.findByRole("link", { name: /fruit/i }));

    expect(await screen.findByText(/target reached/i)).toBeVisible();
    expect(screen.getAllByText(/1 click/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Vijay")).toHaveLength(2);
    expect(screen.getByText(/personal stats/i)).toBeVisible();
    expect(screen.getByText(/runs played/i)).toBeVisible();
    expect(screen.getAllByText("Apple").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fruit").length).toBeGreaterThan(0);
  });
});
