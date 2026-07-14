import { render, screen, waitFor } from "@testing-library/react";
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
  it("requires a display name before creating a persisted VGames guest session", async () => {
    const storage = memoryStorage();
    const fetchImpl = createFetchMock();
    const user = userEvent.setup();

    render(<App fetchImpl={fetchImpl} storage={storage} />);

    expect(await screen.findByText(/secure your display name/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /start challenge #1/i })).toBeNull();

    await user.type(screen.getByLabelText(/display name/i), "Vijay");
    await user.click(screen.getByRole("button", { name: /play as guest/i }));

    expect(await screen.findByRole("button", { name: /start challenge #1/i })).toBeVisible();
    expect(JSON.parse(storage.getItem("vikipedia:vgames-session") ?? "{}")).toEqual({
      accountId: "acc-guest",
      displayName: "Vijay",
      token: "jwt-guest",
      status: "ghost",
    });
  });

  it("skips the entry gate when a VGames session is already cached", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "vikipedia:vgames-session",
      JSON.stringify({
        accountId: "acc-1",
        displayName: "Vijay",
        token: "jwt-claimed",
        status: "claimed",
      }),
    );

    render(<App fetchImpl={createFetchMock()} storage={storage} />);

    expect(await screen.findByRole("button", { name: /start challenge #1/i })).toBeVisible();
    expect(screen.queryByText(/enter vikipedia/i)).toBeNull();
    expect(screen.getByRole("status", { name: /current player/i })).toHaveTextContent(
      "Vijay",
    );
  });

  it("secures a display name through VGames before entering the site", async () => {
    const storage = memoryStorage();
    const fetchImpl = createFetchMock();
    const user = userEvent.setup();

    render(<App fetchImpl={fetchImpl} storage={storage} />);

    await user.type(screen.getByLabelText(/display name/i), "vijay");
    await user.type(screen.getByLabelText(/password/i), "secret-pass");
    await user.click(
      screen.getByRole("button", { name: /secure display name \/ log in/i }),
    );

    expect(await screen.findByRole("button", { name: /start challenge #1/i })).toBeVisible();
    expect(JSON.parse(storage.getItem("vikipedia:vgames-session") ?? "{}")).toMatchObject({
      accountId: "acc-claimed",
      displayName: "vijay",
      token: "jwt-claimed",
      status: "claimed",
    });
  });

  it("tracks the run on the server with the VGames session token", async () => {
    let now = 1000;
    const fetchImpl = createFetchMock();
    const user = userEvent.setup();

    render(
      <App
        fetchImpl={fetchImpl}
        now={() => now}
        storage={memoryStorage()}
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), "Vijay");
    await user.click(screen.getByRole("button", { name: /play as guest/i }));
    await user.click(
      await screen.findByRole("button", { name: /start challenge #1/i }),
    );
    expect(await screen.findByRole("heading", { name: "Apple" })).toBeVisible();

    now = 2500;
    await user.click(await screen.findByRole("link", { name: /fruit/i }));

    expect(await screen.findByText(/target reached/i)).toBeVisible();
    expect(await screen.findByText("Vijay")).toBeVisible();
    expect(screen.getAllByText(/1 click/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1\.5s/i).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/runs/run-1/complete",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer jwt-guest",
          }),
          method: "POST",
        }),
      );
    });
  });

  it("creates the next numbered challenge from the Challenges tab", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "vikipedia:vgames-session",
      JSON.stringify({
        accountId: "acc-1",
        displayName: "Vijay",
        token: "jwt-claimed",
        status: "claimed",
      }),
    );
    const fetchImpl = createFetchMock();
    const user = userEvent.setup();

    render(<App fetchImpl={fetchImpl} storage={storage} />);

    await user.click(await screen.findByRole("button", { name: /challenges/i }));
    await user.type(screen.getByLabelText(/start article/i), "Mars");
    await user.type(screen.getByLabelText(/target article/i), "Water");
    await user.click(screen.getByRole("button", { name: /create challenge/i }));

    expect(
      await screen.findByRole("button", { name: /start challenge #2/i }),
    ).toBeVisible();
    expect((await screen.findAllByText(/mars -> water/i)).length).toBeGreaterThan(
      0,
    );
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/challenges",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer jwt-claimed",
          }),
          body: JSON.stringify({ startTitle: "Mars", targetTitle: "Water" }),
        }),
      );
    });
  });
});

