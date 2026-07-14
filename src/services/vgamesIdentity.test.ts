import { describe, expect, it, vi } from "vitest";
import {
  createVGamesIdentityClient,
  createVGamesIdentityRepository,
  type StorageLike,
} from "./vgamesIdentity";

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
      "vikipedia:vgames-session",
      JSON.stringify({ accountId: "acc-1" }),
    );

    expect(createVGamesIdentityRepository(storage).getSession()).toBeNull();
    expect(storage.getItem("vikipedia:vgames-session")).toBeNull();
  });
});

describe("VGames identity client", () => {
  it("creates a guest through the Vikipedia identity proxy", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-guest",
        displayName: "Casey",
        token: "jwt-guest",
        status: "ghost",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl);

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
      "/api/identity/guest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          displayName: "Casey",
        }),
      }),
    );
  });

  it("secures the current guest and returns the refreshed claimed session", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-claimed",
        displayName: "vijay",
        token: "jwt-claimed",
        status: "claimed",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl);

    await expect(
      client.secureGuest({
        deviceCredential: "cred-123456789012",
        token: "jwt-guest",
        username: "vijay",
        password: "secret-pass",
      }),
    ).resolves.toMatchObject({
      accountId: "acc-claimed",
      displayName: "vijay",
      token: "jwt-claimed",
      status: "claimed",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/identity/secure",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          token: "jwt-guest",
          username: "vijay",
          password: "secret-pass",
        }),
      }),
    );
  });

  it("logs into an existing VGames account", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json({
        accountId: "acc-claimed",
        displayName: "vijay",
        token: "jwt-claimed",
        status: "claimed",
      });
    });
    const client = createVGamesIdentityClient(fetchImpl);

    await expect(
      client.login({
        deviceCredential: "cred-123456789012",
        username: "vijay",
        password: "secret-pass",
      }),
    ).resolves.toMatchObject({
      accountId: "acc-claimed",
      status: "claimed",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/identity/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceCredential: "cred-123456789012",
          username: "vijay",
          password: "secret-pass",
        }),
      }),
    );
  });

  it("surfaces identity API error messages", async () => {
    const fetchImpl = vi.fn(async () => {
      return Response.json(
        { error: { message: "That name is already taken." } },
        { status: 409 },
      );
    });
    const client = createVGamesIdentityClient(fetchImpl);

    await expect(
      client.login({
        deviceCredential: "cred-123456789012",
        username: "vijay",
        password: "wrong-pass",
      }),
    ).rejects.toThrow("That name is already taken.");
  });
});
