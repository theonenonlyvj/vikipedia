import type { Challenge } from "../domain/types";

type ChallengeTemplate = Omit<Challenge, "id" | "dateKey" | "mode"> & {
  slug: string;
};

const DAILY_TEMPLATES: ChallengeTemplate[] = [
  {
    slug: "apple-to-fruit",
    start: { title: "Apple" },
    target: { title: "Fruit" },
    ruleset: "ranked_classic",
    source: "curated",
  },
  {
    slug: "moon-to-gravity",
    start: { title: "Moon" },
    target: { title: "Gravity" },
    ruleset: "ranked_classic",
    source: "curated",
  },
  {
    slug: "jazz-to-improvisation",
    start: { title: "Jazz" },
    target: { title: "Improvisation" },
    ruleset: "ranked_classic",
    source: "curated",
  },
];

export const SOLO_CHALLENGES: Challenge[] = [
  {
    id: "solo-apple-to-fruit",
    mode: "solo",
    start: { title: "Apple" },
    target: { title: "Fruit" },
    ruleset: "ranked_classic",
    source: "curated",
  },
  {
    id: "solo-python-to-computer-science",
    mode: "solo",
    start: { title: "Python (programming language)" },
    target: { title: "Computer science" },
    ruleset: "ranked_classic",
    source: "curated",
  },
  {
    id: "solo-mercury-to-solar-system",
    mode: "solo",
    start: { title: "Mercury (planet)" },
    target: { title: "Solar System" },
    ruleset: "ranked_classic",
    source: "curated",
  },
];

export const DAILY_CHALLENGES: Challenge[] = DAILY_TEMPLATES.map(
  (template, index) => ({
    id: `daily-seed-${index + 1}-${template.slug}`,
    mode: "daily",
    start: template.start,
    target: template.target,
    ruleset: template.ruleset,
    source: template.source,
  }),
);

export function getTodayChallenge(dateKey: string): Challenge {
  const template = DAILY_TEMPLATES[dateIndex(dateKey, DAILY_TEMPLATES.length)];
  return {
    id: `daily-${dateKey}-${template.slug}`,
    dateKey,
    mode: "daily",
    start: template.start,
    target: template.target,
    ruleset: template.ruleset,
    source: template.source,
  };
}

function dateIndex(dateKey: string, modulo: number): number {
  const value = [...dateKey].reduce(
    (sum, char, index) => sum + char.charCodeAt(0) * (index + 1),
    0,
  );
  return value % modulo;
}
