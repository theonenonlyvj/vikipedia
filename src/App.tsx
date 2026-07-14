import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { getSortedChallenges } from "./domain/challenges";
import {
  createGameSession,
  followResolvedLink,
  type GameSession,
} from "./domain/gameSession";
import { compressPathForStrip } from "./domain/pathCompression";
import type {
  Article,
  Challenge,
  RankedLeaderboardRow,
  ServerPathStep,
} from "./domain/types";
import {
  createVGamesIdentityClient,
  createVGamesIdentityRepository,
  type VGamesIdentityClient,
  type VGamesIdentityRepository,
  type VGamesIdentitySession,
} from "./services/vgamesIdentity";
import {
  createVikipediaApiClient,
  type VikipediaApiClient,
} from "./services/vikipediaApiClient";
import { createWikipediaGateway } from "./services/wikipediaGateway";
import type { RunRecordResponse } from "./server/trackingRepository";

interface AppProps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  storage?: Storage;
  apiClient?: VikipediaApiClient;
  identityClient?: VGamesIdentityClient;
  identityRepository?: VGamesIdentityRepository;
}

type ModeState = "idle" | "loading" | "playing" | "complete";
type TabKey = "play" | "leaderboard" | "challenges" | "stats";

export default function App({
  fetchImpl = globalThis.fetch.bind(globalThis),
  now = () => Date.now(),
  storage = globalThis.localStorage,
  apiClient: injectedApiClient,
  identityClient: injectedIdentityClient,
  identityRepository: injectedIdentityRepository,
}: AppProps) {
  const [modeState, setModeState] = useState<ModeState>("idle");
  const [activeTab, setActiveTab] = useState<TabKey>("play");
  const [identitySession, setIdentitySession] =
    useState<VGamesIdentitySession | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(
    null,
  );
  const [serverRun, setServerRun] = useState<RunRecordResponse | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [leaderboard, setLeaderboard] = useState<RankedLeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const apiClient = useMemo(
    () => injectedApiClient ?? createVikipediaApiClient(fetchImpl),
    [fetchImpl, injectedApiClient],
  );
  const identityClient = useMemo(
    () => injectedIdentityClient ?? createVGamesIdentityClient(fetchImpl),
    [fetchImpl, injectedIdentityClient],
  );
  const identityRepository = useMemo(
    () => injectedIdentityRepository ?? createVGamesIdentityRepository(storage),
    [injectedIdentityRepository, storage],
  );
  const wikipediaGateway = useMemo(
    () => createWikipediaGateway({ fetchImpl }),
    [fetchImpl],
  );

  const selectedChallenge =
    challenges.find((challenge) => challenge.id === selectedChallengeId) ??
    challenges[0] ??
    null;
  const nameIsReady =
    (identitySession?.displayName ?? displayNameDraft).trim().length > 0;
  const isBusy = modeState === "loading";
  const headerState =
    modeState === "complete"
      ? "result"
      : session && modeState !== "idle"
        ? "compact"
        : "expanded";

  useEffect(() => {
    const cachedSession = identityRepository.getSession();
    if (cachedSession) {
      setIdentitySession(cachedSession);
      setDisplayNameDraft(cachedSession.displayName);
    }
  }, [identityRepository]);

  useEffect(() => {
    let cancelled = false;

    async function loadChallengeCatalog() {
      setError(null);
      try {
        const nextChallenges = await apiClient.listChallenges();
        if (cancelled) {
          return;
        }
        setChallenges(nextChallenges);
        const firstChallenge = nextChallenges[0] ?? null;
        setSelectedChallengeId(firstChallenge?.id ?? null);
        if (firstChallenge) {
          setLeaderboard(await apiClient.listLeaderboard(firstChallenge.id));
        }
      } catch (caught) {
        if (!cancelled) {
          setError(errorMessage(caught, "Could not load challenges."));
        }
      }
    }

    void loadChallengeCatalog();

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  async function refreshLeaderboard(challengeId: string) {
    setLeaderboard(await apiClient.listLeaderboard(challengeId));
  }

  async function selectChallenge(challengeId: string) {
    setSelectedChallengeId(challengeId);
    setActiveTab("play");
    setError(null);
    try {
      await refreshLeaderboard(challengeId);
    } catch (caught) {
      setError(errorMessage(caught, "Could not load the leaderboard."));
    }
  }

  async function createChallenge(input: {
    startTitle: string;
    targetTitle: string;
  }) {
    if (!identitySession) {
      setError("Sign in before creating a challenge.");
      return;
    }

    setError(null);
    try {
      const challenge = await apiClient.createChallenge(
        input,
        identitySession.token,
      );
      setChallenges((current) =>
        getSortedChallenges([
          ...current.filter((item) => item.id !== challenge.id),
          challenge,
        ]),
      );
      if (!session || session.status !== "active") {
        setSelectedChallengeId(challenge.id);
        setServerRun(null);
        setSession(null);
        setArticle(null);
        setLeaderboard([]);
        setActiveTab("play");
      }
    } catch (caught) {
      setError(errorMessage(caught, "Could not create that challenge."));
      throw caught;
    }
  }

  async function playAsGuest() {
    const displayName = displayNameDraft.trim();
    if (!displayName) {
      setError("Display name is required to enter Vikipedia.");
      return;
    }

    setError(null);
    setModeState("loading");
    try {
      const session = await identityClient.playAsGuest({
        deviceCredential: identityRepository.getDeviceCredential(),
        displayName,
      });
      identityRepository.saveSession(session);
      setIdentitySession(session);
      setDisplayNameDraft(session.displayName);
      setModeState("idle");
    } catch (caught) {
      setModeState("idle");
      setError(errorMessage(caught, "Could not start a guest session."));
    }
  }

  async function secureOrLogin() {
    const username = displayNameDraft.trim();
    const password = passwordDraft.trim();
    if (!username) {
      setError("Display name is required to enter Vikipedia.");
      return;
    }
    if (!password) {
      setError("Password is required to secure a display name.");
      return;
    }

    setError(null);
    setModeState("loading");
    const deviceCredential = identityRepository.getDeviceCredential();
    try {
      let session: VGamesIdentitySession;
      if (identitySession?.status === "ghost") {
        session = await identityClient.secureGuest({
          deviceCredential,
          token: identitySession.token,
          username,
          password,
        });
      } else {
        try {
          const guest = await identityClient.playAsGuest({
            deviceCredential,
            displayName: username,
          });
          identityRepository.saveSession(guest);
          session = await identityClient.secureGuest({
            deviceCredential,
            token: guest.token,
            username,
            password,
          });
        } catch {
          session = await identityClient.login({
            deviceCredential,
            username,
            password,
          });
        }
      }
      identityRepository.saveSession(session);
      setIdentitySession(session);
      setDisplayNameDraft(session.displayName);
      setPasswordDraft("");
      setModeState("idle");
    } catch (caught) {
      setModeState("idle");
      setError(errorMessage(caught, "Could not secure that display name."));
    }
  }

  async function startSelectedChallenge() {
    if (!selectedChallenge) {
      return;
    }

    if (!identitySession) {
      setError("Display name is required to enter Vikipedia.");
      return;
    }

    setError(null);
    setModeState("loading");
    setLeaderboard([]);

    try {
      const nextRun = await apiClient.startRun(
        {
          challengeId: selectedChallenge.id,
          publicName: identitySession.displayName,
        },
        identitySession.token,
      );
      const nextArticle = await wikipediaGateway.getArticle(
        selectedChallenge.start.title,
      );
      const startedAtMs = Date.parse(nextRun.startedAt);
      setServerRun(nextRun);
      setSession(
        createGameSession(
          selectedChallenge,
          Number.isNaN(startedAtMs) ? now() : startedAtMs,
        ),
      );
      setArticle(nextArticle);
      await refreshLeaderboard(selectedChallenge.id);
      setActiveTab("play");
      setModeState("playing");
    } catch (caught) {
      setModeState("idle");
      setError(errorMessage(caught, "Could not start that challenge."));
    }
  }

  async function followArticleLink(title: string, anchorText: string) {
    if (
      !session ||
      !serverRun ||
      !identitySession ||
      session.status !== "active"
    ) {
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

      const clickResponse = await apiClient.recordClick(
        serverRun.id,
        {
          sourceTitle: session.currentPage.canonicalTitle,
          clickedAnchorText: anchorText,
          requestedTitle: title,
          destinationTitle: nextArticle.canonicalTitle,
          destinationPageId: nextArticle.pageId,
          clientTimestampMs: clickedAt,
        },
        identitySession.token,
      );

      const trackedSession = {
        ...nextSession,
        clicks: clickResponse.clickCount,
      };
      setArticle(nextArticle);
      setSession(trackedSession);

      if (trackedSession.status === "completed") {
        const leaderboardRow = await apiClient.completeRun(
          serverRun.id,
          {
            finalTitle: nextArticle.canonicalTitle,
            clientTimestampMs: clickedAt,
          },
          identitySession.token,
        );
        setServerRun({
          ...serverRun,
          status: "completed",
          clickCount: trackedSession.clicks,
          completedAt: leaderboardRow.completedAt,
          elapsedMs: leaderboardRow.elapsedMs,
        });
        await refreshLeaderboard(trackedSession.challenge.id);
        setModeState("complete");
      } else {
        setServerRun({
          ...serverRun,
          clickCount: trackedSession.clicks,
        });
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

  const currentPathTitles = session
    ? [
        session.challenge.start.title,
        ...session.path.map(
          (entry) => entry.resolvedDestination.canonicalTitle,
        ),
      ]
    : [];
  const visiblePath = session
    ? compressPathForStrip(
        currentPathTitles,
        session.challenge.target.title,
      )
    : [];
  const elapsedMs =
    serverRun?.elapsedMs ??
    (session?.status === "completed" && session.completedAt
      ? session.completedAt - session.startedAt
      : 0);

  if (!identitySession) {
    return (
      <main className="app-shell entry-shell" aria-busy={isBusy}>
        <section className="entry-gate" aria-label="Enter Vikipedia">
          <span className="viota-mark">Viota</span>
          <h1>Vikipedia</h1>
          <p>Secure your display name to track every run from game zero.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void secureOrLogin();
            }}
          >
            <label className="name-control">
              <span>Display name</span>
              <input
                aria-label="Display name"
                autoComplete="nickname"
                autoFocus
                maxLength={24}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                value={displayNameDraft}
              />
            </label>
            <label className="name-control">
              <span>Password</span>
              <input
                aria-label="Password"
                autoComplete="current-password"
                onChange={(event) => setPasswordDraft(event.target.value)}
                type="password"
                value={passwordDraft}
              />
            </label>
            <button
              type="submit"
              disabled={!nameIsReady || !passwordDraft.trim()}
            >
              Secure display name / Log in
            </button>
          </form>
          <button
            className="secondary-entry"
            disabled={!nameIsReady || isBusy}
            onClick={() => void playAsGuest()}
            type="button"
          >
            Play as guest
          </button>
          {error ? <p className="error-banner">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main
      className={`app-shell header-${headerState}`}
      aria-busy={isBusy}
    >
      <header className="game-header">
        <div className="brand-lockup" aria-label="Vikipedia by Viota">
          <span className="viota-mark">Viota</span>
          <h1>Vikipedia</h1>
        </div>

        <div className="challenge-route" aria-label="Current challenge">
          <span>{selectedChallenge?.label ?? "Challenge"}</span>
          <strong>
            {selectedChallenge
              ? `${selectedChallenge.start.title} -> ${selectedChallenge.target.title}`
              : "Loading"}
          </strong>
        </div>

        {session ? (
          <dl className="run-metrics" aria-label="Current run">
            <div>
              <dt>Clicks</dt>
              <dd>{session.clicks}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{session.challenge.target.title}</dd>
            </div>
          </dl>
        ) : null}

        <div className="player-gate">
          <button
            type="button"
            disabled={!selectedChallenge || !nameIsReady || isBusy}
            onClick={() => void startSelectedChallenge()}
          >
            Start {selectedChallenge?.label ?? "Challenge"}
          </button>
        </div>

        <div className="account-chip" role="status" aria-label="Current player">
          {identitySession.displayName}
        </div>
      </header>

      {session ? (
        <PathStrip titles={visiblePath} />
      ) : null}

      <nav className="tabbar" aria-label="Vikipedia views">
        {(["play", "leaderboard", "challenges", "stats"] as const).map(
          (tab) => (
            <button
              aria-pressed={activeTab === tab}
              className={activeTab === tab ? "active" : undefined}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ),
        )}
      </nav>

      {error ? <p className="error-banner">{error}</p> : null}
      {modeState === "loading" ? (
        <p className="loading-text">Loading article...</p>
      ) : null}

      <section className="content-shell">
        {activeTab === "play" ? (
          <PlayPanel
            article={article}
            challenges={challenges}
            elapsedMs={elapsedMs}
            handleArticleClick={handleArticleClick}
            modeState={modeState}
            onCreateChallenge={createChallenge}
            onSelectChallenge={(challengeId) => void selectChallenge(challengeId)}
            selectedChallenge={selectedChallenge}
            session={session}
          />
        ) : null}

        {activeTab === "leaderboard" ? (
          <LeaderboardPanel leaderboard={leaderboard} />
        ) : null}

        {activeTab === "challenges" ? (
          <ChallengeBrowser
            challenges={challenges}
            onCreateChallenge={createChallenge}
            onSelectChallenge={(challengeId) => void selectChallenge(challengeId)}
            selectedChallengeId={selectedChallenge?.id ?? null}
          />
        ) : null}

        {activeTab === "stats" ? (
          <StatsPanel
            accountId={identitySession.accountId}
            leaderboard={leaderboard}
            session={session}
          />
        ) : null}
      </section>
    </main>
  );
}

function PlayPanel({
  article,
  challenges,
  elapsedMs,
  handleArticleClick,
  modeState,
  onCreateChallenge,
  onSelectChallenge,
  selectedChallenge,
  session,
}: {
  article: Article | null;
  challenges: Challenge[];
  elapsedMs: number;
  handleArticleClick: (event: MouseEvent<HTMLElement>) => void;
  modeState: ModeState;
  onCreateChallenge: (input: {
    startTitle: string;
    targetTitle: string;
  }) => Promise<void>;
  onSelectChallenge: (challengeId: string) => void;
  selectedChallenge: Challenge | null;
  session: GameSession | null;
}) {
  if (session && article) {
    return (
      <section className="game-layout">
        <article className="article-panel" onClick={handleArticleClick}>
          <div className="article-heading">
            <span>{session.challenge.label ?? session.challenge.mode}</span>
            <h2>{article.canonicalTitle}</h2>
          </div>
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
          <p className="attribution">{article.attribution}</p>
        </article>

        {session.status === "completed" ? (
          <aside className="result-panel">
            <h2>Target reached</h2>
            <p>
              {session.clicks} {session.clicks === 1 ? "click" : "clicks"} in{" "}
              {formatElapsed(elapsedMs)}
            </p>
          </aside>
        ) : null}
      </section>
    );
  }

  return (
    <section className="home-layout">
      <section className="empty-state">
        <span>{selectedChallenge?.label ?? "Challenge"}</span>
        <h2>
          {selectedChallenge
            ? `${selectedChallenge.start.title} -> ${selectedChallenge.target.title}`
            : "Loading challenge catalog"}
        </h2>
        <p>{modeState === "loading" ? "Preparing run..." : "Pick a challenge."}</p>
      </section>

      <ChallengeBrowser
        challenges={challenges}
        onCreateChallenge={onCreateChallenge}
        onSelectChallenge={onSelectChallenge}
        selectedChallengeId={selectedChallenge?.id ?? null}
      />
    </section>
  );
}

function PathStrip({ titles }: { titles: string[] }) {
  return (
    <nav className="path-strip" aria-label="Run path">
      {titles.map((title, index) => (
        <span
          className={title === "..." ? "path-ellipsis" : undefined}
          key={`${title}-${index}`}
        >
          {title}
        </span>
      ))}
    </nav>
  );
}

function ChallengeBrowser({
  challenges,
  onCreateChallenge,
  onSelectChallenge,
  selectedChallengeId,
}: {
  challenges: Challenge[];
  onCreateChallenge: (input: {
    startTitle: string;
    targetTitle: string;
  }) => Promise<void>;
  onSelectChallenge: (challengeId: string) => void;
  selectedChallengeId: string | null;
}) {
  const [startTitle, setStartTitle] = useState("");
  const [targetTitle, setTargetTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const canCreate =
    startTitle.trim().length > 0 && targetTitle.trim().length > 0;

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    try {
      await onCreateChallenge({
        startTitle: startTitle.trim(),
        targetTitle: targetTitle.trim(),
      });
      setStartTitle("");
      setTargetTitle("");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="challenge-browser">
      <h2>Challenges</h2>
      <form className="create-challenge-form" onSubmit={submitChallenge}>
        <label className="name-control">
          <span>Start article</span>
          <input
            aria-label="Start article"
            maxLength={80}
            onChange={(event) => setStartTitle(event.target.value)}
            value={startTitle}
          />
        </label>
        <label className="name-control">
          <span>Target article</span>
          <input
            aria-label="Target article"
            maxLength={80}
            onChange={(event) => setTargetTitle(event.target.value)}
            value={targetTitle}
          />
        </label>
        <button type="submit" disabled={!canCreate || isCreating}>
          Create Challenge
        </button>
      </form>
      {challenges.length ? (
        <ol className="challenge-list">
          {challenges.map((challenge) => (
            <li key={challenge.id}>
              <button
                aria-pressed={selectedChallengeId === challenge.id}
                onClick={() => onSelectChallenge(challenge.id)}
                type="button"
              >
                <span>{challenge.label ?? challenge.id}</span>
                <strong>
                  {challenge.start.title} {"->"} {challenge.target.title}
                </strong>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No challenges loaded.</p>
      )}
    </section>
  );
}

function LeaderboardPanel({
  leaderboard,
}: {
  leaderboard: RankedLeaderboardRow[];
}) {
  return (
    <section className="leaderboard-panel">
      <h2>Leaderboard</h2>
      {leaderboard.length ? (
        <ol className="leaderboard">
          {leaderboard.map((row) => (
            <li key={row.runId}>
              <span className="rank">#{row.rank}</span>
              <span>{row.displayName}</span>
              <span>{formatElapsed(row.elapsedMs)}</span>
              <span>
                {row.clickCount} {row.clickCount === 1 ? "click" : "clicks"}
              </span>
              <details>
                <summary>Path</summary>
                <RunPathPreview path={row.pathPreview} />
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No completed runs yet.</p>
      )}
    </section>
  );
}

function RunPathPreview({ path }: { path: ServerPathStep[] }) {
  if (!path.length) {
    return <p className="muted">Path not loaded.</p>;
  }

  return (
    <ol className="path-preview">
      {path.map((step) => (
        <li key={step.stepNumber}>
          <span>{step.sourceTitle}</span>
          <strong>{step.clickedAnchorText}</strong>
          <span>{step.destinationTitle}</span>
        </li>
      ))}
    </ol>
  );
}

function StatsPanel({
  accountId,
  leaderboard,
  session,
}: {
  accountId: string;
  leaderboard: RankedLeaderboardRow[];
  session: GameSession | null;
}) {
  const personalRows = leaderboard.filter((row) => row.accountId === accountId);
  const visitedTitles = session
    ? [
        session.challenge.start.title,
        ...session.path.map(
          (entry) => entry.resolvedDestination.canonicalTitle,
        ),
      ]
    : [];
  const bestRow = personalRows.at(0) ?? null;

  return (
    <section className="stats-panel">
      <h2>Stats</h2>
      <dl className="stat-grid">
        <div>
          <dt>Runs ranked</dt>
          <dd>{personalRows.length}</dd>
        </div>
        <div>
          <dt>Best speed</dt>
          <dd>{bestRow ? formatElapsed(bestRow.elapsedMs) : "-"}</dd>
        </div>
        <div>
          <dt>Best clicks</dt>
          <dd>{bestRow ? bestRow.clickCount : "-"}</dd>
        </div>
        <div>
          <dt>Visited now</dt>
          <dd>{visitedTitles.length}</dd>
        </div>
      </dl>
      <StatsList
        title="Top starts"
        items={session ? [session.challenge.start.title] : []}
      />
      <StatsList
        title="Top targets"
        items={session ? [session.challenge.target.title] : []}
      />
      <StatsList title="Visited pages" items={visitedTitles} />
    </section>
  );
}

function StatsList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? (
        <ol className="compact-list">
          {items.slice(0, 5).map((item) => (
            <li key={item}>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No data yet.</p>
      )}
    </section>
  );
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
