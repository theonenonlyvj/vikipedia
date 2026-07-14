# Server-Tracked V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VWiki Race v0 where every started challenge, click, completion, leaderboard row, and player stat is tracked through a server API backed by a separate Supabase project.

**Architecture:** Keep React/Vite as the frontend and add Cloudflare Pages Functions as the server boundary. Functions call pure TypeScript API handlers, and the production repository writes to Supabase using server-only credentials. The frontend reads challenges and leaderboards from the API, requires a display name before starting a run, and shows Viota-branded game chrome around a Wikipedia-native article renderer.

**Tech Stack:** React 19, Vite 6, TypeScript, Vitest, Cloudflare Pages Functions, Supabase Postgres, `@supabase/supabase-js`.

## Global Constraints

- Supabase is the official source of truth for runs, leaderboards, and stats.
- Browser `localStorage` may store player id and retry state only; it is not official storage.
- VGames integration is out of scope for this implementation.
- V0 uses display names only; no passwords, email login, invite code, or VGames account binding.
- Challenge #1 is `challenge-0001`, label `Challenge #1`, start `Moon`, target `Gravity`, ruleset `ranked_classic`.
- Leaderboards sort by lowest elapsed time, then lowest click count, then earliest completion time.
- The article body must stay visually close to Wikipedia and preserve infoboxes, images, headings, tables when manageable, captions, and normal link styling.
- Viota branding applies to app chrome only: dark aurora background, cyan/coral accents, chunky brand treatment, chamfered controls and HUD containers.
- During a run, desktop and mobile headers stay sticky and compressed.
- Long path strips show `... -> latest previous 3 pages -> target` on both desktop and mobile.
- Finished runs expand back into a result header with leaderboard/replay actions.

---

## File Structure

- `src/domain/challenges.ts`: active challenge seed and sort helpers.
- `src/domain/pathCompression.ts`: visible path strip compression.
- `src/domain/serverLeaderboard.ts`: leaderboard ranking and stats derivation from server-shaped rows.
- `src/server/contracts.ts`: shared API request/response types.
- `src/server/http.ts`: JSON parsing, validation errors, and response helpers.
- `src/server/trackingRepository.ts`: repository interface used by API handlers.
- `src/server/apiHandlers.ts`: pure handlers for players, challenges, runs, leaderboards, and paths.
- `src/server/supabaseTrackingRepository.ts`: Supabase-backed repository implementation.
- `functions/api/challenges.ts`: Cloudflare route for challenge listing.
- `functions/api/players.ts`: Cloudflare route for display-name players.
- `functions/api/runs/start.ts`: Cloudflare route for run start.
- `functions/api/runs/[runId]/click.ts`: Cloudflare route for click events.
- `functions/api/runs/[runId]/complete.ts`: Cloudflare route for completion.
- `functions/api/runs/[runId]/abandon.ts`: Cloudflare route for abandonment.
- `functions/api/challenges/[challengeId]/leaderboard.ts`: Cloudflare route for leaderboard reads.
- `functions/api/runs/[runId]/path.ts`: Cloudflare route for path popouts.
- `src/services/vwikiRaceApiClient.ts`: browser API client.
- `src/services/playerRepository.ts`: local player id cache only.
- `src/components/GameHeader.tsx`: expanded, compact, and result header states.
- `src/components/PathStrip.tsx`: horizontal compressed path strip.
- `src/components/LeaderboardPanel.tsx`: speed-first leaderboard with path popout.
- `src/components/ChallengeBrowser.tsx`: challenge list and selection.
- `src/components/WikipediaArticle.tsx`: Wikipedia-native article frame.
- `supabase/migrations/0001_vwiki_race_v0_tracking.sql`: schema, indexes, and Challenge #1 seed.
- `.env.example`: required local/Cloudflare env names with non-secret example values.
- `README.md`: update deployment and database setup instructions.

---

### Task 1: Domain Rules For Challenges, Paths, And Leaderboards