function createFetchMock() {
  let completed = false;
  let challenges = [
    {
      id: "challenge-0001",
      label: "Challenge #1",
      sortOrder: 1,
      isActive: true,
      mode: "daily",
      start: { title: "Apple" },
      target: { title: "Fruit" },
      ruleset: "ranked_classic",
      source: "curated",
    },
  ];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/challenges" && method === "POST") {
      expect(readJsonBody(init)).toEqual({
        startTitle: "Mars",
        targetTitle: "Water",
      });
      const challenge = {
        id: "challenge-0002",
        label: "Challenge #2",
        sortOrder: 2,
        isActive: true,
        mode: "daily",
        start: { title: "Mars" },
        target: { title: "Water" },
        ruleset: "ranked_classic",
        source: "curated",
      };
      challenges = [...challenges, challenge];
      return jsonResponse({ challenge });
    }

    if (url === "/api/challenges") {
      return jsonResponse({
        challenges,
      });
    }

    if (url === "/api/identity/guest") {
      const body = readJsonBody(init) as { displayName: string };
      return jsonResponse({
        accountId: "acc-guest",
        displayName: body.displayName,
        token: "jwt-guest",
        status: "ghost",
      });
    }

    if (url === "/api/identity/secure") {
      expect(readJsonBody(init)).toMatchObject({
        username: "vijay",
        password: "secret-pass",
      });
      return jsonResponse({
        accountId: "acc-claimed",
        displayName: "vijay",
        token: "jwt-claimed",
        status: "claimed",
      });
    }

    if (url === "/api/identity/login") {
      expect(readJsonBody(init)).toMatchObject({
        username: "vijay",
        password: "secret-pass",
      });
      return jsonResponse({
        accountId: "acc-claimed",
        displayName: "vijay",
        token: "jwt-claimed",
        status: "claimed",
      });
    }

    if (url === "/api/runs/start") {
      expect(readJsonBody(init)).toEqual({
        challengeId: "challenge-0001",
        publicName: "Vijay",
      });
      expect(init?.headers).toMatchObject({
        Authorization: expect.stringMatching(/^Bearer jwt-/),
      });
      return jsonResponse({
        run: {
          id: "run-1",
          challengeId: "challenge-0001",
          accountId: "acc-guest",
          status: "active",
          startTitle: "Apple",
          targetTitle: "Fruit",
          clickCount: 0,
          startedAt: "2026-07-14T01:00:00.000Z",
        },
      });
    }

    if (url === "/api/runs/run-1/click") {
      expect(readJsonBody(init)).toMatchObject({
        sourceTitle: "Apple",
        clickedAnchorText: "fruit",
        requestedTitle: "Fruit",
        destinationTitle: "Fruit",
        destinationPageId: 10843,
        clientTimestampMs: 2500,
      });
      return jsonResponse({ clickCount: 1 });
    }

    if (url === "/api/runs/run-1/complete") {
      completed = true;
      expect(readJsonBody(init)).toEqual({
        finalTitle: "Fruit",
        clientTimestampMs: 2500,
      });
      return jsonResponse({
        leaderboardRow: {
          rank: 1,
          runId: "run-1",
          challengeId: "challenge-0001",
          accountId: "acc-guest",
          displayName: "Vijay",
          elapsedMs: 1500,
          clickCount: 1,
          completedAt: "2026-07-14T01:00:01.500Z",
          pathPreview: [],
        },
      });
    }

    if (url === "/api/challenges/challenge-0001/leaderboard") {
      return jsonResponse({
        leaderboard: completed
          ? [
              {
                rank: 1,
                runId: "run-1",
                challengeId: "challenge-0001",
                accountId: "acc-guest",
                displayName: "Vijay",
                elapsedMs: 1500,
                clickCount: 1,
                completedAt: "2026-07-14T01:00:01.500Z",
                pathPreview: [
                  {
                    stepNumber: 1,
                    sourceTitle: "Apple",
                    clickedAnchorText: "fruit",
                    destinationTitle: "Fruit",
                    destinationPageId: 10843,
                    elapsedSinceStartMs: 1500,
                    createdAt: "2026-07-14T01:00:01.500Z",
                  },
                ],
              },
            ]
          : [],
      });
    }

    const body = url.includes("page=Fruit")
      ? fruitParseResponse
      : appleParseResponse;
    return jsonResponse(body);
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function readJsonBody(init?: RequestInit): unknown {
  return JSON.parse(String(init?.body ?? "{}"));
}
