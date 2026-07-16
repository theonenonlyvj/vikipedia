import type { VGamesIdentitySession } from "../services/vgamesIdentity";
import { ApiError } from "./http";

export interface VGamesIdentityClient {
  quick(input: {
    deviceCredential: string;
    displayName: string;
  }): Promise<VGamesIdentitySession>;
  secure(input: {
    deviceCredential: string;
    token: string;
    username: string;
    password: string;
  }): Promise<VGamesIdentitySession>;
  login(input: {
    deviceCredential: string;
    username: string;
    password: string;
  }): Promise<VGamesIdentitySession>;
  introspect(token: string): Promise<VGamesIntrospection>;
}

export type VGamesIntrospection =
  | {
      valid: true;
      accountId: string;
      status: "ghost" | "claimed";
      displayName: string;
      aliases: string[];
    }
  | { valid: false };

export function createVGamesIdentityClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}): VGamesIdentityClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;

  const request = async (
    path: string,
    body: unknown,
    init: { token?: string } = {},
  ): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readJson(response);

      if (!response.ok) {
        const failure = readVGamesError(payload, response.status);
        throw new ApiError(
          failure.code,
          failure.message,
          response.status,
          readRetryAfterSeconds(response.headers),
        );
      }

      return payload;
    } catch (caught) {
      if (caught instanceof ApiError) {
        throw caught;
      }
      if (controller.signal.aborted) {
        throw new ApiError(
          "vgames_identity_timeout",
          "VGames identity timed out.",
          504,
        );
      }
      throw new ApiError(
        "vgames_identity_unavailable",
        "VGames identity is temporarily unavailable.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async quick(input) {
      const payload = await request("/auth/quick", {
        deviceCredential: input.deviceCredential,
        displayName: input.displayName,
        game: "vwiki-race",
      });
      const auth = readAuthPayload(payload);
      return {
        accountId: auth.accountId,
        displayName: input.displayName,
        token: auth.token,
        status: "ghost",
      };
    },

    async secure(input) {
      await request(
        "/auth/set-credentials",
        {
          username: input.username,
          password: input.password,
        },
        { token: input.token },
      );

      return this.login({
        deviceCredential: input.deviceCredential,
        username: input.username,
        password: input.password,
      });
    },

    async login(input) {
      const payload = await request("/auth/login", {
        username: input.username,
        password: input.password,
        deviceCredential: input.deviceCredential,
      });
      const auth = readAuthPayload(payload);
      return {
        accountId: auth.accountId,
        displayName: input.username,
        token: auth.token,
        status: "claimed",
      };
    },

    async introspect(token) {
      const payload = await request("/auth/introspect", { token });
      return readIntrospectionPayload(payload);
    },
  };
}

function readIntrospectionPayload(payload: unknown): VGamesIntrospection {
  if (!payload || typeof payload !== "object" || !("valid" in payload)) {
    throw invalidIdentityResponse();
  }
  if (payload.valid === false) {
    return { valid: false };
  }
  // Authorization keys off `valid` + a well-formed `accountId` + a recognized
  // `status` only. Keep that validation strict. `displayName`/`aliases` are
  // display/re-attribution metadata; tolerate their absence so this stays
  // compatible with viota workers that don't emit them yet (alias
  // re-attribution simply stays dormant until viota ships those fields).
  if (
    payload.valid !== true ||
    !("accountId" in payload) ||
    typeof payload.accountId !== "string" ||
    payload.accountId.trim().length === 0 ||
    !("status" in payload) ||
    (payload.status !== "ghost" && payload.status !== "claimed")
  ) {
    throw invalidIdentityResponse();
  }

  const accountId = payload.accountId;
  const rawDisplayName =
    "displayName" in payload ? payload.displayName : undefined;
  const displayName =
    typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
      ? rawDisplayName
      : accountId;

  // Invariant: `aliases` are opaque internal merge-graph account UUIDs — they
  // are server-to-server only and must NEVER be serialized into any
  // client-facing response.
  const rawAliases = "aliases" in payload ? payload.aliases : undefined;
  const aliases = Array.isArray(rawAliases)
    ? rawAliases.filter(
        (alias): alias is string =>
          typeof alias === "string" && alias.trim().length > 0,
      )
    : [];

  return {
    valid: true,
    accountId,
    status: payload.status,
    displayName,
    aliases,
  };
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

function readAuthPayload(payload: unknown): { accountId: string; token: string } {
  if (
    payload &&
    typeof payload === "object" &&
    "accountId" in payload &&
    typeof payload.accountId === "string" &&
    payload.accountId.length > 0 &&
    "token" in payload &&
    typeof payload.token === "string" &&
    payload.token.length > 0
  ) {
    return {
      accountId: payload.accountId,
      token: payload.token,
    };
  }

  throw invalidIdentityResponse();
}

function invalidIdentityResponse(): ApiError {
  return new ApiError(
    "invalid_vgames_identity_response",
    "VGames identity response was invalid.",
    502,
  );
}

function readVGamesError(
  payload: unknown,
  status: number,
): { code: string; message: string } {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.length > 0
  ) {
    return { code: payload.error, message: payload.error };
  }
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    const code = "code" in payload.error && typeof payload.error.code === "string"
      ? payload.error.code
      : "vgames_identity_failed";
    return { code, message: payload.error.message };
  }

  return {
    code: "vgames_identity_failed",
    message: `VGames identity request failed with status ${status}`,
  };
}

function readRetryAfterSeconds(headers: Headers): number | null {
  const value = headers.get("Retry-After");
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt)
    ? null
    : Math.max(Math.ceil((retryAt - Date.now()) / 1_000), 0);
}
