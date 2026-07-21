import { useEffect, useState } from "react";
import ChallengePathGraphButton from "../../components/ChallengePathGraphButton";
import LeaderboardList from "../../components/LeaderboardList";
import WinningPathChain from "../../components/WinningPathChain";
import { dailyBadgeLabel } from "../../domain/challengeSelection";
import { formatTimeAndClicks } from "../../domain/formatting";
import { pathStepsToChain } from "../../domain/winningPath";
import type { Challenge, RankedLeaderboardRow, ServerPathStep } from "../../domain/types";
import type { ChallengeBoardResponse } from "../../server/contracts";
import type { VWikiRaceApiClient } from "../../services/vwikiRaceApiClient";
import { ChallengeShareButton } from "../../race/shared";

function emptyBoard(challengeId: string): ChallengeBoardResponse {
  return { challengeId, placements: [], dnfs: [] };
}

/**
 * Challenge Detail (new this task - today's browser has no detail view).
 * Reached via a challenge share link (?challenge=<id>) or a browser
 * back/forward step that lands on one - see App.tsx's catalog-load routing
 * and popstate handler.
 *
 * PKG-03 (council 2026-07-19): the main "Leaderboard" panel now self-fetches
 * the deduped `GET /challenges/{id}/board` endpoint - the same one
 * Home/Boards already call - keyed on `challenge.id`, mirroring Boards.tsx's
 * own board-fetch effect exactly (reset-then-refetch-then-cancel-guard) so
 * switching between two Detail challenges (a back/forward step, or a fresh
 * share link) can't leak a stale board across the switch. The raw
 * per-attempt `leaderboard` prop the app shell already fetches is kept for
 * "Your history" only, which legitimately needs every attempt (repeat runs
 * included) rather than the account's single best.
 *
 * `pathsUnlocked`/`onDisclosePath`/`runPaths` are shared, unmodified, with
 * BOTH the main Leaderboard panel and "Your history" (PKG-03 remainder fix):
 * invariant 5 gates path disclosure on the VIEWER having played, not on
 * whose run it is - once unlocked, the main board's "View path" (any
 * account with a `runId`) and "Your history"'s per-attempt one both read
 * off the same `onDisclosePath`/`runPaths` App.tsx already wires up.
 *
 * DT-1 (owner feedback, desktop screenshot): "View winning path" ->
 * "View path" everywhere ("'winning' not necessary"). "View graph" moved
 * into the Leaderboard panel's own heading row (was dangling below the DNF
 * section). "Your history" hides itself entirely when it would show
 * exactly one attempt that's already visible on the board above (a
 * completed run this account also holds the board placement for) - see
 * `showHistoryPanel` below; a lone DNF (never board-placed) or 2+ attempts
 * still render, since only then does the strip add information the board
 * above doesn't already carry.
 */