**Files:**
- Create: `src/domain/challenges.ts`
- Create: `src/domain/pathCompression.ts`
- Create: `src/domain/serverLeaderboard.ts`
- Test: `src/domain/challenges.test.ts`
- Test: `src/domain/pathCompression.test.ts`
- Test: `src/domain/serverLeaderboard.test.ts`
- Modify: `src/domain/types.ts`

**Interfaces:**
- Produces: `SERVER_CHALLENGES: Challenge[]`
- Produces: `getSortedChallenges(challenges: Challenge[]): Challenge[]`
- Produces: `compressPathForStrip(pathTitles: string[], targetTitle: string, recentCount?: number): string[]`
- Produces: `rankLeaderboardRows(rows: ServerLeaderboardRow[]): RankedLeaderboardRow[]`
- Produces: `ServerLeaderboardRow`, `RankedLeaderboardRow`, and `ServerPathStep` types

- [ ] **Step 1: Write failing tests for challenge seed and sorting**

```ts
import { describe, expect, it } from "vitest";
import { SERVER_CHALLENGES, getSortedChallenges } from "./challenges";

describe("server challenge catalog", () => {
  it("seeds Challenge #1 as Moon to Gravity", () => {
    expect(SERVER_CHALLENGES[0]).toMatchObject({
      id: "challenge-0001",
      label: "Challenge #1",
      start: { title: "Moon" },
      target: { title: "Gravity" },
      ruleset: "ranked_classic",
      source: "curated",
    });
  });

  it("sorts active challenges by sortOrder", () => {
    const sorted = getSortedChallenges([
      { ...SERVER_CHALLENGES[0], id: "challenge-0003", sortOrder: 3 },
      { ...SERVER_CHALLENGES[0], id: "challenge-0002", sortOrder: 2 },
    ]);

    expect(sorted.map((challenge) => challenge.id)).toEqual([
      "challenge-0002",
      "challenge-0003",
    ]);
  });
});
```

- [ ] **Step 2: Run challenge tests and verify failure**

Run: `npm test -- src/domain/challenges.test.ts`

Expected: FAIL because `src/domain/challenges.ts` does not exist.

- [ ] **Step 3: Implement challenge catalog**

Add `sortOrder`, `label`, and `isActive` to `Challenge` in `src/domain/types.ts`, then create:

```ts
import type { Challenge } from "./types";

export const SERVER_CHALLENGES: Challenge[] = [
  {
    id: "challenge-0001",
    label: "Challenge #1",
    sortOrder: 1,
    isActive: true,
    mode: "daily",
    start: { title: "Moon" },
    target: { title: "Gravity" },
    ruleset: "ranked_classic",
    source: "curated",
  },
];

export function getSortedChallenges(challenges: Challenge[]): Challenge[] {
  return challenges
    .filter((challenge) => challenge.isActive !== false)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
```

- [ ] **Step 4: Write failing tests for path compression**

```ts
import { describe, expect, it } from "vitest";
import { compressPathForStrip } from "./pathCompression";

describe("path strip compression", () => {
  it("shows the full path when short", () => {
    expect(compressPathForStrip(["Moon", "Gravity"], "Gravity")).toEqual([
      "Moon",
      "Gravity",
    ]);
  });

  it("compresses long paths to ellipsis, latest previous 3 pages, and target", () => {
    expect(
      compressPathForStrip(
        ["Moon", "Astronomy", "Orbit", "Mass", "Force"],
        "Gravity",
      ),
    ).toEqual(["...", "Orbit", "Mass", "Force", "Gravity"]);
  });

  it("does not duplicate the target when it is already current", () => {
    expect(
      compressPathForStrip(
        ["Moon", "Astronomy", "Orbit", "Mass", "Gravity"],
        "Gravity",
      ),
    ).toEqual(["...", "Orbit", "Mass", "Gravity"]);
  });
});
```

- [ ] **Step 5: Run path tests and verify failure**

Run: `npm test -- src/domain/pathCompression.test.ts`

Expected: FAIL because `compressPathForStrip` does not exist.

- [ ] **Step 6: Implement path compression**

