import { formatElapsed } from "../race/shared";
import type { AccountStats } from "../domain/types";
import type { VGamesIdentitySession } from "../services/vgamesIdentity";

/**
 * You (profile/stats). Ports the old StatsPanel/StatsList unchanged, plus
 * the account chip that used to live in the always-visible app header (now
 * You-owned, per the redesign's "You (profile/stats)... For guests, this is
 * where the persistent claim/log-in affordance lives"). Unclaimed sessions
 * (no identity yet, or a guest ghost) get a standing "Claim your stats" CTA
 * here - distinct from Results' one-shot claim CTA (already shipped), this
 * one persists for as long as the account stays unclaimed.
 */
export default function You({
  identitySession,
  onClaimIdentity,
  onGoHome,
  stats,
}: {
  identitySession: VGamesIdentitySession | null;
  // PKG-11 remainder fix (2026-07-19): widened from `() => void` to the same
  // `(mode) => void` shape RaceResults.tsx's `ClaimCta` already uses, so
  // both entry points can share the one unified "Create account"/"Log in"
  // pair (brief item 5/acceptance criterion 3) instead of You keeping its
  // own third account verb ("Claim your stats").
  onClaimIdentity: (mode: "create" | "login") => void;
  // QF-09 (owner-proxy ruling, 2026-07-19): CTA out of the never-played
  // empty state, back to Home - same one-line `onGoHome={() =>
  // onSelectMode("home")}` wiring pattern AppShell.tsx already uses for
  // Browse.
  onGoHome: () => void;
  stats: AccountStats | null;
}) {
  const isUnclaimed = !identitySession || identitySession.status === "ghost";

  // QF-09 (owner-proxy ruling, 2026-07-19): the single-empty-state collapse
  // is scoped to the one unambiguous case - a true guest who has never even
  // started an identity, i.e. no identitySession AND stats hasn't resolved.
  // `stats === null` alone conflates guest/loading/error (App.tsx's
  // accountStatsProjection - see PKG-11's own note above), so a claimed
  // account whose stats fetch is still loading or has errored keeps today's
  // per-tile "No data yet." grid this pass, not this new empty state; only
  // widening the null-stats signal to distinguish those cases is left as
  // its own ticket, per the ruling.
  const isNeverPlayedGuest = stats === null && identitySession === null;

  return (
    <section className="you-panel">
      <div className="account-chip" role="status" aria-label="Current player">
        {identitySession?.displayName ?? "Guest"}
      </div>

      {isUnclaimed && !isNeverPlayedGuest ? (
        <section className="claim-cta" aria-label="Claim your stats">
          <p>
            {identitySession
              ? `You're on the board as ${identitySession.displayName}. Claim it so it stays yours.`
              : "Playing as a guest. Claim your name so your stats stay yours."}
          </p>
          {/* PKG-11 remainder fix: mirrors RaceResults.tsx's `ClaimCta` -
              the same "Create account"/"Log in" pair every other account
              entry point uses, not a third claim-framed verb. */}
          <div className="claim-cta-actions">
            <button type="button" onClick={() => onClaimIdentity("create")}>
              Create account
            </button>
            <button className="link-button" type="button" onClick={() => onClaimIdentity("login")}>
              Log in
            </button>
          </div>
        </section>
      ) : null}

      {isNeverPlayedGuest ? (
        // QF-09: one warm message instead of the 7-tile grid + 3 list
        // sections all repeating the same "No data yet." placeholder ten
        // times over for someone who has never raced at all. Reuses the
        // app's existing `.empty-state` panel chrome (Home.tsx's loading
        // state) rather than inventing new CSS.
        <section className="empty-state you-empty-state">
          <p>Play your first race to start building stats.</p>
          <button onClick={onGoHome} type="button">
            Home
          </button>
        </section>
      ) : (
        <StatsPanel stats={stats} />
      )}
    </section>
  );
}

