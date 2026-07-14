# VWiki Race Backlog

## Challenge Links

- Add route/deep-link support for specific challenges, for example
  `/?challenge=challenge-0002`.
- When a challenge is selected, keep the URL in sync without resetting an
  active run.
- Add a Copy Link action on challenge detail/list rows.
- On load, resolve the URL challenge first; fall back to `challenge-0001` only
  when the requested challenge is missing or inactive.
- Update production smoke tests to verify that Challenge #2 opens as Challenge
  #2, not Challenge #1.

## Challenge Creation Validation

- Let users paste full Wikipedia article URLs as well as article titles.
- Server-side, canonicalize start and target through the Wikipedia API before
  inserting a challenge.
- Store canonical title and `pageId` for both start and target nodes.
- Reject missing pages, redirects that do not resolve, non-main-namespace pages,
  and `start.pageId === target.pageId`.
- Reject disambiguation pages for ranked challenges unless a future casual mode
  explicitly allows them.
- Optionally require the start page to expose at least one allowed outgoing
  article link.

## Ranked Matching

- Match the target by Wikipedia `pageId` when available; title matching remains
  a fallback for legacy rows.
- Add migration support if existing challenge rows need page IDs backfilled.
- Keep leaderboard sorting as fastest elapsed time, then fewest clicks, then
  earliest completion.
