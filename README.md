# VWiki Race

VWiki Race is a Wikipedia navigation game: players start on one article and race
to a target article by clicking valid internal Wikipedia links.

Every run is server-tracked from game 0 with VGames identity and a VWiki
Race-owned Cloudflare D1 database. The game is challenge-leaderboard based; it
does not need VGames realtime rooms or the card-game layer.

## Current Docs

- [Game Principles and Rules](docs/game-principles-and-rules.md)
- [Server-Tracked V0 Spec](docs/superpowers/specs/2026-07-14-server-tracked-v0-design.md)
- [VGames Identity V0 Spec](docs/superpowers/specs/2026-07-14-vgames-identity-v0-design.md)
- [VGames Identity V0 Plan](docs/superpowers/plans/2026-07-14-vgames-identity-v0.md)
- [Cloudflare Deployment Handoff](docs/handoff/cloudflare-deployment-handoff.md)
- [Backlog](docs/backlog.md)
- [Daily Challenge Design](docs/superpowers/specs/2026-07-15-daily-challenge-design.md)
- [Target Preview Design](docs/superpowers/specs/2026-07-15-target-preview-design.md)

## V0 Product Shape

- `challenge-0001` is `Challenge #1`: `Moon` to `Gravity`.
- Players can create challenges from Wikipedia titles or article URLs. The
  Worker canonicalizes and validates both nodes before an atomic D1 insert.
- Manual and daily challenges share one global transactional number sequence.
  If `#15` exists, the next accepted challenge is `#16`, regardless of date or
  creator.
- A minute-7 hourly cron eventually creates one random, validated challenge per
  UTC date. The date is provenance, never the challenge number.
- The unique VGames name/handle is the canonical public identity.
- Guests can play through a VGames ghost account and claim their stats later.
- The identity prompt appears only before Start or Create. Returning ghosts are
  encouraged to claim their name but can continue as the same guest.
- Runs, clicks, path steps, challenge creators, and leaderboard rows are written
  through the canonical Cloudflare Worker to D1, not localStorage.
- The timer measures accepted player decision time. Wikipedia fetch and server
  synchronization latency are excluded.
- Leaderboards rank by fastest decision time, then fewest clicks, then earliest
  accepted completion. Paths load only when disclosed.
- Each click records source title, anchor text, requested title, resolved
  destination, page/revision identity, cumulative decision time, and timestamps.
- The app renders a sanitized, attributed Wikipedia revision. Only displayed
  game links can become accepted moves.
- Before a run starts, the selected target shows a short, read-only Wikipedia
  lead. Preview failure never blocks Start, and preview links cannot become
  game moves.
- Challenge links use `/?challenge=challenge-000N` and remain stable.

## Local Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run the frontend only (API calls remain relative):

```bash
npm run dev -- --host 127.0.0.1
```

For a local Worker on loopback, set a development-only origin such as:

```bash
VITE_VWIKI_RACE_API_URL=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1
```

Production builds require an HTTPS canonical Worker origin:

```bash
VITE_VWIKI_RACE_API_URL=https://vwikirace-api.example.workers.dev npm run build
```

Run the complete test gates:

```bash
npm test
npm run test:worker
npm run build
```

The canonical Worker needs:

- `VGAMES_URL`
- `ALLOWED_ORIGINS`
- D1 binding `VWIKI_RACE_DB`
- rate-limit bindings `CLICK_RATE_LIMITER` and `ACCOUNT_READ_RATE_LIMITER`

## Identity And Data

VGames owns accounts, unique names/handles, guest ghosts, login, and account
merges. VWiki Race should own challenges, runs, click events, path steps, and
per-challenge leaderboards keyed by VGames `account_id` in D1.

Do not create a VWiki Race-local `players` namespace. The removed local
prototype repositories were intentionally replaced by VGames sessions and D1.

## Cloudflare Architecture

- Pages hosts the static Vite build at `vwikirace.pages.dev`.
- `vwikirace-api` is the only canonical API and the only process with D1.
- Retained Pages Functions are bounded compatibility proxies for old `/api/*`
  clients; they do not bind D1 or duplicate authorization logic.
- The API Worker cron is `7 * * * *` in UTC.

Pages build settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

Apply every migration in order from `d1/migrations/` before deploying the
Worker that depends on it. Never rewrite an already-applied migration.

## VGames

VGames integration is in scope for v0 identity. Realtime rooms are not in scope
for VWiki Race v0 because gameplay is asynchronous challenge attempts.
