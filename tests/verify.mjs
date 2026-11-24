#!/usr/bin/env node
/**
 * Black-box verification for the token launch radar. No dependencies.
 *
 *   node tests/verify.mjs [--input <snapshot.json|dir>]
 *
 * The snapshot defaults to the kit's sealed input, then MAKEFUN_INPUT_DIR,
 * then /input/snapshot.json. Runs main.ts twice into two fresh output
 * directories and checks:
 *  - both runs exit 0
 *  - board.json, data.js and dossier.json are byte-identical across runs
 *  - board.json is {"rows": [...]} with 100+ rows, the whole watchlist
 *    covered, ranks 1..N, implied values non-increasing and not all equal,
 *    and farm steps of 3-12 strings of 20-600 characters
 *  - no row records a token, is versioned, or is a wrapped/staked/bridged
 *    product outside the watchlist
 *  - dossier.json is byte-identical to a fresh buildDossier run, schema
 *    makefun/dossier/v1, at most 1.5 MiB
 *  - dashboard/ holds index.html + app.css + app.js, total source under
 *    64 KiB, with no http:// or https:// anywhere in it
 *  - screenshots/ holds the three PNGs, each at most 512 KiB, long side
 *    at most 1440 and short side at least 800
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_SNAPSHOT = "/home/hatch/workspace/kit/token-radar-01-kit/input/snapshot.json";

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  return null;
}

function resolveSnapshot() {
  const a = arg("input");
  if (a) return a.endsWith(".json") ? a : join(a, "snapshot.json");
  if (process.env.MAKEFUN_INPUT_DIR) return join(process.env.MAKEFUN_INPUT_DIR, "snapshot.json");
  if (existsSync(KIT_SNAPSHOT)) return KIT_SNAPSHOT;
  return "/input/snapshot.json";
}

const snapshotPath = resolveSnapshot();
assert.ok(existsSync(snapshotPath), `snapshot not found at ${snapshotPath}`);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
const watchlist = new Set(snapshot.watchlist);

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const BADCAT = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

function pngSize(buf) {
  assert.ok(buf.length > 24, "screenshot too small to be a PNG");
  assert.equal(buf[0], 0x89, "screenshot is not a PNG");
  assert.equal(buf[1], 0x50, "screenshot is not a PNG");
  assert.equal(buf[2], 0x4e, "screenshot is not a PNG");
  assert.equal(buf[3], 0x47, "screenshot is not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const tmp = mkdtempSync(join(tmpdir(), "radar-verify-"));
const outA = join(tmp, "a");
const outB = join(tmp, "b");

try {
  for (const out of [outA, outB]) {
    execFileSync(process.execPath, ["main.ts", "--input", snapshotPath, "--output", out], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
    });
  }
  for (const name of ["board.json", "data.js", "dossier.json"]) {
    const a = readFileSync(join(outA, name));
    const b = readFileSync(join(outB, name));
    assert.ok(a.equals(b), `${name} differs between runs — not deterministic`);
  }

  const boardDoc = JSON.parse(readFileSync(join(outA, "board.json"), "utf8"));
  assert.ok(boardDoc && !Array.isArray(boardDoc) && Array.isArray(boardDoc.rows), "board.json is not {\"rows\": [...]}");
  const board = boardDoc.rows;
  assert.ok(board.length >= 100, `board has ${board.length} rows, need >= 100`);
  const slugs = new Set();
  for (const r of board) {
    assert.ok(!slugs.has(r.slug), `board repeats slug ${r.slug}`);
    slugs.add(r.slug);
    const p = bySlug.get(r.slug);
    assert.ok(p, `${r.slug} is not a snapshot protocol`);
    assert.ok(typeof r.name === "string" && r.name.length > 0, `${r.slug} has an empty name`);
    assert.ok(Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0, `${r.slug} has no implied value`);
  }
  for (const s of snapshot.watchlist) assert.ok(slugs.has(s), `watchlist slug ${s} is missing from the board`);
  for (let i = 0; i < board.length; i++) {
    const r = board[i];
    assert.equal(r.rank, i + 1, `row ${i} rank is ${r.rank}`);
    assert.ok(Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `${r.slug} has ${r.farm_steps?.length} farm steps`);
    for (const step of r.farm_steps) {
      const t = step.trim();
      assert.ok(t.length >= 20 && t.length <= 600, `${r.slug} has a farm step of ${t.length} characters`);
    }
    if (i > 0) assert.ok(board[i - 1].implied_value_usd >= r.implied_value_usd, `board implied values rise at row ${i + 1}`);
  }
  assert.ok(board[0].implied_value_usd !== board[board.length - 1].implied_value_usd, "all rows share one implied value");
  for (const r of board) {
    const p = bySlug.get(r.slug);
    assert.ok(p.mcap_usd === null && p.gecko_id === null && p.symbol === null, `${r.slug} records a token`);
    assert.ok(!VERSIONED.test(p.name), `${r.slug} is versioned`);
    if (!watchlist.has(r.slug)) {
      assert.ok(!(p.category !== null && BADCAT.has(p.category)), `${r.slug} is a wrapped/staked/bridged product (${p.category})`);
      assert.ok(!WRAPPED_WORD.test(p.name), `${r.slug} name carries wrapped/staked/staking`);
      assert.ok(!EXCHANGE_PREFIX.test(p.name), `${r.slug} name starts with an exchange`);
    }
  }

  // Dossier: byte-identical to a fresh buildDossier run on the same output.
  const dossierBytes = readFileSync(join(outA, "dossier.json"));
  assert.ok(dossierBytes.length <= 1_572_864, `dossier.json is ${dossierBytes.length} bytes, over 1.5 MiB`);
  const dossier = JSON.parse(dossierBytes.toString("utf8"));
  assert.equal(dossier.schema, "makefun/dossier/v1", "dossier schema is not makefun/dossier/v1");
  const { buildDossier } = await import("../vendor/makefun-board.ts");
  const fresh = Buffer.from(buildDossier(outA, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  }));
  assert.ok(dossierBytes.equals(fresh), "dossier.json is not byte-identical to a fresh buildDossier run");
  assert.ok(dossier.text.length <= 65536, `dossier text is ${dossier.text.length} bytes, over 65,536`);

  // Dashboard source: small files, no network anywhere in them.
  const dashDir = join(outA, "dashboard");
  for (const f of ["index.html", "app.css", "app.js"]) {
    assert.ok(existsSync(join(dashDir, f)), `dashboard/${f} is missing`);
  }
  let dashBytes = 0;
  for (const f of readdirSync(dashDir)) {
    const buf = readFileSync(join(dashDir, f));
    dashBytes += buf.length;
    assert.ok(!/https?:\/\//.test(buf.toString("utf8")), `dashboard/${f} names an http(s) address`);
  }
  assert.ok(dashBytes < 65536, `dashboard source is ${dashBytes} bytes, over the 64 KiB budget`);
  const dataJs = readFileSync(join(outA, "data.js"), "utf8");
  assert.ok(dataJs.startsWith("window.RADAR="), "data.js does not set window.RADAR");

  // Screenshots: the three views, whole PNGs within the gate's caps.
  const shotDir = join(outA, "screenshots");
  const shots = [];
  for (const name of ["1-board.png", "2-detail.png", "3-filtered.png"]) {
    const p = join(shotDir, name);
    assert.ok(existsSync(p), `screenshots/${name} is missing`);
    const buf = readFileSync(p);
    assert.ok(buf.length <= 524288, `screenshots/${name} is ${buf.length} bytes, over 512 KiB`);
    const { width, height } = pngSize(buf);
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    assert.ok(longSide <= 1440, `screenshots/${name} is ${width}x${height}, long side over 1440`);
    assert.ok(shortSide >= 800, `screenshots/${name} is ${width}x${height}, short side under 800`);
    shots.push(`${name} ${width}x${height} ${Math.round(buf.length / 1024)} KiB`);
  }

  console.log(`verify: OK — ${board.length} rows (${snapshot.watchlist.length} watchlist + ${board.length - snapshot.watchlist.length} early), deterministic, dossier ${dossierBytes.length} bytes, dashboard source ${dashBytes} bytes`);
  console.log(`verify: top: #1 ${board[0].name} (score ${board[0].score}, implied $${board[0].implied_value_usd.toLocaleString("en-US")})`);
  console.log(`verify: screenshots: ${shots.join(", ")}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
