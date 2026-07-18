import { useEffect, useMemo, useState } from "react";
import { dailyDateForChallenge, previousCentralDate } from "../domain/challengeSelection";
import { dailyFlavorLabel } from "../domain/dailyEditorial";
import { formatTimeAndClicks } from "../domain/formatting";
import type { Challenge } from "../domain/types";
import type { ChallengeBoardResponse } from "../server/contracts";
import type { VWikiRaceApiClient } from "../services/vwikiRaceApiClient";

export type BoardsSegment = "today" | "yesterday";

const EMPTY_BOARD: ChallengeBoardResponse = { challengeId: "", placements: [], dnfs: [] };

/**
 * Boards v1 (Increment 3, UX redesign spec §Boards - daily views paragraph):
 * a segmented [Today][Yesterday] daily board, replacing v0's challenge
 * selector + raw `LeaderboardList` entirely. Trends (7d/30d/lifetime) are
 * Increment 4 scope - only these two segments exist here, deliberately no
 * stub for the others (spec: "do NOT render stub segments").
 *
 * "Today" reuses `todaysHeroChallenge` - the exact same daily-or-fallback
 * challenge AppShell already computed for Home's hero - rather than
 * re-deriving "today's daily" from the catalog independently, so the two
 * screens can never disagree about which challenge is "today's." Yesterday
 * has no such fallback: a genuine daily catalog gap there is expected
 * (spec: "can happen; not a stub") and renders its own graceful empty state.
 *
 * Unlike the old `LeaderboardList`/Detail's board, Boards never discloses a
 * per-run path this increment (spec: "Paths hidden until you've played" -
 * and Boards rows must not expose path disclosure at all) - the board
 * endpoint's rows don't even carry a `runId` to disclose.
 */
export default function Boards({
  apiClient,
  challenges,
  identityAccountId,
  initialSegment = "today",
  onRaceChallenge,
  raceBusy,
  todaysHeroChallenge,
  todayCentral,
}: {
  apiClient: VWikiRaceApiClient;
  challenges: Challenge[];
  identityAccountId: string | null;
  initialSegment?: BoardsSegment;
  onRaceChallenge: (challengeId: string) => void;
  raceBusy: boolean;
  todaysHeroChallenge: Challenge | null;
  todayCentral: string;
}) {
  const [segment, setSegment] = useState<BoardsSegment>(initialSegment);
  const [board, setBoard] = useState<ChallengeBoardResponse>(EMPTY_BOARD);

  const yesterdayCentral = useMemo(
    () => previousCentralDate(todayCentral),
    [todayCentral],
  );
  // Same gap Home already lives with (spec: "The catalog only carries active
  // challenges") - a real "yesterday's daily" is often simply absent once
  // its day passes, including transiently while the catalog is still
  // loading. Home doesn't distinguish those two cases for its own yesterday
  // card either; Boards matches that precedent rather than inventing a new
  // loading state this increment.
  const yesterdaysDaily = useMemo(
    () => challenges.find((challenge) => dailyDateForChallenge(challenge) === yesterdayCentral) ?? null,
    [challenges, yesterdayCentral],
  );

  const activeChallenge = segment === "today" ? todaysHeroChallenge : yesterdaysDaily;

  useEffect(() => {
    let cancelled = false;
    if (!activeChallenge) {
      setBoard(EMPTY_BOARD);
      return;
    }
    void apiClient.getChallengeBoard(activeChallenge.id)
      .then((response) => {
        if (!cancelled) setBoard(response);
      })
      .catch(() => {
        if (!cancelled) setBoard(EMPTY_BOARD);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, activeChallenge?.id]);

  const boardMatchesActiveChallenge = Boolean(activeChallenge) && board.challengeId === activeChallenge?.id;
  const placements = boardMatchesActiveChallenge ? board.placements : [];
  const dnfs = boardMatchesActiveChallenge ? board.dnfs : [];

  const ownPlacement = identityAccountId
    ? placements.find((row) => row.accountId === identityAccountId) ?? null
    : null;
  // Invariant 2: a DNF (below) never counts as "finished" - only a
  // completed placement row does, so the CTA stays up through a DNF retry.
  const showRaceCta = segment === "today" && Boolean(todaysHeroChallenge) && !ownPlacement;
  const flavorBadge = activeChallenge?.dailyFeature
    ? dailyFlavorLabel(activeChallenge.dailyFeature.flavor)
    : null;

  return (
    <section className="boards-mode leaderboard-panel" aria-label="Boards">
      <h2>Boards</h2>

      <div className="board-segment-control" role="tablist" aria-label="Board period">
        {(["today", "yesterday"] as const).map((key) => (
          <button
            aria-selected={segment === key}
            className={segment === key ? "active" : undefined}
            key={key}
            onClick={() => setSegment(key)}
            role="tab"
            type="button"
          >
            {key === "today" ? "Today" : "Yesterday"}
          </button>
        ))}
      </div>

      {!activeChallenge ? (
        <p className="muted">
          {segment === "yesterday"
            ? "Yesterday's daily isn't available."
            : "Loading today's daily…"}
        </p>
      ) : (
        <>
          <div className="board-segment-header challenge-route">
            <div className="challenge-meta">
              <span>{segment === "today" ? "Today" : "Yesterday"}</span>
              {flavorBadge ? <span className="daily-badge">{flavorBadge}</span> : null}
            </div>
            <strong>
              {activeChallenge.start.title} <span className="route-arrow">{"->"}</span>{" "}
              {activeChallenge.target.title}
            </strong>
          </div>

          {showRaceCta ? (
            <div className="player-gate">
              <button
                className="start-race-button"
                disabled={raceBusy}
                onClick={() => onRaceChallenge(activeChallenge.id)}
                type="button"
              >
                {"▶"} Race today's daily
              </button>
            </div>
          ) : null}

          <section className="board-snippet" aria-label={`${segment === "today" ? "Today's" : "Yesterday's"} board`}>
            {placements.length ? (
              <ol>
                {placements.map((row) => {
                  const isYou = row.accountId === identityAccountId;
                  return (
                    <li className={isYou ? "is-you" : undefined} key={row.accountId}>
                      <span className="rank">#{row.placement}</span>
                      <span>
                        {row.displayName ?? "Unknown"}
                        {isYou ? <span className="muted"> (you)</span> : null}
                      </span>
                      <span>{formatTimeAndClicks(row.elapsedMs, row.clickCount)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted">No completed runs yet.</p>
            )}
          </section>

          <section className="board-snippet board-dnf-section muted" aria-label="DNF">
            <h3>DNF</h3>
            {dnfs.length ? (
              <ol>
                {dnfs.map((row) => {
                  const isYou = row.accountId === identityAccountId;
                  return (
                    <li className={isYou ? "is-you" : undefined} key={row.accountId}>
                      <span className="rank">{"—"}</span>
                      <span>
                        {row.displayName ?? "Unknown"}
                        {isYou ? <span className="muted"> (you)</span> : null}
                      </span>
                      <span>{formatTimeAndClicks(row.elapsedMs, row.clickCount)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p>No DNFs.</p>
            )}
          </section>

          <p className="muted board-footnote">Paths hidden until you&apos;ve played.</p>
        </>
      )}
    </section>
  );
}