```ts
export function compressPathForStrip(
  pathTitles: string[],
  targetTitle: string,
  recentCount = 3,
): string[] {
  const cleanPath = pathTitles.filter(Boolean);
  const fullPath =
    cleanPath.at(-1) === targetTitle ? cleanPath : [...cleanPath, targetTitle];

  if (fullPath.length <= recentCount + 1) {
    return fullPath;
  }

  const recent = fullPath.slice(-1 * (recentCount + 1));
  return ["...", ...recent];
}
```

- [ ] **Step 7: Write failing tests for leaderboard ranking**

```ts
import { describe, expect, it } from "vitest";
import { rankLeaderboardRows } from "./serverLeaderboard";
import type { ServerLeaderboardRow } from "./types";

const row = (
  id: string,
  elapsedMs: number,
  clickCount: number,
  completedAt: string,
): ServerLeaderboardRow => ({
  runId: id,
  challengeId: "challenge-0001",
  playerId: `player-${id}`,
  displayName: id,
  elapsedMs,
  clickCount,
  completedAt,
  pathPreview: [],
});

describe("server leaderboard ranking", () => {
  it("sorts by speed, then clicks, then completed timestamp", () => {
    const ranked = rankLeaderboardRows([
      row("slow", 9000, 2, "2026-07-14T01:00:00Z"),
      row("fast-more-clicks", 5000, 9, "2026-07-14T01:00:00Z"),
      row("fast-fewer-clicks", 5000, 4, "2026-07-14T01:05:00Z"),
      row("fast-earlier", 5000, 4, "2026-07-14T00:59:00Z"),
    ]);

    expect(ranked.map((entry) => [entry.rank, entry.runId])).toEqual([
      [1, "fast-earlier"],
      [2, "fast-fewer-clicks"],
      [3, "fast-more-clicks"],
      [4, "slow"],
    ]);
  });
});
```

- [ ] **Step 8: Run leaderboard tests and verify failure**

Run: `npm test -- src/domain/serverLeaderboard.test.ts`

Expected: FAIL because `ServerLeaderboardRow` and `rankLeaderboardRows` do not exist.

- [ ] **Step 9: Implement leaderboard types and ranker**

Add to `src/domain/types.ts`:

```ts
export interface ServerPathStep {
  stepNumber: number;
  sourceTitle: string;
  clickedAnchorText: string;
  destinationTitle: string;
  destinationPageId?: number;
  elapsedSinceStartMs?: number;
  createdAt: string;
}

export interface ServerLeaderboardRow {
  runId: string;
  challengeId: string;
  playerId: string;
  displayName: string;
  elapsedMs: number;
  clickCount: number;
  completedAt: string;
  pathPreview: ServerPathStep[];
}

export interface RankedLeaderboardRow extends ServerLeaderboardRow {
  rank: number;
}
```

Create `src/domain/serverLeaderboard.ts`:

```ts
import type { RankedLeaderboardRow, ServerLeaderboardRow } from "./types";

export function rankLeaderboardRows(
  rows: ServerLeaderboardRow[],
): RankedLeaderboardRow[] {
  return rows
    .slice()
    .sort((a, b) => {
      if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
      if (a.clickCount !== b.clickCount) return a.clickCount - b.clickCount;
      return Date.parse(a.completedAt) - Date.parse(b.completedAt);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
```

- [ ] **Step 10: Run domain tests**

