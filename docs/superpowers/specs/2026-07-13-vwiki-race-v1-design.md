# VWiki Race V1 Design

Status: approved design  
Date: 2026-07-13  
Project: VWiki Race  
Related research: `docs/game-principles-and-rules.md`

## Summary

VWiki Race v1 is a contract-first Wikipedia navigation game. It proves the solo
and daily challenge loops now, while shaping identity and result data around the
future VGames platform.

The first build will not include multiplayer, real VGames backend writes, a
password account system, a shortest-path solver, or random prompt generation.

## Goals

1. Build a playable solo ranked run.
2. Build a daily challenge with local leaderboard storage.
3. Use a local mock of the VGames identity contract instead of standalone auth.
4. Render Wikipedia content through a controlled article viewer.
5. Track complete paths for scoring, replay, validation, and future analysis.
6. Keep seams clean so local mock services can later be swapped for real VGames
   Identity and platform storage.

## Non-Goals

1. Multiplayer race lobbies.
2. Real VGames backend integration.
3. Password login, account claiming, or email inside VWiki Race.
4. Automatic shortest-path solving.
5. Random prompt generation.
6. Mobile app wrapper.
7. Full offline Wikipedia snapshot.

## Architecture

VWiki Race is a standalone game repository. It should fit the VGames program as a
future game client, not invent a separate account platform.

The app is split into five main areas:

1. **Client UI**: React, Vite, and TypeScript app for the game surface.
2. **Game domain module**: pure TypeScript state and rules for runs, scoring,
   win detection, path immutability, and leaderboard sorting.
3. **Wikipedia gateway**: fetches article content, normalizes canonical article
   identity, filters links, and returns renderable article data.
4. **VGames identity client**: an interface-first boundary with a mock
   implementation for v1 and a real VGames implementation later.
5. **Daily challenge repository**: local/mock persistence for daily prompts,
   submissions, and leaderboard rows, replaceable by platform storage later.

## User Experience

The first screen is the playable app, not a landing page.

The interface has:

1. A compact top bar with mode, start article, target article, click count,
   timer, and current display name.
2. A controlled article view as the main surface.
3. A path panel showing the visited article chain and clicked anchor text.
4. A completion view with final score, elapsed time, path, and daily leaderboard
   when relevant.

V1 supports:

1. **Solo**: selected from a curated prompt list.
2. **Daily**: selected deterministically from a checked-in date-keyed challenge
   list.

## Gameplay Flow

1. On app load, `VGamesIdentityClient.quickAuth()` returns a VGames-shaped
   account: `accountId`, `displayName`, `status`, and `token`.
2. The player starts either a Solo run or the Daily challenge.
3. `GameSession` initializes with canonical start/target metadata, timer, empty
   path, and ruleset `ranked_classic`.
4. `WikipediaGateway.getArticle(titleOrPageId)` fetches the current article,
   resolves canonical metadata when available, filters the document, and exposes
   only valid internal article links.
5. The player clicks a rendered valid link.
6. The app dispatches `FOLLOW_LINK`.
7. If navigation is valid, the app increments click count, appends a path entry,
   fetches the destination, resolves redirects, and checks whether the canonical
   target has been reached.
8. On win, the timer stops and the run becomes immutable.
9. Daily results submit through `DailyChallengeRepository.submitResult()`.
10. The leaderboard sorts by fewest clicks, then elapsed time, then earliest
    submitted timestamp.

## Wikipedia Content Strategy

V1 uses live English Wikipedia content.

The gateway must:

1. Use a Wikimedia-compatible user agent or request header when applicable.
2. Preserve source attribution and license notice in the UI.
3. Cache article responses in memory during a run.
4. Record canonical title and page ID when the API provides them.
5. Treat redirects as one click from the source page to the resolved destination.

V1 does not attempt to snapshot all Wikipedia content. Competitive fairness is
handled by curated prompts and path logging first; stronger snapshotting can be
added when real platform storage exists.

## Ranked Classic Rules In V1

V1 implements the ranked classic baseline from
`docs/game-principles-and-rules.md`.

Allowed:

1. Lead-section article links.
2. Main prose article links.
3. Infobox links.
4. Substantive article table/list links.
5. "See also" article links.

Disallowed:

1. Search, sidebar, top navigation, footer, edit/history/talk links.
2. External links.
3. Citation/reference backlinks and bibliography-only links.
4. Category links.
5. Language links.
6. File/media/license links.
7. Template-generated navboxes and portal boxes.
8. Red links or nonexistent pages.
9. Special, Help, Wikipedia, User, Talk, Template, Module, Portal, and Category
   namespace pages.

Additional behavior:

1. The browser Back button is not part of game navigation.
2. Same-page anchors do not count as moves.
3. Redirects count as one move.
4. Reaching the target requires loading the target article, not merely seeing a
   link to it.
5. Invalid fetches or blocked destinations do not mutate the path.

## Data Model

### `VGamesAccount`

- `accountId`
- `displayName`
- `status`: `ghost` for v1
- `token`

### `Challenge`

- `id`
- `dateKey`, only for daily challenges
- `mode`: `solo` or `daily`
- `start`
- `target`
- `ruleset`
- `source`

### `Article`

- `pageId`
- `canonicalTitle`
- `revisionId`, when available
- `html`
- `links`

### `ArticleLink`

- `href`
- `title`
- `pageId`, when available
- `anchorText`
- `sourceSection`, when available

### `PathEntry`

- `sourcePage`
- `clickedAnchorText`
- `requestedTitle`
- `resolvedDestination`
- `timestamp`
- `clickNumber`

### `RunResult`

- `challenge`
- `accountId`
- `clicks`
- `elapsedMs`
- `path`
- `status`: `completed` or `abandoned`

### `LeaderboardEntry`

- `accountId`
- `displayName`
- `clicks`
- `elapsedMs`
- `submittedAt`
- `pathHash`

## Identity Contract

V1 uses a mock implementation, but its shape should match the future VGames
contract.

Expected interface:

1. `quickAuth(): Promise<VGamesAccount>`
2. `updateDisplayName(displayName): Promise<VGamesAccount>`
3. `getCurrentAccount(): Promise<VGamesAccount | null>`
4. `signOutLocalOnly(): Promise<void>` for development/reset use only

The mock stores only non-sensitive local data. It does not implement passwords,
email, account claiming, or permanent cross-device identity.

## Daily Challenge Contract

V1 local daily storage should expose:

1. `getTodayChallenge(dateKey): Promise<Challenge>`
2. `submitResult(result): Promise<LeaderboardEntry>`
3. `getLeaderboard(challengeId): Promise<LeaderboardEntry[]>`
4. `getBestResult(accountId, challengeId): Promise<LeaderboardEntry | null>`

Duplicate daily submissions keep the best result for that account and challenge.
If the score is identical, the earlier submission wins.

## Error Handling

1. **Wikipedia fetch fails**: keep the player on the current page, show retry,
   and do not count a click.
2. **Disallowed namespace appears**: block navigation, keep the path unchanged,
   and record a validation error for development diagnostics.
3. **Redirect loop or ambiguous canonical result**: stop the navigation, keep the
   path unchanged, and show a blocked/retry state.
4. **Daily submission fails**: keep the completed result locally and mark it as
   pending sync.
5. **Corrupt mock identity state**: mint a new ghost account and quarantine the
   broken local record if possible.
6. **Duplicate daily submission**: store the best result per account per daily
   challenge.

## Testing And Verification

Automated coverage should include:

1. Unit tests for rule filtering and link classification.
2. Unit tests for scoring sort order.
3. Unit tests for win detection.
4. Unit tests for redirect handling.
5. Unit tests for path immutability after completion.
6. Fixture tests using saved article HTML snippets.
7. Integration tests for a mocked start-to-target run.
8. UI smoke test that loads the app, starts the daily challenge, follows a
   mocked link, completes the run, and shows the leaderboard.

Manual verification should include a few live Wikipedia pages after
implementation, because live content can change.

## Future Integration Notes

When VGames Identity is ready, replace the mock implementation behind
`VGamesIdentityClient` without changing gameplay modules.

When VGames platform storage is ready, replace `DailyChallengeRepository` with a
real platform-backed implementation. Existing daily rows already reference
VGames-style account IDs, so the write model should remain compatible.

When VGames Rooms is ready, multiplayer can be designed as a separate feature.
The solo/daily state machine should stay reusable, but v1 does not design
real-time lobbies or synchronized races.

