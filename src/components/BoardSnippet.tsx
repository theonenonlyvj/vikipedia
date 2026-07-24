import type { ReactNode } from "react";
import StagedLoadingNotice from "./StagedLoadingNotice";
import type { BoardSnippetRow } from "../domain/boardSnippet";
import { formatTimeAndClicks } from "../domain/formatting";

/**
 * Shared "top-3, with your row highlighted (and appended if it's outside the
 * top 3)" board rendering (invariant 1) - used by Results' board snippet and
 * Home's yesterday's-results/today's-board cards (UX redesign spec), so the
 * two screens can never drift on this shape. Renders the neutral
 * `BoardSnippetRow` shape (src/domain/boardSnippet.ts): Home feeds it the
 * DEDUPED board endpoint's rows (one per canonical account - desktop-pass
 * FIX 3; the raw per-attempt leaderboard listed the same account twice),
 * while Results still feeds it per-attempt leaderboard rows highlighting the
 * exact run just finished.
 *
 * RC-06 ("one honest loading/error system"): `status` defaults to "ready" -
 * Results' own snippet (and any other pre-existing caller) never passes it
 * and keeps rendering exactly as before. Home is the one caller that
 * distinguishes "loading"/"error" from a genuine zero-row result.
 */
export default function BoardSnippet({
  title,
  rows,
  emptyLabel = "No completed runs yet.",
  children,
  maxRows = 3,
  onRetry,
  status = "ready",
}: {
  title: string;
  rows: BoardSnippetRow[];
  emptyLabel?: string;
  children?: ReactNode;
  // RC-05: Results' own snippet and the yesterday-recap card keep the
  // original top-3 cap (default unchanged); Home's finished-state
  // "Today's board" widens this to 6 so a signed-in player can see (almost)
  // everyone who raced today, not just the podium.
  maxRows?: number;
  // Only ever consulted from the "error"/"loading" branches below.
  onRetry?: () => void;
  status?: "loading" | "error" | "ready";
}) {
  if (status === "error") {
    return (
      <section aria-label={title} className="board-snippet board-error">
        <h3>{title}</h3>
        <p className="error-banner" role="alert">Couldn&apos;t load this board.</p>
        {onRetry ? (
          <button onClick={onRetry} type="button">
            Retry
          </button>
        ) : null}
        {children}
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section aria-label={title} className="board-snippet">
        <h3>{title}</h3>
        <StagedLoadingNotice active onRetry={onRetry} pendingLabel="Loading board…" />
        {children}
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section aria-label={title} className="board-snippet">
        <h3>{title}</h3>
        <p className="muted">{emptyLabel}</p>
        {children}
      </section>
    );
  }

  const topN = rows.slice(0, maxRows);
  const yourRow = rows.find((row) => row.isYou) ?? null;
  const yourRowInTopN = Boolean(yourRow) && topN.some((row) => row.key === yourRow?.key);
  const visibleRows = yourRow && !yourRowInTopN ? [...topN, yourRow] : topN;

  return (
    <section aria-label={title} className="board-snippet">
      <h3>{title}</h3>
      <ol>
        {visibleRows.map((row) => (
          <li className={row.isYou ? "is-you" : undefined} key={row.key}>
            {/* QF-04: DNF salmon, never CTA teal - `rankLabel` (not the
                nullable `rank`) is the correct DNF proxy, since a
                completed-but-unranked run also carries `rank: null` but
                reads "—", never "DNF" (invariant: a completion is never
                demoted to DNF display). */}
            <span className={row.rankLabel === "DNF" ? "rank rank-dnf" : "rank"}>
              {row.rankLabel}
            </span>
            <span>
              {row.displayName}
              {row.isYou ? <span className="muted"> (you)</span> : null}
            </span>
            <span>{formatTimeAndClicks(row.elapsedMs, row.clickCount)}</span>
          </li>
        ))}
      </ol>
      {children}
    </section>
  );
}
