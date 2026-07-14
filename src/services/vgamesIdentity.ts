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
  return {
    getDeviceCredential() {
      const existing = storage.getItem(CREDENTIAL_STORAGE_KEY);
      if (existing) {
        return existing;
      }

      const legacy = storage.getItem(LEGACY_CREDENTIAL_STORAGE_KEY);
      if (legacy) {
        storage.setItem(CREDENTIAL_STORAGE_KEY, legacy);
        storage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
        return legacy;
      }

      const bytes = cryptoLike.getRandomValues(new Uint8Array(32));
      const credential = toHex(bytes);
      storage.setItem(CREDENTIAL_STORAGE_KEY, credential);
      return credential;
    },

    getSession() {
      const session = readSession(storage, SESSION_STORAGE_KEY);
      if (session) {
        return session;
      }

      const legacySession = readSession(storage, LEGACY_SESSION_STORAGE_KEY);
      if (legacySession) {
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
        storage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      }
      return legacySession;
    },

    saveSession(session) {
      storage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          accountId: session.accountId,
          displayName: session.displayName,
          token: session.token,
          status: session.status,
        }),
      );
      storage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    },

    clearSession() {
      storage.removeItem(SESSION_STORAGE_KEY);
      storage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    },
  };
}

export function createVGamesIdentityClient(
  fetchImpl: typeof fetch,
): VGamesIdentityClient {
  return {
    playAsGuest(input) {
      return identityRequest(fetchImpl, "/api/identity/guest", input);
    },
    secureGuest(input) {
      return identityRequest(fetchImpl, "/api/identity/secure", input);
    },
    login(input) {
      return identityRequest(fetchImpl, "/api/identity/login", input);
    },
  };
}

async function identityRequest(
  fetchImpl: typeof fetch,
  path: string,
  body: unknown,
): Promise<VGamesIdentitySession> {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }
  if (!isSession(payload)) {
    throw new Error("VGames identity response was invalid.");
  }

  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function readApiError(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return `VGames identity request failed with status ${status}`;
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
