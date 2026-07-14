import type {
  AbandonRunResponse,
  ClickRequest,
  ClickResponse,
  CreateChallengeRequest,
  CompleteRunRequest,
  LeaderboardResponse,
  PlayerRequest,
  RunPathResponse,
  StartRunRequest,
} from "../server/contracts";
import type {
  Challenge,
  RankedLeaderboardRow,
  ServerPathStep,
} from "../domain/types";
import type {
  PlayerRecord,
  RunRecordResponse,
} from "../server/trackingRepository";

export interface VikipediaApiClient {
  listChallenges(): Promise<Challenge[]>;
  createChallenge(input: CreateChallengeRequest): Promise<Challenge>;
  savePlayer(input: PlayerRequest): Promise<PlayerRecord>;
  startRun(input: StartRunRequest): Promise<RunRecordResponse>;
  recordClick(runId: string, input: ClickRequest): Promise<ClickResponse>;
  completeRun(
    runId: string,
    input: CompleteRunRequest,
  ): Promise<RankedLeaderboardRow>;
  abandonRun(runId: string): Promise<AbandonRunResponse>;
  listLeaderboard(challengeId: string): Promise<RankedLeaderboardRow[]>;
  getRunPath(runId: string): Promise<ServerPathStep[]>;
}

export function createVikipediaApiClient(
  fetchImpl: typeof fetch,
): VikipediaApiClient {
  return {
    async listChallenges() {
      const response = await apiRequest<{ challenges: Challenge[] }>(
        fetchImpl,
        "/api/challenges",
      );
      return response.challenges;
    },
    async createChallenge(input) {
      const response = await apiRequest<{ challenge: Challenge }>(
        fetchImpl,
        "/api/challenges",
        {
          method: "POST",
          body: input,
        },
      );
      return response.challenge;
    },
    async savePlayer(input) {
      const response = await apiRequest<{ player: PlayerRecord }>(
        fetchImpl,
        "/api/players",
        {
          method: "POST",
          body: input,
        },
      );
      return response.player;
    },
    async startRun(input) {
      const response = await apiRequest<{ run: RunRecordResponse }>(
        fetchImpl,
        "/api/runs/start",
        {
          method: "POST",
          body: input,
        },
      );
      return response.run;
    },
    async recordClick(runId, input) {
      return apiRequest<ClickResponse>(
        fetchImpl,
        `/api/runs/${encodeURIComponent(runId)}/click`,
        {
          method: "POST",
          body: input,
        },
      );
    },
    async completeRun(runId, input) {
      const response = await apiRequest<{ leaderboardRow: RankedLeaderboardRow }>(
        fetchImpl,
        `/api/runs/${encodeURIComponent(runId)}/complete`,
        {
          method: "POST",
          body: input,
        },
      );
      return response.leaderboardRow;
    },
    async abandonRun(runId) {
      return apiRequest<AbandonRunResponse>(
        fetchImpl,
        `/api/runs/${encodeURIComponent(runId)}/abandon`,
        {
          method: "POST",
        },
      );
    },
    async listLeaderboard(challengeId) {
      const response = await apiRequest<LeaderboardResponse>(
        fetchImpl,
        `/api/challenges/${encodeURIComponent(challengeId)}/leaderboard`,
      );
      return response.leaderboard;
    },
    async getRunPath(runId) {
      const response = await apiRequest<RunPathResponse>(
        fetchImpl,
        `/api/runs/${encodeURIComponent(runId)}/path`,
      );
      return response.path;
    },
  };
}

async function apiRequest<T>(
  fetchImpl: typeof fetch,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetchImpl(path, {
    method: options.method ?? "GET",
    headers:
      options.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  return payload as T;
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

  return `Vikipedia API request failed with status ${status}`;
}
