import type {
  ChallengeBoardDnfRow,
  ChallengeBoardPlacement,
  RankedLeaderboardRow,
} from "./types";

/**
 * The one display shape `BoardSnippet` renders (desktop pass, FIX 3): both of
 * its data sources - the deduped board endpoint (Home's yesterday/today
 * cards) and the per-attempt ranked leaderboard (Results, which highlights
 * the specific run just finished) - normalize to this before rendering, so
 * the "top-3 with your row appended" logic lives in exactly one place and
 * can't fork per caller.
 */
export interface BoardSnippetRow {
  key: string;
  /** "#1", "#2", ... for placements; "DNF" for abandoned/DNF rows. */
  rankLabel: string;
  displayName: string;
  elapsedMs: number;
  clickCount: number;
  /** Drives the highlight + "(you)" suffix + append-below-top-3 behavior. */
  isYou: boolean;
}

/**
 * Rows for Home's board cards, from `GET /challenges/{id}/board` - already
 * one row per canonical account (invariant 2 lives server-side), placements
 * first, then DNFs. "You" is an accountId match: board rows carry no runId,
 * and an account-level match is exactly right for a deduped board (the row
 * IS the account's best attempt).
 */
export function boardSnippetRowsFromBoard(
  board: { placements: ChallengeBoardPlacement[]; dnfs: ChallengeBoardDnfRow[] },
  identityAccountId: string | null,
): BoardSnippetRow[] {
  const placements = board.placements.map((row): BoardSnippetRow => ({
    key: `placement-${row.accountId}`,
    rankLabel: `#${row.placement}`,
    displayName: row.displayName ?? "Unknown",
    elapsedMs: row.elapsedMs,
    clickCount: row.clickCount,
    isYou: identityAccountId !== null && row.accountId === identityAccountId,
  }));
  const dnfs = board.dnfs.map((row): BoardSnippetRow => ({
    key: `dnf-${row.accountId}`,
    rankLabel: "DNF",
    displayName: row.displayName ?? "Unknown",
    elapsedMs: row.elapsedMs,
    clickCount: row.clickCount,
    isYou: identityAccountId !== null && row.accountId === identityAccountId,
  }));
  return [...placements, ...dnfs];
}

/**
 * Rows for Results' snippet, from the per-attempt ranked leaderboard the
 * race flow already has in hand. Here "you" means the exact run that just
 * ended (`highlightRunId`), NOT every row of yours - a repeat attempt should
 * highlight only itself, matching the pre-refactor behavior.
 */
export function boardSnippetRowsFromLeaderboard(
  rows: RankedLeaderboardRow[],
  highlightRunId: string | null,
): BoardSnippetRow[] {
  return rows.map((row): BoardSnippetRow => ({
    key: row.runId,
    rankLabel: row.status === "abandoned" ? "DNF" : `#${row.rank}`,
    displayName: row.displayName,
    elapsedMs: row.elapsedMs,
    clickCount: row.clickCount,
    isYou: highlightRunId !== null && row.runId === highlightRunId,
  }));
}