// PKG-11 (council 2026-07-19, Judge A amendment 3, option b): "No data yet."
// - StatsList's own established convention (below) - covers both
// "stats haven't resolved yet" (loading/errored/no session; `stats` itself
// is null - see App.tsx's accountStatsProjection, which conflates all three)
// AND a resolved account's own genuinely-empty numeric field (`bestClicks`/
// `bestElapsedMs` are legitimately `null` before a first completion, not a
// missing-data bug). A confirmed-zero total (0 attempts, 0 completions, a
// fresh account's 0-day streak) now renders as the real number "0", never a
// bare "-" that reads like a rendering glitch. Distinguishing "loading" from
// "errored" from "guest, nothing to fetch" would need new state threaded
// through App.tsx -> AppShell.tsx -> You.tsx (accountStatsProjection has no
// such signal today) - descoped to its own ticket per the council rescope;
// this package only fixes the copy/zero-rendering, not that plumbing gap.
const NO_DATA_YET = "No data yet.";

function StatsPanel({ stats }: { stats: AccountStats | null }) {
  const totals = stats?.totals;

  return (
    <section className="stats-panel">
      {/* QF-09: nav's "Stats" tab now literally points at Boards
          (PKG-14, AppShell.tsx) - keeping this heading as "Stats" too
          made a screen one tap away self-identify with the same name.
          "Your stats" disambiguates without touching Boards' own
          ratified "Stats" rename. */}
      <h2>Your stats</h2>
      <dl className="stat-grid">
        {/* PKG-07 (council 2026-07-19, owner-proxy ruling (a)): the ritual-
            identity streak, reusing `accountStats.dailyStreak` - Home
            already fetches this same field for its own streak/trend chip
            (StreakTrendRow in Home.tsx), so You never has to introduce a
            second source of truth for it. No "best streak" tile alongside
            it - `AccountStats` doesn't track a lifetime-best streak
            anywhere server-side, and this repo's data-fidelity convention
            is to never fabricate a number the server hasn't actually
            computed. */}
        <div>
          <dt>Streak</dt>
          <dd>
            {stats ? `${stats.dailyStreak} ${stats.dailyStreak === 1 ? "day" : "days"}` : NO_DATA_YET}
          </dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{totals ? totals.attempts : NO_DATA_YET}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{totals ? totals.completed : NO_DATA_YET}</dd>
        </div>
        <div>
          <dt>DNFs</dt>
          <dd>{totals ? totals.abandoned : NO_DATA_YET}</dd>
        </div>
        <div>
          <dt>Best speed</dt>
          <dd>{totals?.bestElapsedMs === null || totals?.bestElapsedMs === undefined ? NO_DATA_YET : formatElapsed(totals.bestElapsedMs)}</dd>
        </div>
        {/* QF-09: averageElapsedMs/averageClicks are already server-computed,
            typed, and delivered on every AccountStats response - they were
            just never rendered. Same formatters as their "Best" siblings:
            formatElapsed for the ms field, and toFixed(1) for the
            fractional-clicks field, matching Boards.tsx's avgPlacement
            precedent. */}
        <div>
          <dt>Avg speed</dt>
          <dd>{totals ? formatElapsed(totals.averageElapsedMs) : NO_DATA_YET}</dd>
        </div>
        <div>
          <dt>Best clicks</dt>
          <dd>{totals?.bestClicks === null || totals?.bestClicks === undefined ? NO_DATA_YET : totals.bestClicks}</dd>
        </div>
        <div>
          <dt>Avg clicks</dt>
          <dd>{totals ? totals.averageClicks.toFixed(1) : NO_DATA_YET}</dd>
        </div>
        <div>
          <dt>Completed clicks</dt>
          <dd>{totals ? totals.totalClicks : NO_DATA_YET}</dd>
        </div>
      </dl>
      <StatsList
        title="Top starts"
        items={stats?.topStarts.map((item) => item.title) ?? []}
      />
      <StatsList
        title="Top targets"
        items={stats?.topTargets.map((item) => item.title) ?? []}
      />
      <StatsList title="Visited pages" items={stats?.mostVisited.map((item) => item.title) ?? []} />
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
        <p className="muted">{NO_DATA_YET}</p>
      )}
    </section>
  );
}
