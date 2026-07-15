# Target Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a short, read-only Wikipedia target blurb and representative image before a challenge starts without affecting race timing or navigation.

**Architecture:** Add a pure sanitized-article preview extractor and an abortable React hook backed by a dedicated Wikipedia gateway. Reset completed controller state when a different catalog challenge is selected so the pre-start preview replaces the old result/path. Keep deployment in the existing Worker-first Cloudflare rollout.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, MediaWiki parse API, Cloudflare Worker/D1/Pages.

## Global Constraints

- Preview only the currently selected target while the race controller is idle.
- Render one bounded lead blurb with no embedded media or internal preview links.
- Preview failures never block Start Challenge.
- Abort stale loads and isolate preview caching from gameplay caching.
- Preserve Wikipedia revision and CC BY-SA attribution.
- Follow TDD and run the complete release gate before publication.

---

### Task 1: Extract A Safe Short Preview

**Files:**
- Create: `src/domain/articlePreview.ts`
- Create: `src/domain/articlePreview.test.ts`

**Interfaces:**
- Consumes: `Article.sanitizedHtml` from `src/domain/types.ts`.
- Produces: `extractArticlePreview(article: Article): ArticlePreview`, where `ArticlePreview` contains `blurb`, `imageUrl`, and `imageAlt`.

- [ ] **Step 1: Write failing extraction tests**

Cover first meaningful paragraph selection, whitespace normalization, bounded text, representative sanitized image selection, no link markup in output, and empty fallback.

- [ ] **Step 2: Verify red**

Run: `npm test -- src/domain/articlePreview.test.ts`

Expected: FAIL because `extractArticlePreview` does not exist.

- [ ] **Step 3: Implement the minimal extractor**

Parse only already-sanitized HTML with `DOMParser`, return plain text for the blurb, copy only the first sanitized Wikimedia image URL/alt, and bound the blurb at a word boundary.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/domain/articlePreview.test.ts`

Expected: all extractor tests pass.

### Task 2: Load Only The Selected Target

**Files:**
- Create: `src/hooks/useTargetPreview.ts`
- Create: `src/hooks/useTargetPreview.test.tsx`

**Interfaces:**
- Consumes: selected `Challenge | null`, `enabled: boolean`, and a dedicated `WikipediaGateway`.
- Produces: keyed states `idle`, `loading`, `ready`, or `unavailable` with `challengeId`, canonical title, attribution URLs, and `ArticlePreview`.

- [ ] **Step 1: Write failing hook tests**

Cover target fetch, stored target page-ID validation, stale selection cancellation, abort cleanup, quiet unavailable state, and disabled-state clearing.

- [ ] **Step 2: Verify red**

Run: `npm test -- src/hooks/useTargetPreview.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the abortable hook**

Use one `AbortController` per selected challenge, ignore aborted generations, validate canonical page identity, call `extractArticlePreview`, and clear the dedicated gateway on unmount.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/hooks/useTargetPreview.test.tsx`

Expected: all hook tests pass.

### Task 3: Reset Completed Results On Challenge Selection

**Files:**
- Modify: `src/hooks/useRaceController.ts`
- Modify: `src/hooks/useRaceController.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces: `resetCompleted(): boolean` on the race controller.
- App calls it before selecting, URL-restoring, or newly creating a challenge while completed.

- [ ] **Step 1: Write failing controller and App tests**

Assert that reset is ignored during active play, clears completed session/article/path, and causes a newly selected challenge to render the idle pre-start surface instead of the prior result.

- [ ] **Step 2: Verify red**

Run: `npm test -- src/hooks/useRaceController.test.tsx src/App.test.tsx -t "reset|new target preview"`

Expected: FAIL because completed reset is absent.

- [ ] **Step 3: Implement the reset boundary**

Invalidate controller work, clear the gameplay gateway, reset elapsed time, commit `initialState`, and invoke it only from unlocked completed selection flows.

- [ ] **Step 4: Verify green**

Run the same focused command and confirm the new tests pass.

### Task 4: Render The Preview Surface

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- App creates a second memoized `WikipediaGateway` for preview work and passes `useTargetPreview` output to `PlayPanel`.
- `TargetPreviewPanel` renders title, optional image, plain-text blurb, source revision, and CC BY-SA link.

- [ ] **Step 1: Write failing UI tests**

Assert loading, ready, media removal, attribution, unavailable, selected-target keying, no preview during play, and no internal article links.

- [ ] **Step 2: Verify red**

Run: `npm test -- src/App.test.tsx -t "target preview"`

Expected: FAIL because the panel is absent.

- [ ] **Step 3: Implement the responsive panel**

Replace the idle placeholder with an unframed target-preview surface inside the existing home layout. Use restrained type and the existing Viota palette; stack above the catalog under `640px`.

- [ ] **Step 4: Verify green**

Run the focused App tests and confirm all pass.

### Task 5: Release Gate And Publication

**Files:**
- Modify: `README.md`
- Modify: `docs/handoff/cloudflare-deployment-handoff.md`

**Interfaces:**
- No new runtime configuration.
- Existing `wrangler.api.toml` remains canonical.

- [ ] **Step 1: Run complete verification**

Run `npm test`, `npm run test:worker`, `npm run build`, `npm audit --omit=dev`, `git diff --check`, and a Wrangler Worker dry run. Browser-test desktop and 390px preview/start transitions.

- [ ] **Step 2: Commit and push reviewed code**

Commit the release on `codex/council-hardening`, push that branch, fast-forward local `main`, and push `main`.

- [ ] **Step 3: Deploy in fixed order**

Apply remote migration `0004`, deploy `vwikirace-api`, verify its v2 catalog, then deploy or verify the `vwikirace` Pages production build from `main`.

- [ ] **Step 4: Smoke-test production**

Verify `https://vwikirace.pages.dev/?challenge=challenge-0002`, target preview, direct challenge selection, Worker catalog, identity prompt, and cron configuration without generating repeated scheduled requests.
