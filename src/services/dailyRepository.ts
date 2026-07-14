import { rankLeaderboard, pickBestEntry } from "../domain/leaderboard";
import type {
  LeaderboardEntry,
  PathEntry,
  RunResult,
  VGamesAccount,
} from "../domain/types";

const STORAGE_KEY = "vikipedia.daily.results.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DailyChallengeRepository {
  submitResult(
    result: RunResult,
    account: VGamesAccount,
  ): Promise<LeaderboardEntry>;
  getLeaderboard(challengeId: string): Promise<LeaderboardEntry[]>;
  getBestResult(
    accountId: string,
    challengeId: string,
  ): Promise<LeaderboardEntry | null>;
}

type StoredRows = Record<string, LeaderboardEntry[]>;

export function createLocalDailyChallengeRepository(
  storage: StorageLike,
  now: () => number,
): DailyChallengeRepository {
  return {
    async submitResult(result, account) {
      if (result.status !== "completed") {
        throw new Error("Only completed runs can be submitted");
      }

      const rowsByChallenge = readRows(storage);
      const challengeId = result.challenge.id;
      const existingRows = rowsByChallenge[challengeId] ?? [];
      const nextEntry: LeaderboardEntry = {
        accountId: result.accountId,
        displayName: account.displayName,
        challengeId,
        clicks: result.clicks,
        elapsedMs: result.elapsedMs,
        submittedAt: now(),
        pathHash: hashPath(result.path),
      };
      const withoutAccount = existingRows.filter(
        (row) => row.accountId !== result.accountId,
      );
      const current = existingRows.find(
        (row) => row.accountId === result.accountId,
      );
      const best = pickBestEntry(current ?? null, nextEntry);

      rowsByChallenge[challengeId] = rankLeaderboard([...withoutAccount, best]);
      writeRows(storage, rowsByChallenge);
      return best;
    },

    async getLeaderboard(challengeId) {
      return rankLeaderboard(readRows(storage)[challengeId] ?? []);
    },

    async getBestResult(accountId, challengeId) {
      return (
        readRows(storage)[challengeId]?.find(
          (row) => row.accountId === accountId,
        ) ?? null
      );
    },
  };
}

function readRows(storage: StorageLike): StoredRows {
  const value = storage.getItem(STORAGE_KEY);
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as StoredRows;
  } catch {
    return {};
  }
}

function writeRows(storage: StorageLike, rows: StoredRows): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function hashPath(path: PathEntry[]): string {
  const serialized = JSON.stringify(
    path.map((entry) => [
      entry.sourcePage.canonicalTitle,
      entry.clickedAnchorText,
      entry.resolvedDestination.canonicalTitle,
      entry.clickNumber,
    ]),
  );

  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
