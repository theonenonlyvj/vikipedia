import { describe, expect, it, vi } from "vitest";
import {
  createVGamesIdentityClient,
  createVGamesIdentityRepository,
  type StorageLike,
  vgamesIdentityErrorMessage,
} from "./vgamesIdentity";
import { ApiRequestError } from "./apiRequest";

const apiOrigin = "https://vwikirace-api.example.workers.dev";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function fixedCrypto(): Pick<Crypto, "getRandomValues"> {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      const bytes = array as Uint8Array;
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index + 1;
      }
      return array;
    },
  };
}

describe("VGames identity repository", () => {
  const legacySessionStorageKey = `${["viki", "pedia"].join("")}:vgames-session`;

  it("mints and persists a stable 256-bit device credential", () => {
    const storage = memoryStorage();
    const repository = createVGamesIdentityRepository(storage, fixedCrypto());

    expect(repository.getDeviceCredential()).toBe(
      "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    );
    expect(createVGamesIdentityRepository(storage).getDeviceCredential()).toBe(
      "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    );
  });

  it("persists and clears the current identity session", () => {
    const storage = memoryStorage();
    const repository = createVGamesIdentityRepository(storage);

    repository.saveSession({
      accountId: "acc-1",
      displayName: "Vijay",
      token: "jwt-1",
      status: "ghost",
    });

    expect(createVGamesIdentityRepository(storage).getSession()).toEqual({
      accountId: "acc-1",
      displayName: "Vijay",
      token: "jwt-1",
      status: "ghost",
    });

    repository.clearSession();

    expect(repository.getSession()).toBeNull();
  });

  it("clears invalid cached sessions", () => {
    const storage = memoryStorage();
    storage.setItem(
      "vwiki-race:vgames-session",
      JSON.stringify({ accountId: "acc-1" }),
    );

    expect(createVGamesIdentityRepository(storage).getSession()).toBeNull();
    expect(storage.getItem("vwiki-race:vgames-session")).toBeNull();
  });

  it("migrates valid legacy sessions to the VWiki Race storage key", () => {
    const storage = memoryStorage();
    storage.setItem(
      legacySessionStorageKey,
      JSON.stringify({
        accountId: "acc-1",
        displayName: "Vijay",
        token: "jwt-guest",
        status: "ghost",
      }),
    );

    expect(createVGamesIdentityRepository(storage).getSession()).toEqual({
      accountId: "acc-1",
      displayName: "Vijay",
      token: "jwt-guest",
      status: "ghost",
    });
    expect(storage.getItem(legacySessionStorageKey)).toBeNull();
    expect(JSON.parse(storage.getItem("vwiki-race:vgames-session") ?? "{}")).toEqual({
      accountId: "acc-1",
      displayName: "Vijay",
      token: "jwt-guest",
      status: "ghost",
    });
  });

  it("keeps identity usable in tab memory when browser storage is blocked", () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    };
    const repository = createVGamesIdentityRepository(storage, fixedCrypto());

    const credential = repository.getDeviceCredential();
    expect(repository.getDeviceCredential()).toBe(credential);
    expect(repository.getSession()).toBeNull();

    const session = {
      accountId: "acc-1",
      displayName: "Vijay",
      token: "jwt-1",
      status: "claimed" as const,
    };
    repository.saveSession(session);
    expect(repository.getSession()).toEqual(session);

    repository.clearSession();
    expect(repository.getSession()).toBeNull();
  });
});

