/**
 * Shared types for the token launch radar.
 *
 * The radar reads the sealed snapshot exactly as the competition ships it:
 * every protocol carries ten fields and no others (see src/snapshot.ts).
 * There is no 30-day change and no token flag in the file: a protocol
 * records no token when gecko_id, symbol and mcap_usd are all null.
 *
 * Everything in this file is erasable TypeScript (types only), so Node
 * 22.18+ runs main.ts directly with no build step and no dependencies.
 */

/** One protocol of the sealed snapshot: exactly its ten fields. */
export type SnapshotProtocol = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
};

/** The whole sealed snapshot document. */
export type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
};

/** The radar's own model constants (see src/scoring.ts). */
export type ModelConstants = {
  /** Growth weight on the clamped 7-day change. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Tenure factor range, from tenure_floor up. */
  tenure_floor: number;
  tenure_range: number;
  tenure_days: number;
  unknown_age_days: number;
  /** Category-multiple clamp, from tokened comparables. */
  multiple_floor: number;
  multiple_cap: number;
  /** Score weights, summing to 100. */
  weights: { size: number; momentum: number; breadth: number; tenure: number; headroom: number };
};

/** One farm step, as a single string carrying action, cost and time. */
export type BoardRow = {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: "pre-token";
  age_days: number | null;
  score: number;
  score_breakdown: {
    size: number;
    momentum: number;
    breadth: number;
    tenure: number;
    headroom: number;
    risk: number;
  };
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_factor: number;
    tenure_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
};

/** The dashboard's compact view of one board row. */
export type RadarRow = {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  score: number;
  score_breakdown: {
    size: number;
    momentum: number;
    breadth: number;
    tenure: number;
    headroom: number;
    risk: number;
  };
  implied_value_usd: number;
  category_multiple: number;
  growth_factor: number;
  tenure_factor: number;
  farm_steps: string[];
};

/** A tokened protocol, shown only for comparison, never ranked. */
export type LiveRow = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
};

/** Everything the dashboard needs, written to data.js by main.ts. */
export type RadarData = {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_multiples: Record<string, number>;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
};