Run: `npm test -- src/domain/challenges.test.ts src/domain/pathCompression.test.ts src/domain/serverLeaderboard.test.ts`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/domain/types.ts src/domain/challenges.ts src/domain/challenges.test.ts src/domain/pathCompression.ts src/domain/pathCompression.test.ts src/domain/serverLeaderboard.ts src/domain/serverLeaderboard.test.ts
git commit -m "feat: add server-tracked domain rules"
```

---

### Task 2: Server API Contracts And Pure Handlers

**Files:**
- Create: `src/server/contracts.ts`
- Create: `src/server/http.ts`
- Create: `src/server/trackingRepository.ts`
- Create: `src/server/apiHandlers.ts`
- Test: `src/server/apiHandlers.test.ts`

**Interfaces:**
- Consumes: domain types from Task 1.
- Produces: `TrackingRepository`
- Produces: `createApiHandlers(repository: TrackingRepository, now?: () => Date): ApiHandlers`
- Produces handlers for `listChallenges`, `upsertPlayer`, `startRun`, `recordClick`, `completeRun`, `abandonRun`, `listLeaderboard`, `getRunPath`

- [ ] **Step 1: Write failing API handler tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createApiHandlers } from "./apiHandlers";
import type { TrackingRepository } from "./trackingRepository";

function fakeRepository(): TrackingRepository {
  return {
    listChallenges: vi.fn(async () => []),
    upsertPlayer: vi.fn(async ({ displayName }) => ({
      id: "player-1",
      displayName,
    })),
    startRun: vi.fn(async () => ({
      id: "run-1",
      challengeId: "challenge-0001",
      playerId: "player-1",
      status: "active",
      startTitle: "Moon",
      targetTitle: "Gravity",
      clickCount: 0,
      startedAt: "2026-07-14T00:00:00.000Z",
    })),
    recordClick: vi.fn(async () => ({ clickCount: 1 })),
    completeRun: vi.fn(async () => ({
      runId: "run-1",
      challengeId: "challenge-0001",
      playerId: "player-1",
      displayName: "Vijay",
      elapsedMs: 1200,
      clickCount: 1,
      completedAt: "2026-07-14T00:00:01.200Z",
      pathPreview: [],
      rank: 1,
    })),
    abandonRun: vi.fn(async () => ({ status: "abandoned" })),
    listLeaderboard: vi.fn(async () => []),
    getRunPath: vi.fn(async () => []),
  };
}

describe("api handlers", () => {
  it("requires a non-empty display name", async () => {
    const handlers = createApiHandlers(fakeRepository());
    await expect(
      handlers.upsertPlayer({ displayName: "   " }),
    ).rejects.toMatchObject({ code: "invalid_display_name" });
  });

  it("starts a run through the repository", async () => {
    const repository = fakeRepository();
    const handlers = createApiHandlers(repository);

    await expect(
      handlers.startRun({ challengeId: "challenge-0001", playerId: "player-1" }),
    ).resolves.toMatchObject({ run: { id: "run-1" } });
  });

  it("rejects completion without a final title", async () => {
    const handlers = createApiHandlers(fakeRepository());
    await expect(
      handlers.completeRun("run-1", { finalTitle: "" }),
    ).rejects.toMatchObject({ code: "invalid_final_title" });
  });
});
```

- [ ] **Step 2: Run handler tests and verify failure**

Run: `npm test -- src/server/apiHandlers.test.ts`

Expected: FAIL because server modules do not exist.

- [ ] **Step 3: Implement contracts and repository interface**

Create `src/server/contracts.ts` with request/response interfaces matching the spec. Create `src/server/trackingRepository.ts`:

```ts
import type {
  Challenge,
  RankedLeaderboardRow,
  ServerPathStep,
} from "../domain/types";

export interface PlayerRecord {
  id: string;
  displayName: string;
}

export interface RunRecordResponse {
  id: string;
  challengeId: string;
  playerId: string;
  status: "active" | "completed" | "abandoned";
  startTitle: string;
  targetTitle: string;
  clickCount: number;
  startedAt: string;
  completedAt?: string;
  elapsedMs?: number;
}

export interface TrackingRepository {
  listChallenges(): Promise<Challenge[]>;
  upsertPlayer(input: { displayName: string; playerId?: string }): Promise<PlayerRecord>;
  startRun(input: { challengeId: string; playerId: string }): Promise<RunRecordResponse>;
  recordClick(runId: string, input: {
    sourceTitle: string;
    clickedAnchorText: string;
    requestedTitle: string;
    destinationTitle: string;
    destinationPageId?: number;
    clientTimestampMs?: number;
  }): Promise<{ clickCount: number }>;
  completeRun(runId: string, input: {
    finalTitle: string;
    clientTimestampMs?: number;
  }): Promise<RankedLeaderboardRow>;
  abandonRun(runId: string): Promise<{ status: "abandoned" }>;
  listLeaderboard(challengeId: string): Promise<RankedLeaderboardRow[]>;
  getRunPath(runId: string): Promise<ServerPathStep[]>;
}
```

