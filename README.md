# Vikipedia

Vikipedia is an early-stage app concept for a Wikipedia navigation game:
players race from one article to another by following valid internal links.

V1 is a playable solo + daily challenge web app. It uses a local mock of the
future VGames identity contract, renders live English Wikipedia content through
a controlled article view, tracks click paths, and stores daily leaderboard rows
locally. It also records every run into a local master run-history list so
personal cognitive stats exist from day zero.

## Current Docs

- [Game Principles and Rules](docs/game-principles-and-rules.md)
- [V1 Design Spec](docs/superpowers/specs/2026-07-13-vikipedia-v1-design.md)
- [V1 Implementation Plan](docs/superpowers/plans/2026-07-13-vikipedia-v1.md)

## Local Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run the app:

```bash
npm run dev -- --host 127.0.0.1
```

Build:

```bash
npm run build
```

## Deployment

The app is a standard Vite static site. For Cloudflare Pages, connect the GitHub
repo and use:

- Build command: `npm run build`
- Build output directory: `dist`

## VGames Identity

Vikipedia v1 does not implement standalone accounts. It uses a local
VGames-shaped mock identity with ghost accounts and display names so the game
can later swap to the real VGames platform boundary.

## Personal Stats

Every completed run is written to a master `RunRecord` list in browser
`localStorage`. The Stats panel derives top starts, top targets, most visited
pages, bridge pages, common jumps, and run totals from that master list. This is
personal/local in v0 and shaped for future VGames community storage.
