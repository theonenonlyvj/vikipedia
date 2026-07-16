# Plan: Error logging & rollout observability (2026-07-16)

**Goal:** When friends hit errors during the rollout, we can actually see them. Today the client records nothing anywhere, and the Worker discards exception details. This plan adds persisted server logs, exception detail, a client error beacon, and a crash screen — with zero new dependencies and zero D1 schema changes.

**Branch:** `claude/error-logging` off `b499f48` (the currently-deployed commit). A separate agent (Codex) is working on `main` — this branch must merge cleanly later, so scope is strictly limited to the files below.

## Global Constraints

- **Do NOT touch `src/App.tsx`** (another agent has in-flight changes there). Client wiring happens in `src/main.tsx` and new files only.
- No new npm dependencies. No D1 schema changes. No new infrastructure.
- Follow existing code conventions: typed runtime validation of payloads, ApiError shapes, the existing CORS and rate-limit patterns in `src/server/worker.ts` / `wrangler.api.toml`.
- Error reporting must NEVER break the app: every beacon path is fire-and-forget, wrapped so it cannot throw, and must not recurse (an error inside the reporter is swallowed, never reported).
- Privacy: log payloads carry only error name/message/stack, URL path, userAgent, timestamp, and (server-side) requestId. Never tokens, credentials, or request bodies.
- TDD: failing test first, then implementation. Both suites (`npm test`, `npm run test:worker`) must be green at each task's end.

## Task 1 — Worker: persisted logs, exception detail, client-error intake

Files: `wrangler.api.toml`, `src/server/worker.ts` (+ its existing test homes: follow where `error()`/route dispatch are currently tested, e.g. a new `src/server/clientErrorRoute.test.ts` and/or additions to existing server tests).

1. `wrangler.api.toml`: add
   ```toml
   [observability]
   enabled = true
   head_sampling_rate = 1
   ```
   and a new rate-limit binding following the existing `[[ratelimits]]` entries' exact shape (unique `namespace_id`): `CLIENT_ERROR_RATE_LIMITER`, limit 20 per 60s.
2. `src/server/worker.ts` `error()` path: before building the generic 500 response, emit ONE structured line: `console.error(JSON.stringify({ type: "unhandled_error", requestId, name, message, stack }))` (stack truncated to 4096 chars; tolerate non-Error throwables). Do not change the response the client sees.
3. New route `POST /api/client-error` in the v2 dispatch:
   - Unauthenticated (errors often happen before login — that is the point). Same CORS treatment as other v2 routes.
   - Rate-limited via `CLIENT_ERROR_RATE_LIMITER` (fail closed with 429 + Retry-After like existing limiter usage). If the binding is absent (older env), skip limiting rather than crash.
   - Body: JSON, hard cap 8 KiB (413 beyond). Validate shape `{ source, name, message, stack?, url?, userAgent?, ts? }` — strings only, `source` one of `window|unhandledrejection|error-boundary|manual`; truncate message to 512, stack to 4096, url/userAgent to 512. Invalid → 400 ApiError shape.
   - Action: `console.error(JSON.stringify({ type: "client_error", requestId, ...validated }))`. Return **204**. No storage.
4. Tests: route accepts a valid payload (204), rejects oversized body (413), rejects bad shape (400), truncates long fields, rate-limit path returns 429, and `error()` logs name/message/stack for a thrown exception while still returning the generic 500.

## Task 2 — Client: beacon module, global handlers, crash screen

Files: `src/services/errorReporting.ts` (new), `src/components/ErrorBoundary.tsx` (new; if the repo has no components/ dir, place beside App.tsx per convention), `src/main.tsx` (wiring only), plus matching test files.

1. `errorReporting.ts`: `createErrorReporter({ apiOrigin, fetchImpl })` returning `{ report(source, error, context?) , installGlobalHandlers(target) }`.
   - `report`: builds the payload (name/message/stack from Error or best-effort from unknown throwable; url = `location.pathname+search`; userAgent; ts). POSTs to `${apiOrigin}/api/client-error` with `keepalive: true`, no auth header. Entirely fire-and-forget: `.catch(() => {})`, never throws, never awaited by callers.
   - Session guards: dedupe on `source+name+message` (report each unique error once), hard cap 10 reports per page load.
   - `installGlobalHandlers`: `window.addEventListener("error", …)` and `("unhandledrejection", …)` → `report`. Idempotent (installing twice attaches once).
- 2. `ErrorBoundary.tsx`: class component (React 19), catches render/lifecycle errors → reports via the injected reporter (`source: "error-boundary"`) → renders a minimal friendly fallback matching the app's styling: "Something broke on our side." + a Reload button (`location.reload()`). Must not depend on App state.
3. `src/main.tsx`: create the reporter with the same resolved API origin the app already uses (`resolveApiOrigin`/`services/apiOrigin.ts` pattern), install global handlers, wrap `<App />` in the boundary. Nothing else changes.
4. Tests: reporter payload shape + dedupe + cap + never-throws (fetch rejection swallowed); handlers install once and forward window error/unhandledrejection; boundary renders fallback + fires report when a child throws (jsdom).

## Out of scope (explicitly)

- `vgames-identity` observability (config-only change in the viota repo — handled outside this plan).
- D1 storage of errors, dashboards, alerting, `src/App.tsx` catch-site beacons (post-merge follow-up once the other agent's work lands).
