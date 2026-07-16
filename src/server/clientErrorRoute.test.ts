import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { createWorker, type Env as WorkerEnv, type WorkerTracking } from "./worker";

function baseEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    VWIKI_RACE_DB: {} as D1Database,
    VGAMES_URL: "https://vgames.example",
    ALLOWED_ORIGINS: "https://vwikirace.pages.dev",
    CLICK_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ACCOUNT_READ_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  } as WorkerEnv;
}

function emptyTracking(): WorkerTracking {
  return {} as unknown as WorkerTracking;
}

function postClientError(
  worker: ReturnType<typeof createWorker>,
  env: WorkerEnv,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return worker.fetch(
    new Request("https://worker.example/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /api/client-error", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("accepts a valid payload, logs it, and returns 204 with no body", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "window",
      name: "TypeError",
      message: "Cannot read properties of undefined",
      stack: "TypeError: boom\n  at foo (bar.js:1:1)",
      url: "/race/challenge-1",
      userAgent: "Mozilla/5.0",
      ts: "2026-07-16T00:00:00.000Z",
    }, { Origin: "https://vwikirace.pages.dev" });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://vwikirace.pages.dev",
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged).toMatchObject({
      type: "client_error",
      source: "window",
      name: "TypeError",
      message: "Cannot read properties of undefined",
      url: "/race/challenge-1",
      userAgent: "Mozilla/5.0",
      ts: "2026-07-16T00:00:00.000Z",
    });
    expect(typeof logged.requestId).toBe("string");
    expect(logged.requestId.length).toBeGreaterThan(0);
  });

  it("requires no authentication", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "manual",
      name: "Error",
      message: "no auth needed",
    });

    expect(response.status).toBe(204);
  });

  it("accepts a minimal payload with only the required fields", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "unhandledrejection",
      name: "Error",
      message: "minimal",
    });

    expect(response.status).toBe(204);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged.stack).toBeUndefined();
    expect(logged.url).toBeUndefined();
    expect(logged.userAgent).toBeUndefined();
  });

  it("rejects a body over the 8 KiB cap with 413", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "manual",
      name: "Error",
      message: "x".repeat(9000),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "body_too_large" },
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed shapes with 400", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const invalidBodies: unknown[] = [
      null,
      [],
      { source: "not-a-real-source", name: "Error", message: "msg" },
      { name: "Error", message: "msg" },
      { source: "window", name: 7, message: "msg" },
      { source: "window", message: "msg" },
      { source: "window", name: "Error", message: "" },
      { source: "window", name: "Error" },
      { source: "window", name: "Error", message: "msg", stack: 12345 },
      { source: "window", name: "Error", message: "msg", url: 12345 },
      { source: "window", name: "Error", message: "msg", userAgent: 12345 },
      { source: "window", name: "Error", message: "msg", ts: 12345 },
    ];

    for (const body of invalidBodies) {
      const response = await postClientError(worker, env, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: expect.any(String) },
      });
    }
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("rejects non-JSON bodies with 400", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, "not-json-{{{");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_json" },
    });
  });

  it("truncates oversized fields before logging", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "error-boundary",
      name: "Error",
      message: "m".repeat(600),
      stack: "s".repeat(5000),
      url: "u".repeat(600),
      userAgent: "a".repeat(600),
    });

    expect(response.status).toBe(204);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged.message).toHaveLength(512);
    expect(logged.stack).toHaveLength(4096);
    expect(logged.url).toHaveLength(512);
    expect(logged.userAgent).toHaveLength(512);
  });

  it("returns 429 with Retry-After when the client-error rate limiter rejects", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const limit = vi.fn(async () => ({ success: false }));
    const env = baseEnv({ CLIENT_ERROR_RATE_LIMITER: { limit } });

    const response = await postClientError(worker, env, {
      source: "manual",
      name: "Error",
      message: "rate limited",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "client_error_rate_limited" },
    });
    expect(limit).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("skips rate limiting rather than crashing when the binding is absent", async () => {
    const worker = createWorker({ createTracking: emptyTracking });
    const env = baseEnv();

    const response = await postClientError(worker, env, {
      source: "manual",
      name: "Error",
      message: "no binding present, should still work",
    });

    expect(response.status).toBe(204);
  });
});

describe("error() unhandled exception logging", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function trackingThatThrows(thrown: unknown): WorkerTracking {
    return {
      handlers: {
        listChallenges: vi.fn(async () => {
          throw thrown;
        }),
      },
    } as unknown as WorkerTracking;
  }

  it("logs name/message/stack for a thrown Error while still returning the generic 500", async () => {
    const worker = createWorker({ createTracking: () => trackingThatThrows(new Error("boom")) });
    const env = baseEnv();

    const response = await worker.fetch(
      new Request("https://worker.example/api/v2/challenges"),
      env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "internal_error", message: "Something went wrong." },
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged.type).toBe("unhandled_error");
    expect(logged.name).toBe("Error");
    expect(logged.message).toBe("boom");
    expect(typeof logged.stack).toBe("string");
    expect(logged.requestId).toBe(response.headers.get("X-Request-Id"));
  });

  it("tolerates non-Error throwables", async () => {
    const worker = createWorker({ createTracking: () => trackingThatThrows("just a string") });
    const env = baseEnv();

    const response = await worker.fetch(
      new Request("https://worker.example/api/v2/challenges"),
      env,
    );

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged.type).toBe("unhandled_error");
    expect(typeof logged.name).toBe("string");
    expect(logged.message).toContain("just a string");
  });

  it("truncates a very long stack to 4096 chars", async () => {
    const thrown = new Error("boom");
    thrown.stack = "x".repeat(5000);
    const worker = createWorker({ createTracking: () => trackingThatThrows(thrown) });
    const env = baseEnv();

    await worker.fetch(new Request("https://worker.example/api/v2/challenges"), env);

    const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(logged.stack).toHaveLength(4096);
  });

  it("does not log for expected ApiError rejections (only unhandled exceptions)", async () => {
    const tracking = {
      authorize: vi.fn(async () => {
        throw new ApiError("unauthorized", "Sign in before changing VWiki Race.", 401);
      }),
    } as unknown as WorkerTracking;
    const worker = createWorker({ createTracking: () => tracking });
    const env = baseEnv();

    const response = await worker.fetch(
      new Request("https://worker.example/api/v2/runs/does-not-exist/click", {
        method: "POST",
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
