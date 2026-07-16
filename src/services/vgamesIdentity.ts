export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type VGamesIdentityStatus = "ghost" | "claimed";

export interface VGamesIdentitySession {
  accountId: string;
  displayName: string;
  token: string;
  status: VGamesIdentityStatus;
}

export interface VGamesIdentityRepository {
  getDeviceCredential(): string;
  getSession(): VGamesIdentitySession | null;
  saveSession(session: VGamesIdentitySession): void;
  clearSession(): void;
}

export interface GuestIdentityInput {
  deviceCredential: string;
  displayName: string;
}

export interface SecureGuestInput {
  deviceCredential: string;
  token: string;
  username: string;
  password: string;
}

export interface LoginInput {
  deviceCredential: string;
  username: string;
  password: string;
}

export interface VGamesIdentityClient {
  playAsGuest(input: GuestIdentityInput): Promise<VGamesIdentitySession>;
  secureGuest(input: SecureGuestInput): Promise<VGamesIdentitySession>;
  login(input: LoginInput): Promise<VGamesIdentitySession>;
}

export interface VGamesIdentityClientOptions {
  apiOrigin?: string;
}

export function vgamesIdentityErrorMessage(caught: unknown, fallback: string): string {
  const code = caught !== null && typeof caught === "object" && "code" in caught &&
      typeof caught.code === "string"
    ? caught.code
    : null;
  const rawMessage = caught instanceof Error ? caught.message : null;
  const identityCode = code === "vgames_identity_failed" ? rawMessage : code;

  switch (identityCode) {
    case "username_taken":
      return "That VGames username is already taken.";
    case "name_reserved":
      return "That name belongs to an existing VGames account. Choose another guest name or log in.";
    case "invalid_credentials":
      return "That VGames username or password is incorrect.";
    case "invalid_username":
      return "Use 3-20 lowercase letters, numbers, or underscores for your VGames username.";
    case "invalid_password":
      return "Use a password between 6 and 128 characters.";
    default:
      return rawMessage && rawMessage !== "vgames_identity_failed"
        ? rawMessage
        : fallback;
  }
}

const CREDENTIAL_STORAGE_KEY = "vwiki-race:vgames-device-credential";
const SESSION_STORAGE_KEY = "vwiki-race:vgames-session";
const LEGACY_APP_KEY = ["viki", "pedia"].join("");
const LEGACY_CREDENTIAL_STORAGE_KEY = `${LEGACY_APP_KEY}:vgames-device-credential`;
const LEGACY_SESSION_STORAGE_KEY = `${LEGACY_APP_KEY}:vgames-session`;

type CryptoLike = Pick<Crypto, "getRandomValues">;

export function createVGamesIdentityRepository(
  storage: StorageLike,
  cryptoLike: CryptoLike = crypto,
): VGamesIdentityRepository {
  let memoryCredential: string | null = null;
  let memorySession: VGamesIdentitySession | null | undefined;
  const safeStorage: StorageLike = {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // The in-memory values below keep identity usable for this tab.
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key);
      } catch {
        // A blocked storage backend cannot retain data written by this session.
      }
    },
  };

  return {
    getDeviceCredential() {
      if (memoryCredential) {
        return memoryCredential;
      }

      const existing = safeStorage.getItem(CREDENTIAL_STORAGE_KEY);
      if (existing) {
        memoryCredential = existing;
        return memoryCredential;
      }

      const legacy = safeStorage.getItem(LEGACY_CREDENTIAL_STORAGE_KEY);
      if (legacy) {
        memoryCredential = legacy;
        safeStorage.setItem(CREDENTIAL_STORAGE_KEY, legacy);
        safeStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
        return memoryCredential;
      }

      const bytes = cryptoLike.getRandomValues(new Uint8Array(32));
      memoryCredential = toHex(bytes);
      safeStorage.setItem(CREDENTIAL_STORAGE_KEY, memoryCredential);
      return memoryCredential;
    },

    getSession() {
      if (memorySession !== undefined) {
        return memorySession;
      }

      const session = readSession(safeStorage, SESSION_STORAGE_KEY);
      if (session) {
        memorySession = session;
        return memorySession;
      }

      const legacySession = readSession(safeStorage, LEGACY_SESSION_STORAGE_KEY);
      if (legacySession) {
        safeStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
        safeStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      }
      memorySession = legacySession;
      return memorySession;
    },

    saveSession(session) {
      memorySession = session;
      safeStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          accountId: session.accountId,
          displayName: session.displayName,
          token: session.token,
          status: session.status,
        }),
      );
      safeStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    },

    clearSession() {
      memorySession = null;
      safeStorage.removeItem(SESSION_STORAGE_KEY);
      safeStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    },
  };
}

import { resolveApiOrigin } from "./apiOrigin";
import { defaultApiFetch, requestJson } from "./apiRequest";

const DEFAULT_API_ORIGIN = resolveApiOrigin(import.meta.env.VITE_VWIKI_RACE_API_URL, {
  production: import.meta.env.PROD,
});

export function createVGamesIdentityClient(
  fetchImpl: typeof fetch = defaultApiFetch,
  options: VGamesIdentityClientOptions = {},
): VGamesIdentityClient {
  const apiOrigin = options.apiOrigin ?? DEFAULT_API_ORIGIN;
  return {
    playAsGuest(input) {
      return identityRequest(fetchImpl, `${apiOrigin}/api/v2/identity/guest`, input);
    },
    secureGuest(input) {
      return identityRequest(fetchImpl, `${apiOrigin}/api/v2/identity/secure`, input);
    },
    login(input) {
      return identityRequest(
        fetchImpl,
        `${apiOrigin}/api/v2/identity/login`,
        input,
        {
          idempotencyKey: crypto.randomUUID(),
          retry: "idempotent-once",
        },
      );
    },
  };
}

async function identityRequest(
  fetchImpl: typeof fetch,
  path: string,
  body: unknown,
  options: {
    idempotencyKey?: string;
    retry?: "idempotent-once" | "never";
  } = {},
): Promise<VGamesIdentitySession> {
  return requestJson(fetchImpl, path, {
    method: "POST",
    body,
    timeoutMs: 15_000,
    retry: options.retry ?? "never",
    idempotencyKey: options.idempotencyKey,
    validate: isSession,
  });
}

function isSession(value: unknown): value is VGamesIdentitySession {
  return (
    value !== null &&
    typeof value === "object" &&
    "accountId" in value &&
    typeof value.accountId === "string" &&
    value.accountId.trim().length > 0 &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    "token" in value &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    "status" in value &&
    (value.status === "ghost" || value.status === "claimed")
  );
}

function readSession(
  storage: StorageLike,
  storageKey: string,
): VGamesIdentitySession | null {
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VGamesIdentitySession>;
    if (!isSession(parsed)) {
      storage.removeItem(storageKey);
      return null;
    }

    return {
      accountId: parsed.accountId.trim(),
      displayName: parsed.displayName.trim(),
      token: parsed.token,
      status: parsed.status,
    };
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
