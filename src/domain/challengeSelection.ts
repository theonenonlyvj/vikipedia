import type { Challenge } from "./types";

export interface ChallengeSelectionOptions {
  activeChallengeId?: string | null;
  requestedChallengeId?: string | null;
  todayUtc: string;
}

export function selectDefaultChallenge(
  challenges: Challenge[],
  options: ChallengeSelectionOptions,
): Challenge | null {
  const activeChallenges = challenges.filter((challenge) => challenge.isActive !== false);
  const findById = (id: string | null | undefined) =>
    id ? activeChallenges.find((challenge) => challenge.id === id) ?? null : null;

  return findById(options.activeChallengeId) ??
    findById(options.requestedChallengeId) ??
    activeChallenges.find((challenge) =>
      challenge.origin === "daily" && challenge.dailyDate === options.todayUtc
    ) ??
    activeChallenges[0] ??
    null;
}
