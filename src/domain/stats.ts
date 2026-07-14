import { normalizeTitle } from "./rules";
import type { CountStat, JumpStat, RunRecord, StatsSummary } from "./types";

export function createStatsSummary(
  records: RunRecord[],
  accountId: string,
): StatsSummary {
  const ownRecords = records.filter((record) => record.accountId === accountId);
  const completed = ownRecords.filter((record) => record.status === "completed");
  const topStarts = new Map<string, CountStat>();
  const topTargets = new Map<string, CountStat>();
  const mostVisited = new Map<string, CountStat>();
  const bridgePages = new Map<string, CountStat>();
  const commonJumps = new Map<string, JumpStat>();

  for (const record of ownRecords) {
    incrementCount(topStarts, record.start.canonicalTitle);
    incrementCount(topTargets, record.target.canonicalTitle);

    const visited = visitedTitles(record);
    for (const title of visited) {
      incrementCount(mostVisited, title);
    }

    const bridgeCandidates = visited.slice(1, -1);
    for (const title of bridgeCandidates) {
      incrementCount(bridgePages, title);
    }

    for (const entry of record.path) {
      incrementJump(
        commonJumps,
        entry.sourcePage.canonicalTitle,
        entry.resolvedDestination.canonicalTitle,
      );
    }
  }

  const totalClicks = completed.reduce((sum, record) => sum + record.clicks, 0);
  const totalElapsed = completed.reduce(
    (sum, record) => sum + record.elapsedMs,
    0,
  );
  const bestClicks = completed.length
    ? Math.min(...completed.map((record) => record.clicks))
    : null;

  return {
    totals: {
      runs: ownRecords.length,
      completed: completed.length,
      abandoned: ownRecords.length - completed.length,
      bestClicks,
      averageClicks: completed.length ? totalClicks / completed.length : 0,
      averageElapsedMs: completed.length ? totalElapsed / completed.length : 0,
    },
    topStarts: rankCounts(topStarts),
    topTargets: rankCounts(topTargets),
    mostVisited: rankCounts(mostVisited),
    bridgePages: rankCounts(bridgePages),
    commonJumps: rankJumps(commonJumps),
  };
}

function visitedTitles(record: RunRecord): string[] {
  return [
    record.start.canonicalTitle,
    ...record.path.map((entry) => entry.resolvedDestination.canonicalTitle),
  ];
}

function incrementCount(map: Map<string, CountStat>, title: string): void {
  const key = normalizeTitle(title);
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(key, { title, count: 1 });
  }
}

function incrementJump(
  map: Map<string, JumpStat>,
  sourceTitle: string,
  destinationTitle: string,
): void {
  const key = `${normalizeTitle(sourceTitle)}->${normalizeTitle(destinationTitle)}`;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    map.set(key, { sourceTitle, destinationTitle, count: 1 });
  }
}

function rankCounts(map: Map<string, CountStat>): CountStat[] {
  return [...map.values()].sort(
    (left, right) =>
      right.count - left.count || left.title.localeCompare(right.title),
  );
}

function rankJumps(map: Map<string, JumpStat>): JumpStat[] {
  return [...map.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.sourceTitle.localeCompare(right.sourceTitle) ||
      left.destinationTitle.localeCompare(right.destinationTitle),
  );
}