- [ ] **Step 4: Implement server errors and handlers**

Create `src/server/http.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function requiredString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(code, message);
  }
  return value.trim();
}
```

Create `src/server/apiHandlers.ts` using `requiredString` before calling the repository. Each handler returns an object shaped exactly like the API contract, e.g. `{ player }`, `{ run }`, `{ leaderboard }`, `{ path }`.

- [ ] **Step 5: Run handler tests**

Run: `npm test -- src/server/apiHandlers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server src/domain/types.ts
git commit -m "feat: add tracking api handlers"
```

---

### Task 3: Supabase Schema And Repository

**Files:**
- Create: `supabase/migrations/0001_vwiki_race_v0_tracking.sql`
- Create: `src/server/supabaseTrackingRepository.ts`
- Test: `src/server/supabaseTrackingRepository.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`

**Interfaces:**
- Consumes: `TrackingRepository`
- Produces: `createSupabaseTrackingRepository(options: { url: string; serviceRoleKey: string }): TrackingRepository`

- [ ] **Step 1: Install dependencies**

Run: `npm install @supabase/supabase-js && npm install -D @cloudflare/workers-types`

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 2: Write Supabase migration**

Create SQL with these tables: `players`, `challenges`, `runs`, `run_events`, `run_path_steps`. Include indexes on `runs(challenge_id, status, elapsed_ms, click_count, completed_at)`, `runs(player_id)`, `run_events(run_id, created_at)`, and `run_path_steps(run_id, step_number)`. Seed:

```sql
insert into challenges (id, label, start_title, target_title, ruleset, sort_order, is_active)
values ('challenge-0001', 'Challenge #1', 'Moon', 'Gravity', 'ranked_classic', 1, true)
on conflict (id) do update set
  label = excluded.label,
  start_title = excluded.start_title,
  target_title = excluded.target_title,
  ruleset = excluded.ruleset,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
```

- [ ] **Step 3: Write repository unit tests with a fake Supabase client**

Test that the repository maps database rows into `Challenge`, inserts a player with sanitized display name, and orders leaderboard rows by the same ranking contract. Use a fake object exposing `from(table).select()`, `insert()`, `update()`, `eq()`, `order()`, and `single()` methods; no network access is used.

- [ ] **Step 4: Run repository tests and verify failure**

Run: `npm test -- src/server/supabaseTrackingRepository.test.ts`

Expected: FAIL because repository is not implemented.

- [ ] **Step 5: Implement Supabase repository**

Implement `createSupabaseTrackingRepository` so it:

- uses `createClient(url, serviceRoleKey, { auth: { persistSession: false } })`;
- reads active challenges ordered by `sort_order`;
- inserts or updates players;
- starts runs from challenge snapshots;
- appends click events and path steps;
- completes runs using server timestamps;
- abandons active runs;
- reads leaderboards and maps them through `rankLeaderboardRows`;
- reads full path steps ordered by `step_number`;
- throws `ApiError` with stable codes for Supabase failures.

- [ ] **Step 6: Add environment template**

