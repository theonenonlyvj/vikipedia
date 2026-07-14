# Run History Stats And V0 Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track every run in a master local run-history list from day zero, derive personal cognitive stats from that list, show them in the app, and publish a shareable v0 build.

**Architecture:** Add a VGames-shaped `RunRecord` master list in local storage. Derive stats from records through a pure `stats` domain module, and render a compact personal stats panel in the existing app. Keep all storage local for v0 while preserving a data shape that can later move to VGames/community storage.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, browser localStorage, static deployment.

## Global Constraints

- Do not implement standalone auth, password login, multiplayer, or a custom backend in VWiki Race v0.
- Every completed run should write a full `RunRecord` to a master list.
- Stats must be derived from `RunRecord[]`, not manually maintained counters.
- Local v0 stats are personal to the current browser/account.
- Keep future VGames promotion straightforward by using `accountId`, `challengeId`, `mode`, page titles/ids, path, timestamps, and result fields.
- Run tests, build, audit, and server/deploy checks before reporting completion.

---

## Task 1: Run History And Stats Domain

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/stats.ts`
- Create: `src/services/runHistoryRepository.ts`
- Test: `src/domain/stats.test.ts`
- Test: `src/services/runHistoryRepository.test.ts`

**Interfaces:**
- Produces `RunRecord`, `StatsSummary`, `createStatsSummary(records, accountId)`, and `createLocalRunHistoryRepository(storage)`.

- [ ] Write failing tests for top starts, targets, visited pages, bridge pages, transitions, totals, and local master-list persistence.
- [ ] Run `npm test -- src/domain/stats.test.ts src/services/runHistoryRepository.test.ts` and verify failure.
- [ ] Implement types, stats derivation, and local repository.
- [ ] Run the same tests and verify pass.

## Task 2: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes run history repository and stats summary.
- Produces a visible personal Stats panel after run completion and on app load.

- [ ] Extend the UI smoke test to assert stats update after a completed daily run.
- [ ] Run `npm test -- src/App.test.tsx` and verify failure.
- [ ] Save completed and abandoned runs to the master list; render top starts, targets, visited pages, bridge pages, common jumps, and totals.
- [ ] Run `npm test -- src/App.test.tsx` and verify pass.

## Task 3: Verification And Share

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces a verified local build and, if available, a shareable public static deployment.

- [ ] Update README to mention master run history and local personal stats.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --audit-level=moderate`.
- [ ] Verify local server/deployment health.
- [ ] Deploy through the available static-site mechanism if configured, otherwise report the blocking setup needed.

