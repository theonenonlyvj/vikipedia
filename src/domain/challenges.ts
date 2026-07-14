import type { Challenge } from "./types";

export const SERVER_CHALLENGES: Challenge[] = [
  {
    id: "challenge-0001",
    label: "Challenge #1",
    sortOrder: 1,
    isActive: true,
    mode: "daily",
    start: { title: "Moon" },
    target: { title: "Gravity" },
    ruleset: "ranked_classic",
    source: "curated",
  },
];

export function getSortedChallenges(challenges: Challenge[]): Challenge[] {
  return challenges
    .filter((challenge) => challenge.isActive !== false)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
