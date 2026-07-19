import type { ReactNode } from "react";
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
 */
export default function BoardSnippet({
  title,
  rows,
  emptyLabel = "No completed runs yet.",
  children,
}: {
  title: string;
  rows: BoardSnippetRow[];
  emptyLabel?: string;
  children?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <section aria-label={title} className="board-snippet">
        <h3>{title}</h3>
        <p className="muted">{emptyLabel}</p>
        {children}
      </section>
    );
  }

  const top3 = rows.slice(0, 3);
  const yourRow = rows.find((row) => row.isYou) ?? null;
  const yourRowInTop3 = Boolean(yourRow) && top3.some((row) => row.key === yourRow?.key);
  const visibleRows = yourRow && !yourRowInTop3 ? [...top3, yourRow] : top3;

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
