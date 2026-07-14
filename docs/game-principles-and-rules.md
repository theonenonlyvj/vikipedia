# VWiki Race Game Principles and Rules

Status: initial research draft  
Date: 2026-07-13  
Intent: define the core game and ranked baseline before deeper brainstorming or
implementation.

## Research Basis

The core model comes from Wikiracing / The Wiki Game: players start on one
Wikipedia article and try to reach a target article only by clicking wikilinks.
The winner is usually the first finisher or the player who reaches the target in
the fewest clicks.

Sources reviewed:

- [Wikipedia: Wiki Game](https://en.wikipedia.org/wiki/Wikipedia:Wiki_Game)
- [Wikiracing](https://en.wikipedia.org/wiki/Wikiracing)
- [Wikispeedia / EPFL](https://dlab.epfl.ch/wikispeedia/play/)
- [West, Paranjape, and Leskovec, "Mining Missing Hyperlinks from Human Navigation Traces"](https://arxiv.org/abs/1503.04208)
- [Wikipedia Speedruns](https://wikispeedruns.com/)
- [Wikipedia Speedruns source repo](https://github.com/wikispeedruns/wikipedia-speedruns)
- [Wikimedia Foundation API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines)
- [MediaWiki API Etiquette](https://www.mediawiki.org/wiki/API:Etiquette)
- [Wikimedia Foundation Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)

## First-Order Principles

### 1. The Wiki Graph Is The Board

Every article is a node. Every allowed internal article link is a directed edge.
The game is not about typing, searching, guessing URLs, or asking another
system. It is about navigating the visible graph from the current node.

### 2. A Click Is A Move

A player's path is a sequence of clicked links. Each valid move must be
recoverable from the page the player was actually viewing at that moment. If a
move cannot be reconstructed from the allowed link set, it is not a valid move.

### 3. Shared Starts Make Fair Races

Competitive players need the same start article, target article, language,
snapshot policy, rule mode, and timing/counting rules. Randomness is acceptable
only when it is recorded and reproducible.

### 4. The Target Must Be Objective

A win occurs when the player reaches the canonical target article. The app
should decide this mechanically by canonical page identity, not by visual title
matching alone.

### 5. Constraints Create The Game

The fun comes from meaningful restrictions. Search, browser history, outside
tools, AI hints, uncontrolled Wikipedia UI, or broad portal links can collapse
the puzzle. Any relaxation of constraints must be explicit and mode-specific.

### 6. Difficulty Comes From Semantic Distance And Hub Access

Good prompts balance discoverability and surprise. Overpowered hub pages,
year/date pages, country pages, list pages, categories, and navigation templates
can make many prompts trivial. Banning or penalizing these should be part of
specific ranked modes.

### 7. The Path Is The Proof

Every competitive run needs a complete path log: start, each clicked source,
anchor text, destination, redirects, timestamps, and final result. Replays and
post-game analysis should be first-class features, not afterthoughts.

### 8. Live Content Must Not Decide Competitive Fairness

Wikipedia changes constantly. Competitive puzzles should use a fixed page
snapshot or cached prompt snapshot wherever possible. If live pages are used,
the app must record enough page identity/version data to explain the run later.

### 9. Modes Must Not Share Leaderboards

Fewest-click play, fastest-time play, first-link Philosophy play, hub-banned
play, and hint-assisted play are different games. They can share infrastructure,
but their results should not be ranked together.

### 10. Wikipedia Is The Source, Not The Product's Property

The app must respect Wikimedia licensing, attribution, trademarks, API usage
guidelines, rate limits, and infrastructure. VWiki Race should add a game layer
and community layer without pretending to own or replace Wikipedia content.

## Absolute Rules For Ranked Classic

These are the recommended non-negotiable rules for the first serious ranked
mode. Other modes can modify them, but only under a separate mode name and
separate leaderboard.

### Article Eligibility

1. Start and target must be article pages in the same wiki language edition.
2. Start and target must use canonical article identity, preferably page ID plus
   normalized title.
3. Start cannot equal target.
4. Start and target must be reachable under the mode's allowed link rules.
5. Ranked Classic should exclude target/start pages that are primarily:
   disambiguation pages, year/date pages, category pages, portal pages, file
   pages, special pages, talk/user pages, and pure index/list pages.
6. A generated prompt must record the source of selection: curator, community
   submission, algorithm, random seed, and snapshot/date.

### Allowed Move

1. The only valid move is clicking an app-rendered internal link from the
   current article to another eligible article page.
2. Direct URL entry, Wikipedia search, browser search, Random Article, external
   search engines, autocomplete, AI assistants, copied links, and manual page
   title entry are forbidden.
3. The app, not the raw browser, defines the clickable surface.
4. Clicking a same-page section anchor is not a move and must not count.
5. Clicking a link that resolves through a redirect counts as one move. The
   resolved canonical page is the destination.
6. Disambiguation pages are valid only if reached through a valid click, but
   should not be generated as starts or targets in Ranked Classic.
7. Revisiting an article is allowed, but every valid transition still counts.
8. The Back button is forbidden in Ranked Classic. A mode that allows backtracking
   must count it explicitly or be marked unranked.

### Allowed Link Surface

Ranked Classic should allow links that represent article content and disallow
links that represent site navigation, metadata, or bulk shortcut systems.

Allowed:

1. Lead-section article links.
2. Main prose article links.
3. Infobox links.
4. Article table/list links when the table or list is part of the article's
   substantive content.
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

### Win Condition

1. A run is complete only when the current canonical page matches the canonical
   target page.
2. Redirects to the target are valid wins and count as the click that triggered
   the redirect.
3. If the target appears as a link on the current page, the player has not won
   until they click it and load the target.
4. The app should detect wins automatically and stop the player's timer/count
   immediately.

### Scoring

1. Primary score: fewest valid clicks.
2. Tiebreaker: elapsed time from round start to target load.
3. If both click count and time are equal within system precision, the result is
   a tie.
4. Invalid moves void the run for ranked play.
5. Hints, escapes, backtracking, or rule exceptions must move the run to a
   separate leaderboard.

### Timing

1. The timer starts when the article content is available to the player and the
   round becomes interactive.
2. The timer stops when the target article is resolved and accepted by the app.
3. Loading delays should be measured consistently. If practical, separate
   "wall-clock time" from "active decision time" in logs, but rank by the
   published mode metric.
4. Network failures, app reloads, or desyncs should mark a run incomplete unless
   the app can reconstruct the full valid path.

### Fair Play

1. No external tools, second screens, direct Wikipedia browsing, prior
   page-specific lookup during a live round, AI helpers, browser find, page
   source inspection, DOM scripting, or developer console manipulation.
2. No editing Wikipedia to add or change links for a prompt. Competitive prompts
   should use snapshots or cached pages to prevent this from mattering.
3. Session state should be isolated: no useful browser history, no search
   history, no visited-link styling advantage, and no cross-round page cache that
   reveals unseen links.
4. The app must log all clicked links and page transitions for review.
5. A run can be disqualified if the path contains a transition not available in
   the allowed link set for that article version.

### Dead Ends

1. A page with no valid outgoing links under the mode rules is a dead end.
2. In Ranked Classic, a dead end does not grant a free escape.
3. The player may concede, timeout, or continue only if there is a valid move.
4. Escape mechanics belong in separate modes, such as "One Escape" or
   "Explorer."

## Variant Catalog

These are known or natural variants worth preserving as explicit modes later.

| Mode | Primary Goal | Key Rule Difference |
| --- | --- | --- |
| Speed Race | Fastest finish | Time is primary; clicks are secondary or ignored. |
| Click Race / WikiGolf | Fewest clicks | Same as Ranked Classic; time breaks ties. |
| Daily Challenge | Shared puzzle of the day | One or more attempts against a daily global board. |
| Wikispeedia | Short path on fixed snapshot/subset | Uses a static article set; supports reproducible research-style play. |
| Philosophy Mode | Reach Philosophy | Often restricts each page to its first valid internal link. |
| Five Clicks To Jesus | Reach Jesus in five or fewer clicks | Golf/par framing around a fixed target. |
| WikiHitler | Reach Adolf Hitler | Fixed-target historical variant; should be treated carefully in product tone. |
| No United States / No Hubs | Avoid specific hub pages | Bans one or more high-connectivity shortcuts. |
| Grand Tour | Visit ordered targets | Requires a sequence of targets before final completion. |
| One Escape | Recover from a dead end once | Allows one category/back-to-start/escape move; separate leaderboard. |
| Team / Co-op | Shared pathfinding | Players coordinate, but the logged path remains the scoring unit. |

## Product Rules Implied By The Game

1. The app needs a controlled article renderer, not an unrestricted Wikipedia
   tab.
2. The app needs deterministic link extraction per article version.
3. Prompt generation needs validation for reachability and likely difficulty.
4. Multiplayer needs synchronized start conditions and server-authoritative run
   logs.
5. Replays and path comparison should be part of the core data model.
6. Wikimedia API calls must use a meaningful User-Agent or Api-User-Agent,
   honor throttling/rate-limit responses, cache where appropriate, and follow
   content license attribution requirements.
7. If any Wikipedia text is displayed or cached, the UI must provide source
   attribution and license notice appropriate to the reused content.

## Open Questions For Later Brainstorming

1. Should Ranked Classic be "content links only" as written here, or should it
   have an even stricter "body prose only" variant from launch?
2. Should daily challenges allow one official attempt or unlimited attempts with
   best score?
3. Should the first app use live Wikipedia with cached prompt snapshots, a full
   static snapshot, or an offline reduced graph?
4. Should hints ever exist in competitive play, or only in learning mode?
5. Should the product tone lean more toward party game, speedrunning community,
   educational puzzle, or serious graph-navigation sport?

