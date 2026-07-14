import type { RunRecord } from "../domain/types";

const STORAGE_KEY = "vikipedia.runHistory.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RunHistoryRepository {
  saveRun(record: RunRecord): Promise<void>;
  getAllRuns(): Promise<RunRecord[]>;
  getRunsForAccount(accountId: string): Promise<RunRecord[]>;
}

export function createLocalRunHistoryRepository(
  storage: StorageLike,
): RunHistoryRepository {
  return {
    async saveRun(record) {
      const records = readRecords(storage);
      const withoutExisting = records.filter((item) => item.id !== record.id);
      writeRecords(storage, [...withoutExisting, record]);
    },

    async getAllRuns() {
      return readRecords(storage);
    },

    async getRunsForAccount(accountId) {
      return readRecords(storage).filter(
        (record) => record.accountId === accountId,
      );
    },
  };
}

function readRecords(storage: StorageLike): RunRecord[] {
  const value = storage.getItem(STORAGE_KEY);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as RunRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(storage: StorageLike, records: RunRecord[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(records));
}
