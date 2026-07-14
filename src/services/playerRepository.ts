import type { PlayerRecord } from "../server/trackingRepository";

export interface PlayerProfile {
  id?: string;
  displayName: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlayerRepository {
  getPlayerProfile(): PlayerProfile | null;
  getPlayer(): PlayerRecord | null;
  saveDisplayName(displayName: string): PlayerProfile;
  savePlayer(player: PlayerRecord): void;
  clearPlayer(): void;
}

const PLAYER_STORAGE_KEY = "vikipedia:v0-player";

export function createPlayerRepository(
  storage: StorageLike,
): PlayerRepository {
  const readProfile = (): PlayerProfile | null => {
    const raw = storage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      if (
        typeof parsed.displayName !== "string" ||
        parsed.displayName.trim().length === 0 ||
        (parsed.id !== undefined && typeof parsed.id !== "string")
      ) {
        storage.removeItem(PLAYER_STORAGE_KEY);
        return null;
      }

      const displayName = parsed.displayName.trim().slice(0, 24);
      return parsed.id
        ? { id: parsed.id, displayName }
        : { displayName };
    } catch {
      storage.removeItem(PLAYER_STORAGE_KEY);
      return null;
    }
  };

  const writeProfile = (profile: PlayerProfile) => {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(profile));
  };

  return {
    getPlayerProfile() {
      return readProfile();
    },
    getPlayer() {
      const profile = readProfile();
      if (!profile?.id) {
        return null;
      }

      return {
        id: profile.id,
        displayName: profile.displayName,
      };
    },
    saveDisplayName(displayName) {
      const cleanDisplayName = displayName.trim().slice(0, 24);
      const existing = readProfile();
      const profile =
        existing?.id !== undefined
          ? { id: existing.id, displayName: cleanDisplayName }
          : { displayName: cleanDisplayName };
      writeProfile(profile);
      return profile;
    },
    savePlayer(player) {
      writeProfile({
        id: player.id,
        displayName: player.displayName,
      });
    },
    clearPlayer() {
      storage.removeItem(PLAYER_STORAGE_KEY);
    },
  };
}
