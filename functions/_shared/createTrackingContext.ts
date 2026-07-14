import { createApiHandlers } from "../../src/server/apiHandlers";
import { createD1TrackingRepository } from "../../src/server/d1TrackingRepository";
import { ApiError } from "../../src/server/http";
import { createVGamesIdentityClient } from "../../src/server/vgamesIdentityClient";
import { createWikipediaChallengeValidator } from "../../src/server/wikipediaChallengeValidator";
import type { AccountStatus } from "../../src/domain/types";

export interface Env {
  VWIKI_RACE_DB: D1Database;
  VGAMES_URL: string;
}

export function createTrackingContext(env: Env) {
  const repository = createD1TrackingRepository({
    db: env.VWIKI_RACE_DB,
  });
  const wikipedia = createWikipediaChallengeValidator({
    fetchImpl: fetch,
  });
  const handlers = createApiHandlers(repository, {
    validateChallengeArticles: wikipedia.validateChallengeArticles,
  });
  const identity = createVGamesIdentityClient({
    baseUrl: env.VGAMES_URL,
  });
  const authorize = (request: Request) => authorizeVGamesRequest(request, identity);

  return {
    handlers,
    identity,
    authorize,
    readJson,
    json,
    error,
  };
}

export interface AuthorizedVGamesAccount {
  accountId: string;
  status: AccountStatus;
}

export async function authorizeVGamesRequest(
  request: Request,
  identity: Pick<ReturnType<typeof createVGamesIdentityClient>, "introspect">,
): Promise<AuthorizedVGamesAccount> {
  const token = readBearerToken(request);
  const result = await identity.introspect(token);
  if (!result.valid) {
    throw new ApiError(
      "unauthorized",
      "Sign in before changing VWiki Race.",
      401,
    );
  }

  return {
    accountId: result.accountId,
    status: result.status,
  };
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(
      "unauthorized",
      "Sign in before changing VWiki Race.",
      401,
    );
  }
  return match[1].trim();
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("invalid_json", "Request body must be valid JSON.");
  }
}

export function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function error(caught: unknown): Response {
  if (caught instanceof ApiError) {
    return json(
      { error: { code: caught.code, message: caught.message } },
      { status: caught.status },
    );
  }

  return json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong.",
      },
    },
    { status: 500 },
  );
}

export function singleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
