import type { Challenge } from "./types";

export interface ChallengeSelectionOptions {
  activeChallengeId?: string | null;
  requestedChallengeId?: string | null;
  todayUtc: string;
}

const CENTRAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function centralDateKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("A valid date is required.");
  }
  const parts = Object.fromEntries(
    CENTRAL_DATE_FORMATTER.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dailyBadgeLabel(challenge: Challenge, todayCentral: string): string | null {
  if (challenge.origin !== "daily" || !challenge.dailyDate) return null;
  if (challenge.dailyDate === todayCentral) return "Today";
  const [, month, day] = challenge.dailyDate.split("-");
  return month && day
    ? `Daily ${Number(month)}/${Number(day)}`
    : "Daily";
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
