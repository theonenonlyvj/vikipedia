# Vikipedia V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable contract-first Vikipedia v1 with solo runs, daily challenge, local VGames-shaped identity, controlled Wikipedia article rendering, path logging, and local leaderboard storage.

**Architecture:** Use a Vite React TypeScript app with pure domain modules for game state, rules, and leaderboard logic. Keep service boundaries explicit: `VGamesIdentityClient`, `WikipediaGateway`, and `DailyChallengeRepository` each have mock/local implementations that can be replaced by real VGames or platform services later.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, jsdom, native `fetch`, browser `localStorage`, browser `crypto.randomUUID`.

## Global Constraints

- The first screen is the playable app, not a landing page.
- V1 uses live English Wikipedia content.
- V1 uses a local mock of the VGames identity contract instead of standalone auth.
- V1 does not include multiplayer, real VGames backend integration, password login, account claiming, random prompt generation, shortest-path solving, a mobile wrapper, or an offline Wikipedia snapshot.
- Daily challenge rows must reference VGames-style `accountId` values.
- Invalid fetches, disallowed destinations, and blocked navigation must not mutate the run path.
- Completed runs are immutable.
- Do not add remotes, push, deploy, or commit unless Vijay explicitly asks.

---

## File Structure

- `package.json`: project scripts and runtime/test dependencies.
- `index.html`: Vite root shell.
- `vite.config.ts`: Vite + React configuration.
- `tsconfig.json`, `tsconfig.node.json`: TypeScript project configuration.
- `vitest.config.ts`: Vitest/jsdom configuration.
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: top-level application wiring and UI state.
- `src/styles.css`: app styling.
- `src/domain/types.ts`: shared Vikipedia domain types.
- `src/domain/rules.ts`: link classification and namespace filtering.
- `src/domain/gameSession.ts`: run state machine, navigation transitions, win detection, path immutability.
- `src/domain/leaderboard.ts`: daily leaderboard comparison and best-result replacement.
- `src/data/challenges.ts`: curated solo prompts and date-keyed daily challenges.
- `src/services/identity.ts`: `VGamesIdentityClient` and local mock implementation.
- `src/services/dailyRepository.ts`: local daily result persistence.
- `src/services/wikipediaGateway.ts`: live Wikipedia fetch, HTML parsing, link filtering, attribution metadata.
- `src/test/fixtures.ts`: deterministic article fixtures.
- `src/**/*.test.ts`: unit and integration tests.

---

### Task 1: Project Scaffold And Domain Types

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/domain/types.ts`
- Test: `src/domain/types.test.ts`

**Interfaces:**
- Produces: `VGamesAccount`, `Challenge`, `Article`, `ArticleLink`, `PathEntry`, `RunResult`, `LeaderboardEntry`, and `RunStatus` types.

- [ ] **Step 1: Write the failing type smoke test**

```ts
import { describe, expect, it } from "vitest";
import type { Challenge, LeaderboardEntry, VGamesAccount } from "./types";

