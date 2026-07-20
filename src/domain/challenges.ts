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

// FB-9 (owner ruling, 2026-07-20): "ALL CHALLENGES" reads newest-created
// first now, not oldest-first - `sortOrder` is a unique, monotonically
// increasing creation-sequence number (assigned once per challenge from
// `challenge_number_sequence`, never reassigned - see d1TrackingRepository's
// `listChallenges`), so descending `sortOrder` is exactly "newest
// `created_at` first" without the tie-break ambiguity a text timestamp
// column could have. This is the one function BOTH the server
// (`apiHandlers.ts`'s `listChallenges` handler) and the client (App.tsx's
// post-create local re-sort) call, so every consumer of the catalog agrees
// on order automatically - no per-screen sorting to keep in sync. The
// pinned-daily row (Browse's own standing chrome, excluded from this array
// entirely) is unaffected either way.
export function getSortedChallenges(challenges: Challenge[]): Challenge[] {
  return challenges
    .filter((challenge) => challenge.isActive !== false)
    .slice()
    .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0));
}
