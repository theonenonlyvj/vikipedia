import { describe, expect, it } from "vitest";
import {
  createLocalVGamesIdentityClient,
  type StorageLike,
} from "./identity";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("local VGames identity client", () => {
  it("mints and reuses a ghost account from local storage", async () => {
    const storage = memoryStorage();
    const firstClient = createLocalVGamesIdentityClient(storage);
    const first = await firstClient.quickAuth();
    const secondClient = createLocalVGamesIdentityClient(storage);
    const second = await secondClient.quickAuth();

    expect(first.accountId).toMatch(/^acct_local_/);
    expect(first.status).toBe("ghost");
    expect(first.displayName).toBe("Guest");
    expect(second).toEqual(first);
  });

  it("updates and persists display name without changing account identity", async () => {
    const storage = memoryStorage();
    const client = createLocalVGamesIdentityClient(storage);
    const first = await client.quickAuth();
    const renamed = await client.updateDisplayName("Vijay");
    const restored = await createLocalVGamesIdentityClient(storage).quickAuth();

    expect(renamed.accountId).toBe(first.accountId);
    expect(renamed.displayName).toBe("Vijay");
    expect(restored.displayName).toBe("Vijay");
  });
});
