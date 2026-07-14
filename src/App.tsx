import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getTodayChallenge, SOLO_CHALLENGES } from "./data/challenges";
import {
  createGameSession,
  followResolvedLink,
  type GameSession,
} from "./domain/gameSession";
import { createStatsSummary } from "./domain/stats";
import type {
  Article,
  Challenge,
  LeaderboardEntry,
  RunRecord,
  RunResult,
  StatsSummary,
  VGamesAccount,
} from "./domain/types";
import { createLocalDailyChallengeRepository } from "./services/dailyRepository";
import { createLocalVGamesIdentityClient } from "./services/identity";
import { createLocalRunHistoryRepository } from "./services/runHistoryRepository";
import { createWikipediaGateway } from "./services/wikipediaGateway";

interface AppProps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  storage?: Storage;
  todayKey?: string;
}

type ModeState = "idle" | "loading" | "playing" | "complete";

export default function App({
  fetchImpl = globalThis.fetch.bind(globalThis),
  now = () => Date.now(),
  storage = globalThis.localStorage,
  todayKey = new Date().toISOString().slice(0, 10),
}: AppProps) {
  const [account, setAccount] = useState<VGamesAccount | null>(null);
  const [modeState, setModeState] = useState<ModeState>("idle");
  const [session, setSession] = useState<GameSession | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("Guest");

  const identityClient = useMemo(
    () => createLocalVGamesIdentityClient(storage),
    [storage],
  );
  const dailyRepository = useMemo(
    () => createLocalDailyChallengeRepository(storage, now),
    [now, storage],
  );
  const runHistoryRepository = useMemo(
    () => createLocalRunHistoryRepository(storage),
    [storage],
  );
  const wikipediaGateway = useMemo(
    () => createWikipediaGateway({ fetchImpl }),
    [fetchImpl],
  );

  useEffect(() => {
    let cancelled = false;

    identityClient
      .quickAuth()
      .then((nextAccount) => {
        if (!cancelled) {
          setAccount(nextAccount);
          setDisplayNameDraft(nextAccount.displayName);
          void refreshStats(nextAccount.accountId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not create local VGames identity.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [identityClient]);

  async function refreshStats(accountId: string) {
    const records = await runHistoryRepository.getAllRuns();
    setStats(createStatsSummary(records, accountId));
  }

  async function startChallenge(challenge: Challenge) {
    setError(null);
    setModeState("loading");
    setLeaderboard([]);

    try {
      const startedAt = now();
      const nextSession = createGameSession(challenge, startedAt);
      const nextArticle = await wikipediaGateway.getArticle(
        challenge.start.title,
      );
      setSession(nextSession);
      setArticle(nextArticle);
      if (challenge.mode === "daily") {
        setLeaderboard(await dailyRepository.getLeaderboard(challenge.id));
      }
      setModeState("playing");
    } catch (caught) {
      setModeState("idle");
      setError(errorMessage(caught, "Could not load the start article."));
    }
  }

  async function saveDisplayName() {
    setError(null);
    try {
      const nextAccount = await identityClient.updateDisplayName(displayNameDraft);
      setAccount(nextAccount);
      setDisplayNameDraft(nextAccount.displayName);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save display name."));
    }
  }

  async function followArticleLink(title: string, anchorText: string) {
    if (!session || !account || session.status !== "active") {
      return;
    }

    setError(null);
    setModeState("loading");

    try {
      const clickedAt = now();
      const nextArticle = await wikipediaGateway.getArticle(title);
      const nextSession = followResolvedLink(session, {
        clickedAnchorText: anchorText,
        requestedTitle: title,
        resolvedDestination: {
          canonicalTitle: nextArticle.canonicalTitle,
          pageId: nextArticle.pageId,
        },
        timestamp: clickedAt,
      });

      setArticle(nextArticle);
      setSession(nextSession);

      if (nextSession.status === "completed") {
        if (nextSession.challenge.mode === "daily") {
          const result: RunResult = {
            challenge: nextSession.challenge,
            accountId: account.accountId,
            clicks: nextSession.clicks,
            elapsedMs: clickedAt - nextSession.startedAt,
            path: nextSession.path,
            status: "completed",
          };
          await dailyRepository.submitResult(result, account);
          setLeaderboard(
            await dailyRepository.getLeaderboard(nextSession.challenge.id),
          );
        }
        await runHistoryRepository.saveRun(
          createRunRecord(nextSession, account.accountId),
        );
        await refreshStats(account.accountId);
        setModeState("complete");
      } else {
        setModeState("playing");
      }
    } catch (caught) {
      setModeState("playing");
      setError(errorMessage(caught, "Could not load that article."));
    }
  }

  function handleArticleClick(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[data-vikipedia-title]");
    if (!link) {
      return;
    }

    event.preventDefault();
    const title = link.dataset.vikipediaTitle;
    if (title) {
      void followArticleLink(title, link.textContent?.trim() || title);
    }
  }

  const dailyChallenge = getTodayChallenge(todayKey);
  const elapsedMs =
    session?.status === "completed" && session.completedAt
      ? session.completedAt - session.startedAt
      : 0;

  return (
    <main className="app-shell" aria-busy={modeState === "loading"}>
      <header className="topbar">
        <div>
          <h1>Vikipedia</h1>
          <p className="subtitle">Ranked Classic Wikipedia racing</p>
        </div>
        <div className="account-chip" aria-label="Current player">
          {account?.displayName ?? "Loading"}
        </div>
      </header>

      <section className="control-panel" aria-label="Game controls">
        <label className="name-control">
          <span>Display name</span>
          <input
            aria-label="Display name"
            maxLength={24}
            onChange={(event) => setDisplayNameDraft(event.target.value)}
            value={displayNameDraft}
          />
        </label>
        <button type="button" onClick={() => void saveDisplayName()}>
          Save Name
        </button>
        <button
          type="button"
          onClick={() => void startChallenge(dailyChallenge)}
        >
          Daily Challenge
        </button>
        <button
          type="button"
          onClick={() => void startChallenge(SOLO_CHALLENGES[0])}
        >
          Solo Run
        </button>
        {session ? (
          <dl className="score-strip">
            <div>
              <dt>Start</dt>
              <dd>{session.challenge.start.title}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{session.challenge.target.title}</dd>
            </div>
            <div>
              <dt>Clicks</dt>
              <dd>{session.clicks}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
      {modeState === "loading" ? (
        <p className="loading-text">Loading article...</p>
      ) : null}

      {session && article ? (
        <section className="game-layout">
          <article className="article-panel" onClick={handleArticleClick}>
            <div className="article-heading">
              <span>{session.challenge.mode}</span>
              <h2>{article.canonicalTitle}</h2>
            </div>
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
            <p className="attribution">{article.attribution}</p>
          </article>

          <aside className="side-panel">
            {session.status === "completed" ? (
              <section className="result-box">
                <h2>Target reached</h2>
                <p>
                  {session.clicks} {session.clicks === 1 ? "click" : "clicks"} in{" "}
                  {formatElapsed(elapsedMs)}
                </p>
              </section>
            ) : null}

            <section>
              <h2>Path</h2>
              {session.path.length ? (
                <ol className="path-list">
                  {session.path.map((entry) => (
                    <li key={`${entry.clickNumber}-${entry.timestamp}`}>
                      <span>{entry.sourcePage.canonicalTitle}</span>
                      <strong>{entry.clickedAnchorText}</strong>
                      <span>{entry.resolvedDestination.canonicalTitle}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No clicks yet.</p>
              )}
            </section>

            {session.challenge.mode === "daily" ? (
              <section>
                <h2>Daily Board</h2>
                {leaderboard.length ? (
                  <ol className="leaderboard">
                    {leaderboard.map((row) => (
                      <li key={row.accountId}>
                        <span>{row.displayName}</span>
                        <span>
                          {row.clicks} {row.clicks === 1 ? "click" : "clicks"}
                        </span>
                        <span>{formatElapsed(row.elapsedMs)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">No daily results yet.</p>
                )}
              </section>
            ) : null}

            <StatsPanel stats={stats} />
          </aside>
        </section>
      ) : (
        <section className="home-layout">
          <section className="empty-state">
            <h2>{dailyChallenge.start.title} to {dailyChallenge.target.title}</h2>
            <p>Start the daily challenge or a solo run to begin navigating.</p>
          </section>
          <StatsPanel stats={stats} />
        </section>
      )}
    </main>
  );
}

function StatsPanel({ stats }: { stats: StatsSummary | null }) {
  const summary = stats ?? createStatsSummary([], "");

  return (
    <section className="stats-panel">
      <h2>Personal Stats</h2>
      <dl className="stat-grid">
        <div>
          <dt>Runs played</dt>
          <dd>{summary.totals.runs}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{summary.totals.completed}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>
            {summary.totals.bestClicks === null
              ? "-"
              : `${summary.totals.bestClicks} clicks`}
          </dd>
        </div>
        <div>
          <dt>Avg clicks</dt>
          <dd>{summary.totals.averageClicks.toFixed(1)}</dd>
        </div>
      </dl>
      <StatsList title="Top starts" items={summary.topStarts} />
      <StatsList title="Top targets" items={summary.topTargets} />
      <StatsList title="Most visited" items={summary.mostVisited} />
      <StatsList title="Bridge pages" items={summary.bridgePages} />
      <section>
        <h3>Common jumps</h3>
        {summary.commonJumps.length ? (
          <ol className="compact-list">
            {summary.commonJumps.slice(0, 5).map((jump) => (
              <li key={`${jump.sourceTitle}->${jump.destinationTitle}`}>
                <span>
                  {jump.sourceTitle} {"->"} {jump.destinationTitle}
                </span>
                <strong>{jump.count}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No jumps yet.</p>
        )}
      </section>
    </section>
  );
}

function StatsList({
  title,
  items,
}: {
  title: string;
  items: { title: string; count: number }[];
}) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? (
        <ol className="compact-list">
          {items.slice(0, 5).map((item) => (
            <li key={item.title}>
              <span>{item.title}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No data yet.</p>
      )}
    </section>
  );
}

function createRunRecord(session: GameSession, accountId: string): RunRecord {
  const endedAt = session.completedAt ?? session.abandonedAt ?? Date.now();
  return {
    id: `run_${accountId}_${session.startedAt}_${session.challenge.id}`,
    accountId,
    challengeId: session.challenge.id,
    mode: session.challenge.mode,
    status: session.status === "abandoned" ? "abandoned" : "completed",
    start: {
      canonicalTitle: session.challenge.start.title,
      pageId: session.challenge.start.pageId,
    },
    target: {
      canonicalTitle: session.challenge.target.title,
      pageId: session.challenge.target.pageId,
    },
    clicks: session.clicks,
    elapsedMs: endedAt - session.startedAt,
    createdAt: session.startedAt,
    completedAt: session.completedAt,
    abandonedAt: session.abandonedAt,
    path: session.path,
  };
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
