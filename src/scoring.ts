/**
 * The radar's value model: one snapshot in, one ranked board out.
 *
 * The board covers every slug in the snapshot's watchlist (the floor,
 * never a ceiling) and adds every other protocol the watchlist rule
 * would keep below the floor: pre-token, not a wrapped, staked or
 * bridged product, not versioned. On this snapshot that is 40 watchlist
 * rows plus 138 early rows, 178 in all — the strict rule leaves no more
 * below the floor, so 200 rows would mean ranking bridge and liquid-
 * staking products the rule leaves out, and this radar does not.
 *
 * A protocol records no token when its snapshot entry carries no market
 * cap, no CoinGecko id and no symbol. That is DefiLlama's record, not
 * proof it has no token, and the dashboard says so.
 *
 * Implied value follows only from the snapshot's own figures:
 *
 *   multiple  = the category's median mcap/TVL among its tokened
 *               protocols, clamped to [0.4, 3.5] (overall median when
 *               a category has no tokened comparable)
 *   growth    = 1 + clamp(change_7d, -50, 100) / 100 x 0.6
 *   tenure    = 0.75 + min(age_days, 1460) / 1460 x 0.5
 *               (age unknown: 365 days)
 *   implied   = max(1, round(tvl_usd x multiple x growth x tenure))
 *
 * No protocol name is ever special-cased: the same function scores
 * every row. The radar score (0-100) is a second, readable number:
 * size 30 + momentum 25 + breadth 10 + tenure 20 + headroom 15.
 * Rank is by implied value, never by score.
 */
import type {
  BoardRow,
  LiveRow,
  ModelConstants,
  RadarData,
  RadarRow,
  Snapshot,
  SnapshotProtocol,
} from "./types.ts";

/** The model's constants, as the dashboard states them. */
export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  tenure_floor: 0.75,
  tenure_range: 0.5,
  tenure_days: 1460,
  unknown_age_days: 365,
  multiple_floor: 0.4,
  multiple_cap: 3.5,
  weights: { size: 30, momentum: 25, breadth: 10, tenure: 20, headroom: 15 },
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = "launch-value-1";

/** Live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isTokenless(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories the watchlist rule treats as wrapped, staked or bridged products. */
const WRAPPED_CATEGORIES = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's name at the start of the name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is one the board may rank: tokenless, and not a wrapped, staked or bridged product, nor versioned. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isTokenless(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The median of sorted numbers, or null when there are none. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * One implied-value multiple per category, taken from the snapshot's own
 * tokened protocols: the median mcap/TVL of the category's tokened
 * protocols, clamped to [multiple_floor, multiple_cap]. A category with
 * no tokened comparable takes the overall median; with none at all, 1.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Record<string, number> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.gecko_id === null && p.symbol === null) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? "Uncategorised";
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const overall = median([...all].sort((a, b) => a - b));
  const fallback = overall === null ? 1 : clamp(overall, model.multiple_floor, model.multiple_cap);
  const out: Record<string, number> = {};
  const categories = new Set(snapshot.protocols.map((p) => p.category ?? "Uncategorised"));
  for (const c of categories) {
    const ratios = [...(byCategory.get(c) ?? [])].sort((a, b) => a - b);
    const m = median(ratios);
    out[c] = m === null ? fallback : clamp(m, model.multiple_floor, model.multiple_cap);
  }
  return out;
}