Create `.env.example`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-cloudflare-secret
```

- [ ] **Step 7: Run repository tests**

Run: `npm test -- src/server/supabaseTrackingRepository.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example supabase src/server/supabaseTrackingRepository.ts src/server/supabaseTrackingRepository.test.ts
git commit -m "feat: add supabase tracking repository"
```

---

### Task 4: Cloudflare Pages Function Routes

**Files:**
- Create: `functions/_shared/createTrackingContext.ts`
- Create: `functions/api/challenges.ts`
- Create: `functions/api/players.ts`
- Create: `functions/api/runs/start.ts`
- Create: `functions/api/runs/[runId]/click.ts`
- Create: `functions/api/runs/[runId]/complete.ts`
- Create: `functions/api/runs/[runId]/abandon.ts`
- Create: `functions/api/challenges/[challengeId]/leaderboard.ts`
- Create: `functions/api/runs/[runId]/path.ts`
- Test: `functions/api/routes.test.ts`

**Interfaces:**
- Consumes: `createApiHandlers`
- Consumes: `createSupabaseTrackingRepository`
- Produces: Cloudflare Pages Functions using env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 1: Write route tests**

Create tests that call route `onRequestGet`/`onRequestPost` functions with fake `env` and assert JSON status codes for success and validation errors.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm test -- functions/api/routes.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement shared function context**

`functions/_shared/createTrackingContext.ts` should read env vars, create the Supabase repository, create handlers, and convert thrown `ApiError` values into JSON responses:

```ts
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
```

- [ ] **Step 4: Implement route modules**

Each route should parse JSON only when needed, call exactly one handler, and return JSON. Example:

```ts
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { handlers, json } = createTrackingContext(context.env);
  return json(await handlers.upsertPlayer(await context.request.json()));
};
```

- [ ] **Step 5: Run route tests**

Run: `npm test -- functions/api/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions src/server
git commit -m "feat: add cloudflare tracking routes"
```

---

### Task 5: Browser API Client And Server-Tracked App Flow

**Files:**
- Create: `src/services/vwikiRaceApiClient.ts`
- Create: `src/services/playerRepository.ts`
- Test: `src/services/vwikiRaceApiClient.test.ts`
- Test: `src/services/playerRepository.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces: `VWikiRaceApiClient`
- Produces: `createVWikiRaceApiClient(fetchImpl: typeof fetch): VWikiRaceApiClient`
- Produces: `createPlayerRepository(storage: StorageLike)`

- [ ] **Step 1: Write API client tests**

Test that `createVWikiRaceApiClient` calls `/api/challenges`, `/api/players`, `/api/runs/start`, `/api/runs/:runId/click`, `/api/runs/:runId/complete`, `/api/challenges/:challengeId/leaderboard`, and parses error payloads into thrown `Error` messages.

- [ ] **Step 2: Run API client tests and verify failure**

Run: `npm test -- src/services/vwikiRaceApiClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement API client**

The client wraps `fetch` with JSON helpers and stable methods:

```ts
export interface VWikiRaceApiClient {
  listChallenges(): Promise<Challenge[]>;
  savePlayer(input: { displayName: string; playerId?: string }): Promise<PlayerRecord>;
  startRun(input: { challengeId: string; playerId: string }): Promise<RunRecordResponse>;
  recordClick(runId: string, input: ClickRequest): Promise<{ clickCount: number }>;
  completeRun(runId: string, input: CompleteRunRequest): Promise<RankedLeaderboardRow>;
  abandonRun(runId: string): Promise<void>;
  listLeaderboard(challengeId: string): Promise<RankedLeaderboardRow[]>;
  getRunPath(runId: string): Promise<ServerPathStep[]>;
}
```

- [ ] **Step 4: Write player repository tests**

Test storing and reading only `playerId` and `displayName` from localStorage. The repository must not store run history.

- [ ] **Step 5: Implement player repository**

Create a small storage wrapper with `getPlayer`, `savePlayer`, and `clearPlayer`.

- [ ] **Step 6: Rewrite app flow tests**

Replace the local daily/local identity test with server-backed expectations:

- entering display name is required before Start enables;
- clicking Start calls `/api/players` and `/api/runs/start` before article play state;
- clicking a Wikipedia link calls `/api/runs/:runId/click`;
- reaching target calls `/api/runs/:runId/complete`;
- leaderboard row is rendered from server response.

- [ ] **Step 7: Run app tests and verify failure**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL until `App.tsx` uses the API client.

- [ ] **Step 8: Update `App.tsx`**

Replace local identity, local daily leaderboard, and local run-history writes with API client calls. Keep the current Wikipedia gateway and game session domain. Keep local stats only as a view over server responses available in v0; do not write new official run history to localStorage.

- [ ] **Step 9: Run service and app tests**

Run: `npm test -- src/services/vwikiRaceApiClient.test.ts src/services/playerRepository.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/services src/App.tsx src/App.test.tsx
git commit -m "feat: track app runs through api"
```

---

### Task 6: Viota-Branded Responsive UI

**Files:**
- Create: `src/components/GameHeader.tsx`
- Create: `src/components/PathStrip.tsx`
- Create: `src/components/LeaderboardPanel.tsx`
- Create: `src/components/ChallengeBrowser.tsx`
- Create: `src/components/WikipediaArticle.tsx`
- Test: `src/components/GameHeader.test.tsx`
- Test: `src/components/PathStrip.test.tsx`
- Test: `src/components/LeaderboardPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `compressPathForStrip`
- Consumes: `RankedLeaderboardRow`
- Produces: componentized before-run, active-run, and finished-run layout states