export default function ChallengeDetail({
  apiClient,
  challenge,
  identityAccountId,
  identityToken,
  leaderboard,
  onBack,
  onDisclosePath,
  onPlayTodaysDaily,
  onRaceThis,
  raceDisabled,
  runPaths,
  todayCentral,
}: {
  apiClient: VWikiRaceApiClient;
  challenge: Challenge;
  identityAccountId: string | null;
  // GR-1 ("View graph"): the bearer token `ChallengePathGraphButton` needs
  // to fetch the merged graph - see its own doc comment.
  identityToken: string | null;
  leaderboard: RankedLeaderboardRow[];
  onBack: () => void;
  onDisclosePath: (runId: string) => void;
  // Owner-approved URL policy, item 5 (approved polish): present only when
  // AppShell has a genuine today's-daily to fund it (homeHero.kind ===
  // "today-daily") - undefined otherwise, so a catalog with no real daily
  // today simply shows no link rather than one that lies. Reuses App.tsx's
  // openRacePreviewFor, the same entry point Home's hero and Boards' CTA
  // already share.
  onPlayTodaysDaily?: () => void;
  onRaceThis: () => void;
  raceDisabled: boolean;
  runPaths: Record<string, ServerPathStep[]>;
  todayCentral: string;
}) {
  const [board, setBoard] = useState<ChallengeBoardResponse>(() => emptyBoard(challenge.id));

  useEffect(() => {
    let cancelled = false;
    setBoard(emptyBoard(challenge.id));
    void apiClient.getChallengeBoard(challenge.id)
      .then((response) => {
        if (!cancelled) setBoard(response);
      })
      .catch(() => {
        if (!cancelled) setBoard(emptyBoard(challenge.id));
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, challenge.id]);

  const yourRows = identityAccountId
    ? leaderboard.filter((row) => row.accountId === identityAccountId)
    : [];
  // Invariant 5 ("paths stay hidden until you've played... 'played' means
  // finished, not merely started/DNF'd"): a DNF-only history still keeps
  // the anti-spoiler copy up - only a completed row unlocks disclosure.
  const pathsUnlocked = yourRows.some((row) => row.status === "completed");
  // DT-1 (owner-proxy ruling, "anything else" (b)): a lone completed
  // attempt that's ALSO this account's placement on the main board above is
  // pure duplication - same rank/time/clicks shown twice, once per panel.
  // Only a genuinely redundant SINGLE row is hidden: 2+ attempts (a retry, a
  // DNF alongside a finish, etc.) always have something the deduped board
  // can't show (it only ever keeps one row per account), and a lone DNF is
  // never "the board-visible one" either - DNFs live in their own board
  // section, not the ranked placements this strip would be duplicating.
  const singleRow = yourRows.length === 1 ? yourRows[0] : null;
  const singleRowIsBoardPlacement = Boolean(
    singleRow &&
    singleRow.status === "completed" &&
    board.placements.some(
      (row) => row.accountId === identityAccountId && row.runId === singleRow.runId,
    ),
  );
  const showHistoryPanel = !singleRowIsBoardPlacement;
  const dailyBadge = dailyBadgeLabel(challenge, todayCentral);
  // Owner-approved URL policy, item 5: "Today" is the only label
  // `dailyBadgeLabel` ever gives the CURRENT day's daily - anything else
  // that badge returns (a non-null "Daily M/D"/"Daily") is a past date, so a
  // stale permalink (share link, bookmark, self-healing legacy tab) can
  // funnel back into the ritual instead of dead-ending on an old board.
  const isPastDaily = Boolean(dailyBadge) && dailyBadge !== "Today";

  return (
    <section className="challenge-detail" aria-label="Challenge detail">
      <button type="button" className="back-link" onClick={onBack}>
        ← Challenges
      </button>

      {/* PKG-09: title block + Race CTA co-wrapped in one `.route-header`
          grid parent (mirroring Home's `.daily-hero` + `.daily-hero-copy`
          structure) - before this, the two were bare siblings, so the CTA
          had nothing to dock beside and just floated in dead space below
          the title at desktop widths. */}
      <div className="route-header">
        <div className="challenge-route" aria-label="Current challenge">
          <div className="challenge-meta">
            <span>{challenge.label ?? challenge.id}</span>
            {dailyBadge ? <span className="daily-badge">{dailyBadge}</span> : null}
          </div>
          <strong>
            {challenge.start.title} {"→"} {challenge.target.title}
          </strong>
          {challenge.createdBy ? (
            <em>Created by {challenge.createdBy.displayName}</em>
          ) : null}
          {isPastDaily && onPlayTodaysDaily ? (
            <button
              className="link-button"
              onClick={onPlayTodaysDaily}
              type="button"
            >
              Play today&apos;s daily ›
            </button>
          ) : null}
        </div>

        <div className="player-gate">
          {/* PKG-04 (owner-proxy ruling): opening the preview is non-committal
              (invariant 3 - no run exists until Start), same action Home's
              hero and Boards' CTA trigger (App.tsx's openRacePreviewFor) - so
              it shares their teal `.race-preview-button` class, never coral. */}
          <button
            className="race-preview-button"
            type="button"
            disabled={raceDisabled}
            onClick={onRaceThis}
          >
            {"▶"} Race
          </button>
        </div>
      </div>

      {/* PKG-04: was the only mode screen with no card chrome - now wrapped
          in the same `.leaderboard-panel` group Boards/Browse/You use
          (styles.css:1431-1442 area), as two panels matching mockup-browse-
          detail's leaderboard box + your-history box. */}
      <section className="leaderboard-panel" aria-label="Challenge leaderboard">
        <div className="leaderboard-heading">
          <h2>Leaderboard</h2>
          {/* DT-1 ("anything else" (a)): docked into the heading row,
              right-aligned, rather than dangling below the DNF section -
              still the one shared `ChallengePathGraphButton` (unmodified;
              its own portal-to-body modal is out of scope here). */}
          {pathsUnlocked ? (
            <ChallengePathGraphButton
              apiClient={apiClient}
              challengeId={challenge.id}
              identityToken={identityToken}
              unlocked={pathsUnlocked}
            />
          ) : null}
        </div>
        <LeaderboardList
          dnfs={board.dnfs}
          identityAccountId={identityAccountId}
          onDisclosePath={onDisclosePath}
          pathsUnlocked={pathsUnlocked}
          placements={board.placements}
          runPaths={runPaths}
        />
        {!pathsUnlocked ? (
          <p className="muted board-footnote">Paths hidden until you&apos;ve played.</p>
        ) : null}
      </section>

      {showHistoryPanel ? (
        <section className="leaderboard-panel" aria-label="Your history">
          <h3>Your history</h3>
          {yourRows.length ? (
            <ol className="leaderboard">
              {yourRows.map((row) => (
                <li className={row.status === "abandoned" ? "dnf" : undefined} key={row.runId}>
                  <span className="rank">
                    {row.status === "abandoned" ? "DNF" : `#${row.rank}`}
                  </span>
                  <span className="leaderboard-player">
                    <span>{formatTimeAndClicks(row.elapsedMs, row.clickCount)}</span>
                    {row.protocolVersion === 1 ? (
                      // PKG-03: a tap-to-reveal explanation (mobile has no
                      // hover) replaces the old hover-only `title` attribute -
                      // "Server tracked" is gone entirely (it was the default,
                      // not information; only the pre-migration exception is
                      // still worth flagging).
                      <details className="provenance-disclosure">
                        <summary className="provenance-badge historical">Historical</summary>
                        <p className="muted">Recorded before the server-tracked race protocol.</p>
                      </details>
                    ) : null}
                  </span>
                  {pathsUnlocked ? (
                    <details
                      className="path-disclosure"
                      onToggle={(event) => {
                        if (event.currentTarget.open) onDisclosePath(row.runId);
                      }}
                    >
                      {/* DT-1: "View winning path" -> "View path"
                          everywhere - the old status-based ternary (DNF
                          rows already read "View path", completed rows read
                          "View winning path") collapses to one literal now
                          that both branches agree. */}
                      <summary>View path</summary>
                      {runPaths[row.runId] ? (
                        <WinningPathChain titles={pathStepsToChain(runPaths[row.runId])} />
                      ) : <p>Loading path...</p>}
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">You haven&apos;t tried this one yet.</p>
          )}
        </section>
      ) : null}

      <ChallengeShareButton challengeId={challenge.id} />
    </section>
  );
}
