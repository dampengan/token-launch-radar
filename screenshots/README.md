# screenshots/

The bounty requires three screenshots of the dashboard, under this folder:

1. `1-board.png` — the board (the ranked table, `#/board`)
2. `2-detail.png` — a protocol's detail view (`#/protocol/<slug>` for the #1 row)
3. `3-filtered.png` — a filtered view (`#/board?category=Lending&minScore=60`)

Each must be a whole PNG at 1280×800 (long side at most 1440, short side at
least 800), 300–350 KB each and at most 512 KiB.

## Status

**Not taken yet.** No browser, Chromium, Firefox, Playwright or Puppeteer
was available in this build environment, so no screenshot of this
dashboard exists here. They must be captured on a machine with a browser:

1. Run `node main.ts --input <kit>/input/snapshot.json --output out`
   (or open the committed `out/dashboard/index.html` with `out/data.js`
   beside it).
2. Open `out/dashboard/index.html` in Chrome/Firefox/Safari.
3. Set the window to 1280×800.
4. For `1-board.png`: load the board view.
5. For `2-detail.png`: open `#/protocol/<slug>` for the #1 row.
6. For `3-filtered.png`: open `#/board?category=Lending&minScore=60`.
7. Save each capture as a PNG in this folder, at 1× (not 2×) scale, then
   re-run `node main.ts` so `out/` picks them up and rebuilds the dossier.

Do not copy the kit starter's screenshots: those are the starter's
dashboard, not this one, and would fail the dossier and authorship
checks. These three must be captures of this dashboard, from this code.
