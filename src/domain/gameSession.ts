import { normalizeTitle } from "./rules";
import type { Challenge, PathEntry, PathPage, RunStatus } from "./types";

export interface GameSession {
  challenge: Challenge;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  abandonedAt?: number;
  clicks: number;
  currentPage: PathPage;
  path: PathEntry[];
}

export interface FollowResolvedLinkInput {
  clickedAnchorText: string;
  requestedTitle: string;
  resolvedDestination: PathPage;
  timestamp: number;
}

export function createGameSession(
  challenge: Challenge,
  startedAt: number,
): GameSession {
  return {
    challenge,
    status: "active",
    startedAt,
    clicks: 0,
    currentPage: {
      canonicalTitle: challenge.start.title,
      pageId: challenge.start.pageId,
    },
    path: [],
  };
}

export function followResolvedLink(
  session: GameSession,
  input: FollowResolvedLinkInput,
): GameSession {
  if (session.status !== "active") {
    return session;
  }

  const clickNumber = session.clicks + 1;
  const pathEntry: PathEntry = {
    sourcePage: session.currentPage,
    clickedAnchorText: input.clickedAnchorText,
    requestedTitle: input.requestedTitle,
    resolvedDestination: input.resolvedDestination,
    timestamp: input.timestamp,
    clickNumber,
  };
  const completed = isTargetPage(session.challenge, input.resolvedDestination);

  return {
    ...session,
    status: completed ? "completed" : "active",
    completedAt: completed ? input.timestamp : undefined,
    clicks: clickNumber,
    currentPage: input.resolvedDestination,
    path: [...session.path, pathEntry],
  };
}

export function abandonSession(
  session: GameSession,
  abandonedAt: number,
): GameSession {
  if (session.status !== "active") {
    return session;
  }

  return {
    ...session,
    status: "abandoned",
    abandonedAt,
  };
}

function isTargetPage(challenge: Challenge, page: PathPage): boolean {
  if (challenge.target.pageId !== undefined && page.pageId !== undefined) {
    return challenge.target.pageId === page.pageId;
  }

  return normalizeTitle(challenge.target.title) === normalizeTitle(page.canonicalTitle);
}