- [ ] **Step 1: Write header and path component tests**

Test that `GameHeader` renders expanded before start, compact during active runs, and expanded result after completion. Test that mobile-only labels are present through accessible names and that `PathStrip` renders compressed long paths.

- [ ] **Step 2: Run component tests and verify failure**

Run: `npm test -- src/components/GameHeader.test.tsx src/components/PathStrip.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement `GameHeader` and `PathStrip`**

Implement props:

```ts
type HeaderState = "pre-run" | "active" | "finished";

interface GameHeaderProps {
  state: HeaderState;
  brandName: "vwiki-race";
  challengeLabel: string;
  startTitle: string;
  targetTitle: string;
  elapsedMs: number;
  clickCount: number;
  rank?: number;
  playerCount?: number;
  displayNameDraft: string;
  onDisplayNameChange(value: string): void;
  onStart(): void;
  onShowLeaderboard(): void;
}
```

`PathStrip` receives `pathTitles` and `targetTitle`, then uses `compressPathForStrip`.

- [ ] **Step 4: Write leaderboard panel test**

Test ranking display order, speed-before-clicks columns, and a path popout button that reveals the full path.

- [ ] **Step 5: Implement `LeaderboardPanel`**

Render rank, display name, formatted speed, click count, completed timestamp, and a small path popout.

- [ ] **Step 6: Implement `ChallengeBrowser` and `WikipediaArticle`**

`ChallengeBrowser` renders Challenge #1 and future challenges. `WikipediaArticle` wraps the existing sanitized HTML in a Wikipedia-native frame and keeps normal article link handling.

- [ ] **Step 7: Replace app layout and styles**

Move the single-file layout in `App.tsx` to the new components. Replace `src/styles.css` with Viota-branded chrome variables and Wikipedia-native article styles. Include mobile rules for the sticky compact run header.

- [ ] **Step 8: Run UI tests**

Run: `npm test -- src/components/GameHeader.test.tsx src/components/PathStrip.test.tsx src/components/LeaderboardPanel.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components src/App.tsx src/styles.css src/domain/pathCompression.ts
git commit -m "feat: add viota branded race ui"
```

---

### Task 7: Docs, Build, And Deployment Readiness

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`
- Test: full project commands

**Interfaces:**
- Produces: public setup docs for GitHub + Cloudflare Pages + Supabase

- [ ] **Step 1: Update README**

Document:

- Cloudflare Pages build command: `npm run build`;
- output directory: `dist`;
- required Cloudflare env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`;
- Supabase migration file: `supabase/migrations/0001_vwiki_race_v0_tracking.sql`;
- Challenge #1 seed;
- display-name-only v0 caveat;
- VGames deferred.

- [ ] **Step 2: Confirm gitignore**

Ensure `.superpowers/`, `node_modules/`, `dist/`, generated tsbuildinfo files, and local `.env` files are ignored.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run build
npm audit --audit-level=moderate
git status --short
```

Expected:

- all tests pass;
- build exits 0;
- audit reports 0 moderate-or-higher vulnerabilities;
- only intended files are modified before the final commit.

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: add v0 deployment setup"
```

- [ ] **Step 5: Push when approved**

Run only after Vijay approves pushing the completed implementation:

```bash
git push origin main
```