describe("VGames identity client", () => {
  it("creates a guest through the VWiki Race identity proxy", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-guest",
        displayName: "Casey",
        token: "jwt-guest",
        status: "ghost",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(
      client.playAsGuest({
        deviceCredential: "cred-123456789012",
        displayName: "Casey",
      }),
    ).resolves.toEqual({
      accountId: "acc-guest",
      displayName: "Casey",
      token: "jwt-guest",
      status: "ghost",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${apiOrigin}/api/v2/identity/guest`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          displayName: "Casey",
        }),
      }),
    );
  });

  it("secures a guest through the VWiki Race identity proxy", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-claimed",
        displayName: "casey",
        token: "jwt-claimed",
        status: "claimed",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(
      client.secureGuest({
        deviceCredential: "cred-123456789012",
        token: "jwt-guest",
        username: "casey",
        password: "secret-pass",
      }),
    ).resolves.toMatchObject({
      accountId: "acc-claimed",
      displayName: "casey",
      token: "jwt-claimed",
      status: "claimed",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${apiOrigin}/api/v2/identity/secure`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          token: "jwt-guest",
          username: "casey",
          password: "secret-pass",
        }),
      }),
    );
  });

  it("logs in through the VWiki Race identity proxy", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-claimed",
        displayName: "casey",
        token: "jwt-claimed",
        status: "claimed",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(
      client.login({
        deviceCredential: "cred-123456789012",
        username: "casey",
        password: "secret-pass",
      }),
    ).resolves.toMatchObject({
      accountId: "acc-claimed",
      displayName: "casey",
      token: "jwt-claimed",
      status: "claimed",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${apiOrigin}/api/v2/identity/login`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          username: "casey",
          password: "secret-pass",
        }),
      }),
    );
  });

  it("retries one transient login failure with the same operation key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "vgames_identity_unavailable", message: "Try again." } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({
        accountId: "acc-claimed",
        displayName: "casey",
        token: "jwt-claimed",
        status: "claimed",
      }));
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(client.login({
      deviceCredential: "cred-123456789012",
      username: "casey",
      password: "secret-pass",
    })).resolves.toMatchObject({ accountId: "acc-claimed", status: "claimed" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toMatch(/\S/);
    expect(secondHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);
  });

  it("fails a stalled first login attempt over to the retry at 4s and reports the retry", async () => {
    vi.useFakeTimers();
    try {
      const session = {
        accountId: "acc-claimed",
        displayName: "casey",
        token: "jwt-claimed",
        status: "claimed",
      };
      const fetchImpl = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const attempt = fetchImpl.mock.calls.length;
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
            if (attempt === 2) {
              resolve(Response.json(session));
            }
          }),
      );
      const onRetry = vi.fn();
      const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

      const login = client.login(
        {
          deviceCredential: "cred-123456789012",
          username: "casey",
          password: "secret-pass",
        },
        { onRetry },
      );
      const assertion = expect(login).resolves.toMatchObject({
        accountId: "acc-claimed",
        status: "claimed",
      });

      // The stalled first attempt is cut at the 4s leash (not 15s) and the
      // caller hears about the retry so it can show honest progress copy.
      await vi.advanceTimersByTimeAsync(4_000);
      expect(onRetry).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(250);
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      // Same idempotency key on both attempts - one login, not two.
      const firstHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
      const secondHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>;
      expect(secondHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces identity API error messages", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json(
        { error: { message: "That name is already taken." } },
        { status: 409 },
      );
    });
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(
      client.playAsGuest({
        deviceCredential: "cred-123456789012",
        displayName: "Vijay",
      }),
    ).rejects.toThrow("That name is already taken.");
  });

  it("rejects malformed successful identity responses", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ accountId: "acc-guest" }));
    const client = createVGamesIdentityClient(fetchImpl, { apiOrigin });

    await expect(
      client.playAsGuest({
        deviceCredential: "cred-123456789012",
        displayName: "Casey",
      }),
    ).rejects.toMatchObject({ code: "invalid_response", status: 502 });
  });
});

describe("VGames identity error copy", () => {
  it("maps reserved account and guest names to actionable messages", () => {
    expect(
      vgamesIdentityErrorMessage(
        new ApiRequestError("username_taken", "username_taken", 409),
        "fallback",
      ),
    ).toBe("That VGames username is already taken.");
    expect(
      vgamesIdentityErrorMessage(
        new ApiRequestError("name_reserved", "name_reserved", 409),
        "fallback",
      ),
    ).toMatch(/belongs to an existing VGames account/i);
  });
});
