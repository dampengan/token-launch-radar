# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dampengan/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dampengan/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads the sealed snapshot of every protocol DefiLlama tracks, finds the ones that still record no token and are not a wrapped, staked or bridged product of one that trades, and ranks them by what their launch would be worth — then hands you a web dashboard with the board, a detail view for every protocol, and the steps to farm it.

Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Run it

```sh
node main.ts --input <kit>/input/snapshot.json --output out
```

Requirements: Node.js 22.18 or later, nothing else. No dependencies, no network, no build step — Node runs `main.ts` directly. A browser is only needed to open the dashboard and take its three screenshots (see `screenshots/README.md`).

```sh
node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json --output out
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts   # grader mode
npm run verify                              # runs main.ts twice, checks determinism + board rules
```

## What it produces

Running `main.ts` writes into the output directory:

- `board.json` — `{"rows": [...]}` with 178 rows from the sealed snapshot: the whole 40-protocol watchlist plus 138 early finds below the $50M floor. Every row carries a score, a score breakdown, an implied launch value with its derivation, and a six-step farm plan.
- `data.js` — the dashboard's whole dataset as `window.RADAR`, written beside `dashboard/`.
- `dashboard/` — a static page (index.html + app.css + app.js, no network): open `dashboard/index.html` with `data.js` beside it.
  - `#/board` — the ranked board, with search, category / chain / min-score filters and sorting.
  - `#/protocol/<slug>` — a detail view for every protocol: score breakdown, implied-value derivation, and the farm plan.
  - `#/board?category=Lending&minScore=60` — a filtered view, shareable by URL.
- `dossier.json` — byte-for-byte what `buildDossier` from `vendor/makefun-board.ts` writes from `dashboard/` and `screenshots/`, the summary the judge reads.
- `screenshots/` — the three required dashboard screenshots (see its README).

A copy of the generated `board.json`, `data.js`, `dossier.json` and `dashboard/` (from the sealed snapshot) is committed at the repository root so the dashboard can be reviewed without running anything.

## How the radar scores

**Eligibility.** A protocol joins the board only when it records no token (market cap, CoinGecko id and symbol all null in the snapshot) and is not a wrapped, staked or bridged product: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped / staked / staking, does not start with an exchange's name, and does not end in a version marker. The watchlist is the floor, never the ceiling: the board also ranks every other protocol the same rule keeps below the floor. On this snapshot the strict rule keeps 138 below the floor, so 200 rows would mean ranking bridge and liquid-staking products the rule leaves out — this radar does not.

**Implied launch value (model `launch-value-1`).** The category multiple is the median market-cap-to-TVL ratio of that category's tokened protocols, read from the snapshot itself and clamped to [0.4, 3.5] — not a hand-picked number. Then: implied = TVL × multiple × growth × tenure, where growth = 1 + clamp(7-day change, −50%, +100%) × 0.6 and tenure = 0.75 + min(age, 1460 days) / 1460 × 0.5 (age unknown: 365 days). Rank follows the implied value, never the score. This is a ranking estimate, not a price target.

**Score (0–100).** Size 30 + momentum 25 + breadth 10 + tenure 20 + headroom 15, all from the snapshot's own figures (TVL, 7-day change, chain count, time tracked). Risk is reported separately and never added to the score.

**Farm plan.** Every row gets six concrete steps — set up a dedicated wallet, take the core position for its category, add depth on a second chain or pool, return weekly for the qualifying window, check the protocol's own points page, claim only from official channels — generated from that protocol's category, chains, TVL and age, each step carrying its cost and time.

**Determinism.** No wall-clock time, randomness, network or unordered iteration. Two runs on the same snapshot produce byte-identical `board.json`, `data.js` and `dossier.json` (`npm run verify` checks this).

## Input data

`main.ts` reads the sealed snapshot from `MAKEFUN_INPUT_DIR` (or `--input`), the competition's `input/snapshot.json`: 758 protocols at or above $5M TVL as of 2026-11-14, 40 on the watchlist, floor $50,000,000. There is no bundled sample any more — the old dev sample was removed, because a board built from invented data is not the board the gate reads. With no input file, `main.ts` exits with an error instead of silently scoring something else.

## Repository layout

```text
main.ts                  Entry point (Node 22, run as `node main.ts`)
src/
  types.ts               Shared types (the snapshot's ten fields)
  snapshot.ts            Sealed-snapshot loading + validation
  scoring.ts             Eligibility, model, implied value, farm plans
vendor/
  makefun-board.ts       The kit's dossier builder, copied unmodified
dashboard/
  index.html             Page shell (loads data.js + app.js)
  app.css                Charcoal-and-amber theme
  app.js                 Board, detail and filter views (reads window.RADAR)
board.json               Committed board generated from the sealed snapshot
data.js                  Committed dashboard data (window.RADAR)
dossier.json             Committed dossier, byte-identical to a fresh buildDossier run
screenshots/            The three required dashboard screenshots (see its README)
tests/verify.mjs         Determinism + board-rule + dossier + screenshot checks
```

## Gaps to close before submission

- **Screenshots are taken.** The three required shots are in `screenshots/` (1280×800 PNG, captured with Playwright Chromium, viewport 1280×800, 1× scale). The filtered view uses `#/board?category=Risk%20Curators&minScore=50` (6 rows); the earlier `Lending&minScore=60` example would show no rows. Details in `screenshots/README.md`.
- **GitHub About: set.** The repository was created after 14 Nov 2026 10:00 UTC, and its About is set (homepage `https://make.fun/bounty/token-radar-01`, topics `makefun`, `ai-agents`, `bounties`, `trading`). Submission itself (repo URL, commit SHA, title, transcript bundle, wallet signature) is a parent-side step.

## Disclaimer

Not financial advice. A token launch is never guaranteed, implied values are estimates, and farming a protocol carries smart-contract and market risk. Verify every claim against the protocol's own channels before acting on it.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ae263tzr&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
