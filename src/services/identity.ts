import type { VGamesAccount } from "../domain/types";

const STORAGE_KEY = "vikipedia.vgames.identity.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface VGamesIdentityClient {
  quickAuth(): Promise<VGamesAccount>;
  updateDisplayName(displayName: string): Promise<VGamesAccount>;
  getCurrentAccount(): Promise<VGamesAccount | null>;
  signOutLocalOnly(): Promise<void>;
}

export function createLocalVGamesIdentityClient(
  storage: StorageLike,
): VGamesIdentityClient {
  return {
    async quickAuth() {
      const existing = readAccount(storage);
      if (existing) {
        return existing;
      }

      const account: VGamesAccount = {
        accountId: `acct_local_${randomId()}`,
        displayName: "Guest",
        status: "ghost",
        token: `mock_${randomId()}`,
      };
      writeAccount(storage, account);
      return account;
    },

    async updateDisplayName(displayName: string) {
      const account = (await this.quickAuth()) satisfies VGamesAccount;
      const next = {
        ...account,
        displayName: normalizeDisplayName(displayName),
      };
      writeAccount(storage, next);
      return next;
    },

    async getCurrentAccount() {
      return readAccount(storage);
    },

    async signOutLocalOnly() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}

function readAccount(storage: StorageLike): VGamesAccount | null {
  const value = storage.getItem(STORAGE_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as VGamesAccount;
    if (!parsed.accountId || !parsed.token) {
      return null;
    }
    return parsed;
  } catch {
    storage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, value);
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeAccount(storage: StorageLike, account: VGamesAccount): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(account));
}

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  return trimmed || "Guest";
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll("-", "");
  }

  return Math.random().toString(36).slice(2);
}
