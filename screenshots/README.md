# screenshots/

The bounty requires three screenshots of the dashboard, under this folder:

1. `1-board.png` — the board (the ranked table, `#/board`)
2. `2-detail.png` — a protocol's detail view (`#/protocol/steakhouse-financial`, the #1 row)
3. `3-filtered.png` — a filtered view (`#/board?category=Risk%20Curators&minScore=50`, 6 of 178 rows shown)

Each must be a whole PNG at 1280×800 (long side at most 1440, short side at
least 800) and at most 512 KiB.

## Status

**Taken 2026-11-24.** Captured with Playwright Chromium (headless) on this
machine, viewport 1280×800, deviceScaleFactor 1, against `out/` served over
local HTTP:

1. Ran `node main.ts --input <kit>/input/snapshot.json --output out`.
2. Served `out/` on http://127.0.0.1:8321.
3. For `1-board.png`: loaded `#/board` (178 rows shown).
4. For `2-detail.png`: opened `#/protocol/steakhouse-financial` (rank #1 of 178).
5. For `3-filtered.png`: opened `#/board?category=Risk%20Curators&minScore=50`
   (6 rows shown). Note: the earlier example filter
   `category=Lending&minScore=60` would show no rows at all — the highest
   Lending score is 52.1 and the highest score on the board is 60.8 — so the
   filter was chosen to show real data.
6. Re-ran `node main.ts` so `out/` picked the screenshots up and rebuilt the
   dossier.

Actual files (all 1280×800 PNG): `1-board.png` 134,625 bytes,
`2-detail.png` 115,060 bytes, `3-filtered.png` 143,706 bytes. They compress
below the 300–350 KB rule of thumb because the dashboard is flat dark
colours; all are well under the 512 KiB cap.

Do not copy the kit starter's screenshots: those are the starter's
dashboard, not this one, and would fail the dossier and authorship
checks. These three are captures of this dashboard, from this code.
