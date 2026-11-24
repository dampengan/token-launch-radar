/**
 * Loading the sealed snapshot.
 *
 * The grader runs main.ts with the competition's sealed snapshot mounted
 * read-only at MAKEFUN_INPUT_DIR ("/input" in the sandbox). Locally, pass
 * it with --input: the kit's input/snapshot.json. There is no bundled
 * sample any more: the old dev sample (152 invented protocols) was
 * removed, because a board built from it is not the board the gate reads.
 *
 * The snapshot's shape is fixed: as_of, source, floor_usd, protocols
 * (758, sorted by slug, each with exactly ten fields) and watchlist
 * (40 slugs). This loader refuses anything else, so a wrong file fails
 * loudly instead of silently scoring invented data.
 */
import { readFileSync } from "node:fs";
import type { Snapshot, SnapshotProtocol } from "./types.ts";

/** Why a snapshot file is not one this radar can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

function asString(v: unknown, what: string): string {
  if (typeof v !== "string") throw new SnapshotError(`snapshot: ${what} is not a string`);
  return v;
}

function asNullableString(v: unknown, what: string): string | null {
  if (v === null) return null;
  if (typeof v === "string") return v;
  throw new SnapshotError(`snapshot: ${what} is neither a string nor null`);
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new SnapshotError(`snapshot: ${what} is not a finite number`);
  }
  return v;
}

function asNullableNumber(v: unknown, what: string): number | null {
  if (v === null) return null;
  return asNumber(v, what);
}

/** One protocol record, checked against the snapshot's ten fields. */
export function parseProtocol(raw: unknown, i: number): SnapshotProtocol {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SnapshotError(`snapshot: protocol ${i} is not an object`);
  }
  const p = raw as Record<string, unknown>;
  const slug = asString(p.slug, `protocol ${i} slug`);
  const name = asString(p.name, `protocol ${i} name`);
  if (slug.length === 0 || /\s/.test(slug)) {
    throw new SnapshotError(`snapshot: protocol ${i} has a bad slug`);
  }
  if (name.length === 0) throw new SnapshotError(`snapshot: protocol ${i} has an empty name`);
  const chainsRaw = p.chains;
  if (!Array.isArray(chainsRaw) || chainsRaw.some((c) => typeof c !== "string")) {
    throw new SnapshotError(`snapshot: protocol ${i} (${slug}) has no chains array`);
  }
  return {
    slug,
    name,
    category: asNullableString(p.category, `protocol ${i} category`),
    chains: chainsRaw as string[],
    tvl_usd: asNumber(p.tvl_usd, `protocol ${i} tvl_usd`),
    change_7d: asNullableNumber(p.change_7d, `protocol ${i} change_7d`),
    mcap_usd: asNullableNumber(p.mcap_usd, `protocol ${i} mcap_usd`),
    listed_at: asNullableString(p.listed_at, `protocol ${i} listed_at`),
    gecko_id: asNullableString(p.gecko_id, `protocol ${i} gecko_id`),
    symbol: asNullableString(p.symbol, `protocol ${i} symbol`),
  };
}

/** The snapshot out of a file's text, refused unless it is the sealed shape. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot.json is not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SnapshotError("snapshot.json is not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError("snapshot.json has no as_of date");
  }
  if (typeof o.source !== "string") throw new SnapshotError("snapshot.json has no source");
  if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError("snapshot.json has no floor_usd");
  }
  if (!Array.isArray(o.protocols) || o.protocols.length === 0) {
    throw new SnapshotError("snapshot.json has no protocols array");
  }
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string")) {
    throw new SnapshotError("snapshot.json has no watchlist of slugs");
  }
  const protocols = o.protocols.map((v, i) => parseProtocol(v, i));
  const slugs = new Set<string>();
  for (const p of protocols) {
    if (slugs.has(p.slug)) throw new SnapshotError(`snapshot.json repeats slug ${p.slug}`);
    slugs.add(p.slug);
  }
  for (const s of o.watchlist as string[]) {
    if (!slugs.has(s)) throw new SnapshotError(`snapshot.json watchlist names ${s}, which is not a protocol`);
  }
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Read and parse the snapshot file at `path`. */
export function loadSnapshotFile(path: string): Snapshot {
  return parseSnapshot(readFileSync(path, "utf8"));
}
