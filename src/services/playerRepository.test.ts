import { describe, expect, it } from "vitest";
import {
  createPlayerRepository,
  type StorageLike,
} from "./playerRepository";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("player repository", () => {
  it("persists a display-name-only profile before a server player exists", () => {
    const storage = memoryStorage();
    const repository = createPlayerRepository(storage);

    repository.saveDisplayName("Vijay");

    expect(createPlayerRepository(storage).getPlayerProfile()).toEqual({
      displayName: "Vijay",
    });
  });

  it("persists only the server player id and display name", () => {
    const storage = memoryStorage();
    const repository = createPlayerRepository(storage);

    repository.savePlayer({ id: "player-1", displayName: "Vijay" });

    expect(createPlayerRepository(storage).getPlayerProfile()).toEqual({
      id: "player-1",
      displayName: "Vijay",
    });
  });

  it("clears invalid cached player records", () => {
    const storage = memoryStorage();
    storage.setItem("vikipedia:v0-player", JSON.stringify({ id: "player-1" }));

    expect(createPlayerRepository(storage).getPlayerProfile()).toBeNull();
    expect(storage.getItem("vikipedia:v0-player")).toBeNull();
  });
});
