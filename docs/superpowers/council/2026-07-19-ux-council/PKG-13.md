# PKG-13 [P0/M] Daily pipeline resilience: the daily must never silently fail to drop

## Context (real incident, 2026-07-18)
The 5:00 AM Central drop failed ALL 6 attempts with `daily_candidate_unavailable`; no daily existed for the whole Central day until it was hand-dropped at ~10:45 PM (challenge-0008, Chess -> Voynich manuscript — already in prod, do not re-drop). Evidence: the scheduled() attempt at 2026-07-19T04:17:52Z logged claimed -> queue_miss -> failed in 443ms TOTAL (queue check 285ms, evaluator ~158ms), exception `DailyChallengeCandidateError: Wikipedia did not provide a usable daily challenge candidate` thrown from the `unavailable()` path in findCandidate. No `random_*` diagnostic events fired — the evaluator died at the editorial-pool stage (`targetPools.list('hard')` produced nothing usable) before ever fetching random starts. The same pipeline succeeded Thursday 2026-07-17T10:00:07Z (weird flavor, attempt 1, ~2s). 07-18 was the FIRST 'hard'-flavor day in prod (Saturday), so suspect ANY of: (a) all 4 editorial source-page fetches failing fast (e.g. Wikipedia 403ing Cloudflare Workers egress / UA policy), (b) a parse regression returning zero entries, (c) something hard-flavor-specific. 158ms for 4 parallel page fetches strongly suggests fast HTTP failures, but DO NOT trust this guess — instrument first.

## Files
- src/server/editorialTargetPools.ts
- src/server/dailyCandidateEvaluator.ts
- src/server/worker.ts (scheduled handler / logDailyJob)
- tests: src/server/editorialTargetPools.test.ts, dailyCandidateEvaluator tests, worker tests

## Changes
1. DIAGNOSE FOR REAL: write a tiny local Node script (scratchpad, not committed) that performs the exact fetches editorialTargetPools.load() does (same URLs, same USER_AGENT header value from the source) and prints status codes + entry counts through the real parsers. This tells you whether the source pages parse today. Report what you find in your final message.
2. INSTRUMENT: on editorial-pool failure, log a structured diagnostic per source URL (status code / fetch-error / parsed-entry-count) via the existing onDiagnostic/logDailyJob channel, so the NEXT failure names its cause in one tail line. `EditorialTargetPoolError` currently erases all detail — carry a cause/detail field through.
3. USER-AGENT POLICY: Wikimedia robot policy requires a descriptive UA with contact info; verify the current USER_AGENT constant complies (descriptive product string + contact URL/email) and fix if not. Also send `Api-User-Agent` on ALL Wikimedia requests (already done in the two files — verify pageviews too).
4. RESILIENCE LADDER in findCandidate/editorial pools, in order: (i) fresh pool fetch; (ii) stale cache within STALE_TTL (exists); (iii) NEW - a built-in curated static fallback target list compiled into the worker: ~40 vetted, stable, link-rich article titles per flavor bucket (recognizable / weird; hard = union) chosen for good gameplay (famous-but-multi-hop). Static list entries omit pageId (the evaluator already loads targets by title). The evaluator proceeds with the same scoring pipeline over the fallback list. `daily_candidate_unavailable` should only remain possible if random-start fetches ALSO fail (true Wikipedia outage).
5. BACKOFF CAP: the job backoff reached 6h (next_attempt_at jumped past the next day's drop). Cap retry backoff at 60 minutes so the hourly :17 retry always remains live for the current day. Keep attempt_count growth for observability.
6. TESTS: unit tests for the fallback ladder (pool fetch fails -> static list used; both fail -> unavailable), the backoff cap, and the new diagnostics. Follow existing test patterns in editorialTargetPools.test.ts.

## Acceptance criteria
- Local diagnostic script output pasted in the final message (status codes + parse counts for the 4 source URLs, with the worker UA)
- A simulated total editorial-pool failure still produces a valid daily candidate via the static fallback list (unit test)
- Job backoff can never schedule next_attempt_at more than 60 minutes out (unit test)
- A pool failure logs per-URL status/entry-count diagnostics (unit test on the diagnostic hook)
- All existing worker tests still green

## Risk
The static fallback list changes what a worst-case daily looks like — curate it for QUALITY (no stubs, no hyper-obscure, no disambiguation pages); mixing flavors wrongly would break the weekday flavor contract. Keep the list in its own module with a comment on curation criteria.

## OWNER-PROXY RULING (binding)
Diagnose before fixing (change 1 gates the rest); if the local diagnosis reveals the true cause is something this brief guessed wrong (e.g. a parser regression, not egress), adapt changes 2-4 to the real cause and say so plainly in the final message. The resilience ladder and backoff cap ship regardless of root cause.