describe("domain types", () => {
  it("supports the VGames-shaped identity and daily row contracts", () => {
    const account: VGamesAccount = {
      accountId: "acct_local_1",
      displayName: "Guest",
      status: "ghost",
      token: "mock-token",
    };
    const challenge: Challenge = {
      id: "daily-2026-07-13",
      dateKey: "2026-07-13",
      mode: "daily",
      start: { title: "Apple" },
      target: { title: "Philosophy" },
      ruleset: "ranked_classic",
      source: "curated",
    };
    const row: LeaderboardEntry = {
      accountId: account.accountId,
      displayName: account.displayName,
      challengeId: challenge.id,
      clicks: 4,
      elapsedMs: 12000,
      submittedAt: 1783987200000,
      pathHash: "hash",
    };

    expect(row.challengeId).toBe(challenge.id);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/domain/types.test.ts`

Expected: fail because the project and `src/domain/types.ts` do not exist.

- [ ] **Step 3: Create the minimal Vite/React/TypeScript scaffold and types**

Create the files listed for this task. `src/App.tsx` can render a minimal shell that will be replaced by later tasks. `src/domain/types.ts` must define the exact types consumed by the smoke test.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/domain/types.test.ts`

Expected: pass.

---

### Task 2: Rules, Session State, And Leaderboard Domain

**Files:**
- Create: `src/domain/rules.ts`
- Create: `src/domain/gameSession.ts`
- Create: `src/domain/leaderboard.ts`
- Test: `src/domain/rules.test.ts`
- Test: `src/domain/gameSession.test.ts`
- Test: `src/domain/leaderboard.test.ts`

**Interfaces:**
- Consumes: domain types from `src/domain/types.ts`.
- Produces:
  - `isAllowedArticleHref(href: string): boolean`
  - `extractTitleFromHref(href: string): string | null`
  - `createGameSession(challenge: Challenge, startedAt: number): GameSession`
  - `followResolvedLink(session: GameSession, input: FollowResolvedLinkInput): GameSession`
  - `abandonSession(session: GameSession, abandonedAt: number): GameSession`
  - `rankLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[]`
  - `pickBestEntry(current: LeaderboardEntry | null, next: LeaderboardEntry): LeaderboardEntry`

- [ ] **Step 1: Write failing tests for rules, game state, and leaderboard sorting**

Tests must cover disallowed namespaces, same-page anchors, win detection by canonical target, path immutability after completion, clicks-time-submitted sort order, and duplicate result replacement.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- src/domain/rules.test.ts src/domain/gameSession.test.ts src/domain/leaderboard.test.ts`

Expected: fail because the modules do not exist.

- [ ] **Step 3: Implement the pure domain modules**

Keep these modules browser-independent except for standard built-ins. Do not fetch, read `localStorage`, or touch React from these files.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- src/domain/rules.test.ts src/domain/gameSession.test.ts src/domain/leaderboard.test.ts`

Expected: pass.

---

### Task 3: Local Identity, Challenges, And Daily Repository

**Files:**
- Create: `src/data/challenges.ts`
- Create: `src/services/identity.ts`
- Create: `src/services/dailyRepository.ts`
- Test: `src/services/identity.test.ts`
- Test: `src/services/dailyRepository.test.ts`

**Interfaces:**
- Consumes: `Challenge`, `LeaderboardEntry`, `RunResult`, and `VGamesAccount`.
- Produces:
  - `createLocalVGamesIdentityClient(storage: StorageLike): VGamesIdentityClient`
  - `createLocalDailyChallengeRepository(storage: StorageLike, now: () => number): DailyChallengeRepository`
  - `getTodayChallenge(dateKey: string): Challenge`
  - `SOLO_CHALLENGES`
  - `DAILY_CHALLENGES`

- [ ] **Step 1: Write failing tests for identity and daily result persistence**

Tests must verify ghost account creation, account reuse from storage, display name updates, deterministic daily selection, best-result replacement, and leaderboard sorting.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- src/services/identity.test.ts src/services/dailyRepository.test.ts`

Expected: fail because the services do not exist.

- [ ] **Step 3: Implement local mock services**

Use a small `StorageLike` interface so tests can use in-memory storage. The identity mock must store only non-sensitive local data and generate `acct_local_*` ids plus opaque mock tokens.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- src/services/identity.test.ts src/services/dailyRepository.test.ts`

Expected: pass.

---

### Task 4: Wikipedia Gateway With Fixture Coverage

**Files:**
- Create: `src/services/wikipediaGateway.ts`
- Create: `src/test/fixtures.ts`
- Test: `src/services/wikipediaGateway.test.ts`

**Interfaces:**
- Consumes: `Article`, `ArticleLink`, and `isAllowedArticleHref`.
- Produces:
  - `createWikipediaGateway(options: { fetchImpl: typeof fetch; endpoint?: string }): WikipediaGateway`
  - `WikipediaGateway.getArticle(title: string): Promise<Article>`

- [ ] **Step 1: Write failing fixture tests**

Tests must verify that the gateway parses a mocked Wikipedia parse response, keeps content links, removes category/external/edit/navbox/citation links, resolves `/wiki/Title` links to article titles, and returns canonical title/page id.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/services/wikipediaGateway.test.ts`

Expected: fail because the gateway does not exist.

- [ ] **Step 3: Implement the gateway**

Use the MediaWiki Action API parse endpoint for live content, parse returned HTML with `DOMParser`, remove disallowed sections/classes where practical, rewrite valid links into app-clickable article links, and include attribution metadata.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/services/wikipediaGateway.test.ts`

Expected: pass.

---

### Task 5: Playable React App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: domain modules, local identity client, local daily repository, challenges, and Wikipedia gateway.
- Produces: playable Solo and Daily UI with result submission and leaderboard display.

- [ ] **Step 1: Write the failing UI smoke test**

Use mocked article responses to verify the app renders Daily mode, follows a link from the start article to the target article, shows completion, and displays a leaderboard entry.

- [ ] **Step 2: Run the UI test and verify it fails**

Run: `npm test -- src/App.test.tsx`

Expected: fail because the UI is still a minimal shell.

- [ ] **Step 3: Implement the playable app UI**

Wire identity, mode selection, challenge start, article fetch/render, valid link clicks, timer/click/path display, completion, daily result submission, and leaderboard display. Keep the UI compact and game-first.

- [ ] **Step 4: Run the UI test and verify it passes**

Run: `npm test -- src/App.test.tsx`

Expected: pass.

---

### Task 6: Final Verification And Docs Update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented setup/test commands and a verified local dev app.

- [ ] **Step 1: Update README**

Document the Vikipedia v1 scope, local development command, test command, and VGames mock identity caveat.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: build exits 0 and writes `dist/`.

- [ ] **Step 4: Start dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite prints a local URL. Leave the server running and report the URL.