/** The implied value one protocol gets, with its three factors. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  multiples: Record<string, number>,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; growthFactor: number; tenureFactor: number; age: number | null } {
  const multiple = multiples[p.category ?? "Uncategorised"] ?? 1;
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthFactor = 1 + (growthPct / 100) * model.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const tenureFactor =
    model.tenure_floor + (Math.min(Math.max(ageForModel, 0), model.tenure_days) / model.tenure_days) * model.tenure_range;
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * tenureFactor));
  return { implied, multiple, growthFactor, tenureFactor, age };
}

/** The radar score (0-100) and its risk, from the same snapshot figures. */
export function scoreProtocol(
  p: SnapshotProtocol,
  age: number | null,
): { score: number; size: number; momentum: number; breadth: number; tenure: number; headroom: number; risk: number } {
  const logTvl = Math.log10(Math.max(p.tvl_usd, 1));
  const size = clamp((logTvl - 6.7) * 33 + 30, 0, 100);
  const momentum = clamp((clamp(p.change_7d ?? 0, -40, 80) + 40) / 120 * 100, 0, 100);
  const breadth = (Math.min(p.chains.length, 6) / 6) * 100;
  const tenure = (Math.min(age ?? MODEL.unknown_age_days, MODEL.tenure_days) / MODEL.tenure_days) * 100;
  const headroom = clamp((9 - logTvl) * 25, 0, 100);
  const w = MODEL.weights;
  const score = round1((size * w.size + momentum * w.momentum + breadth * w.breadth + tenure * w.tenure + headroom * w.headroom) / 100);
  let risk = 20;
  if (p.chains.length <= 1) risk += 25;
  else if (p.chains.length === 2) risk += 10;
  const worst = p.change_7d ?? 0;
  if (worst < -10) risk += 25;
  else if (worst < 0) risk += 10;
  if (p.tvl_usd < 10_000_000) risk += 15;
  else if (p.tvl_usd < 25_000_000) risk += 5;
  return { score, size: round1(size), momentum: round1(momentum), breadth: round1(breadth), tenure: round1(tenure), headroom: round1(headroom), risk: clamp(risk, 0, 100) };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : "its main chain";
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 100_000_000) return 200;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? "").toLowerCase();
  const name = p.name;
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral") || c.includes("money market")) {
    return `Supply $${capital} of USDC as collateral on ${name} and borrow a small amount against it, then repay the borrow within a week so the position stays active.`;
  }
  if (c.includes("dex") || c.includes("swap") || c.includes("leveraged farm")) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and leave the position open instead of withdrawing after one trade.`;
  }
  if (c.includes("yield") || c.includes("vault") || c.includes("curator") || c.includes("allocator")) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the whole qualifying window.`;
  }
  if (c.includes("restak") || c.includes("staking pool")) {
    return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  }
  if (c.includes("perpetual") || c.includes("derivative") || c.includes("options")) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, then close it only after a week.`;
  }
  if (c.includes("prediction")) {
    return `Fund $${capital} on ${name} and take one small position in a market that settles after the qualifying window.`;
  }
  if (c.includes("stable") || c.includes("rwa")) {
    return `Mint or hold $${capital} of the asset ${name} issues on ${chain} and keep it in the farming wallet.`;
  }
  if (c.includes("insurance")) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the whole window.`;
  }
  if (c.includes("bridge")) {
    return `Move $${capital} through ${name} to ${chain} and use the bridged funds inside its app, rather than bridging straight back.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once, then keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each one string carrying its action,
 * what it costs and how long it takes. The plan is derived from the
 * protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const steps = [
    `Open a dedicated farming wallet for ${p.name} and fund it with $${capital} in USDC on ${chain} plus $5 for gas, keeping the seed phrase offline. Cost: about $5 of gas to set up. Time: 10 minutes.`,
    `${actionFor(p, capital, chain)} Cost: $${capital} of capital plus about $4 of gas. Time: 15 minutes.`,
    second === null
      ? `Add a second, smaller position of $${Math.round(capital / 2)} in the protocol's main pool so the wallet shows depth, not a single deposit. Cost: about $3 of gas. Time: 10 minutes.`
      : `Repeat the core position on ${second} with $${Math.round(capital / 2)} so the activity shows on more than one chain. Cost: about $3 of gas. Time: 10 minutes.`,
    `Return once a week for ${hold} days: repeat the core action, and vote or complete a quest when one is live, logging the date and transaction each time. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Check the protocol's own points, season or rewards page every two weeks and confirm the wallet is still earning; ignore any claim link sent by DM or email. Cost: nothing to check. Time: 10 minutes a fortnight.`,
    `When a token launches, claim only from the link the protocol publishes on its own site, then revoke the spending approval and reassess the position on its own merits. Cost: about $3 of gas to revoke. Time: 15 minutes.`,
  ];
  return steps.map((s) => s.trim());
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, multiples: Record<string, number>): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable protocol below the watchlist floor, by TVL.
  // No slice cap: on this snapshot the strict rule keeps 138 of them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples);
    const s = scoreProtocol(p, v.age);
    return { p, v, s };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((x, i) => ({
    rank: i + 1,
    slug: x.p.slug,
    name: x.p.name,
    category: x.p.category,
    chains: [...x.p.chains],
    tvl_usd: x.p.tvl_usd,
    change_7d: x.p.change_7d,
    mcap_usd: x.p.mcap_usd,
    listed_at: x.p.listed_at,
    gecko_id: x.p.gecko_id,
    symbol: x.p.symbol,
    token_status: "pre-token" as const,
    age_days: x.v.age,
    score: x.s.score,
    score_breakdown: {
      size: x.s.size,
      momentum: x.s.momentum,
      breadth: x.s.breadth,
      tenure: x.s.tenure,
      headroom: x.s.headroom,
      risk: x.s.risk,
    },
    implied_value_usd: x.v.implied,
    model: {
      category_multiple: x.v.multiple,
      growth_factor: round4(x.v.growthFactor),
      tenure_factor: round4(x.v.tenureFactor),
      age_days: x.v.age,
    },
    farm_steps: farmSteps(x.p, x.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's comparison view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isTokenless(p) && p.category !== "CEX")
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    score: row.score,
    score_breakdown: row.score_breakdown,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_factor: row.model.growth_factor,
    tenure_factor: row.model.tenure_factor,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot);
  const board = buildBoard(snapshot, multiples);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    category_multiples: multiples,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board has ${board.length} rows, below the 100-row minimum`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return "the board repeats a slug";
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 5).join(", ")}`;
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const r of board) {
    if (!bySlug.has(r.slug)) return `${r.slug} is not a snapshot protocol`;
    if (typeof r.name !== "string" || r.name.length === 0) return `${r.slug} has an empty name`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) return `${r.slug} has ${Array.isArray(steps) ? steps.length : 0} farm steps`;
    for (const s of steps) {
      const t = typeof s === "string" ? s.trim() : "";
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
