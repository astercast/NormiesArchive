/**
 * Global event indexer — server-side only.
 *
 * INCREMENTAL SCANNING: on first call, scans from deploy block → latest.
 * On subsequent cache refreshes, only scans the new blocks since last run.
 * New events are merged into existing maps — never rescanning old blocks.
 *
 * Speed architecture:
 *  - 50k-block chunks (max supported by public RPCs)
 *  - 12 chunks in parallel per batch
 *  - Timestamps fetched lazily per-token (tiny set per token, fast)
 *  - Module-level cache, incremental revalidation after 10 min
 *  - Vercel CDN caches each API route for 5 min
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

export const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE      = 50_000n;
const PARALLEL_CHUNKS = 12;
const CACHE_TTL_MS    = 10 * 60 * 1000; // 10 min

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditEvent {
  blockNumber:   number;
  timestamp:     number;
  txHash:        string;
  changeCount:   number;
  newPixelCount: number;
  transformer:   string;
}

export interface BurnEvent {
  blockNumber:  number;
  timestamp:    number;
  txHash:       string;
  tokenId:      number;
  totalActions: number;
  owner:        string;
}

export interface UpgradedNormie {
  id:        number;
  level:     number;
  ap:        number;
  added:     number;
  removed:   number;
  type:      string;
  editCount: number;
}

// Raw events without timestamps — populated during scan
interface RawEditEvent {
  blockNumber:   number;
  txHash:        string;
  changeCount:   number;
  newPixelCount: number;
  transformer:   string;
}

interface RawBurnEvent {
  blockNumber:  number;
  txHash:       string;
  tokenId:      number;
  totalActions: number;
  owner:        string;
}

// ─── Global cache ─────────────────────────────────────────────────────────────

interface GlobalCache {
  normies:      UpgradedNormie[];
  editsByToken: Map<number, RawEditEvent[]>;
  burnsByToken: Map<number, RawBurnEvent[]>;
  scannedAt:    number;
  latestBlock:  number; // highest block we've scanned up to (inclusive)
}

let _cache:       GlobalCache | null          = null;
let _scanPromise: Promise<GlobalCache> | null = null;

// ─── Block timestamps (module-level cache, shared across token lookups) ────────

const tsCache = new Map<number, number>();
const TS_BATCH_SIZE = 15;

async function fetchBlockTimestamp(bn: number): Promise<{ bn: number; ts: number }> {
  const block = await Promise.race([
    publicClient.getBlock({ blockNumber: BigInt(bn) }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`block ${bn} timeout`)), 8_000)),
  ]);
  return { bn, ts: Number(block.timestamp) };
}

async function resolveTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique  = [...new Set(blockNumbers)];
  const missing = unique.filter(b => !tsCache.has(b));

  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += TS_BATCH_SIZE) {
      const batch = missing.slice(i, i + TS_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(fetchBlockTimestamp));
      for (const r of results) {
        if (r.status === "fulfilled") tsCache.set(r.value.bn, r.value.ts);
      }
      if (i + TS_BATCH_SIZE < missing.length) await new Promise(r => setTimeout(r, 50));
    }
  }

  const out = new Map<number, number>();
  for (const b of blockNumbers) {
    out.set(b, tsCache.get(b) ?? Math.floor(Date.now() / 1000));
  }
  return out;
}

// ─── Event scanning ───────────────────────────────────────────────────────────

const TRANSFORM_EVENT = parseAbiItem(
  "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
);
const BURN_EVENT = parseAbiItem(
  "event BurnRevealed(uint256 indexed commitId, address indexed owner, uint256 indexed receiverTokenId, uint256 totalActions, bool expired)"
);

interface RawLog {
  blockNumber: bigint;
  transactionHash: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
}

async function fetchChunk(from: bigint, to: bigint, event: import("viem").AbiEvent, attempt = 0): Promise<RawLog[]> {
  try {
    return await publicClient.getLogs({ address: CANVAS_ADDRESS, event, fromBlock: from, toBlock: to }) as RawLog[];
  } catch (err) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return fetchChunk(from, to, event, attempt + 1);
    }
    console.warn(`[indexer] chunk ${from}-${to} failed after retries:`, err);
    return [];
  }
}

async function scanRange(from: bigint, to: bigint, event: import("viem").AbiEvent): Promise<RawLog[]> {
  if (from > to) return [];
  const chunks: Array<[bigint, bigint]> = [];
  for (let f = from; f <= to; f += CHUNK_SIZE) {
    chunks.push([f, f + CHUNK_SIZE - 1n < to ? f + CHUNK_SIZE - 1n : to]);
  }
  const all: RawLog[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const results = await Promise.all(
      chunks.slice(i, i + PARALLEL_CHUNKS).map(([f, t]) => fetchChunk(f, t, event))
    );
    for (const r of results) all.push(...r);
  }
  return all;
}

// ─── Normie API detail fetching ───────────────────────────────────────────────

const BASE_API = "https://api.normies.art";

async function fetchNormieDetails(id: number, editCount: number): Promise<UpgradedNormie | null> {
  try {
    const [infoRes, diffRes, traitsRes] = await Promise.all([
      fetchWithRetry(`${BASE_API}/normie/${id}/canvas/info`),
      fetchWithRetry(`${BASE_API}/normie/${id}/canvas/diff`),
      fetchWithRetry(`${BASE_API}/normie/${id}/traits`),
    ]);
    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    if (!info.customized) return null;
    const diff   = diffRes.ok   ? await diffRes.json()   : { addedCount: 0, removedCount: 0 };
    const traits = traitsRes.ok ? await traitsRes.json() : { attributes: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type   = traits.attributes?.find((a: any) => a.trait_type === "Type")?.value ?? "Human";
    return {
      id, level: info.level ?? 1, ap: info.actionPoints ?? 0,
      added: diff.addedCount ?? 0, removed: diff.removedCount ?? 0,
      editCount, type: String(type),
    };
  } catch { return null; }
}

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise(r => setTimeout(r, (retryAfter || 2) * 1000 * (attempt + 1)));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

// ─── Merge new logs into existing maps ────────────────────────────────────────

function mergeEditLogs(
  editsByToken: Map<number, RawEditEvent[]>,
  logs: RawLog[]
): Set<number> {
  const touched = new Set<number>();
  for (const log of logs) {
    const id = Number(log.args.tokenId);
    const event: RawEditEvent = {
      blockNumber:   Number(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer as string,
    };
    if (!editsByToken.has(id)) editsByToken.set(id, []);
    editsByToken.get(id)!.push(event);
    touched.add(id);
  }
  // Re-sort only the tokens that received new events
  for (const id of touched) {
    editsByToken.get(id)!.sort((a, b) => a.blockNumber - b.blockNumber);
  }
  return touched;
}

function mergeBurnLogs(
  burnsByToken: Map<number, RawBurnEvent[]>,
  logs: RawLog[]
): Set<number> {
  const touched = new Set<number>();
  for (const log of logs) {
    const id = Number(log.args.receiverTokenId);
    const event: RawBurnEvent = {
      blockNumber:  Number(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      id,
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner as string,
    };
    if (!burnsByToken.has(id)) burnsByToken.set(id, []);
    burnsByToken.get(id)!.push(event);
    touched.add(id);
  }
  return touched;
}

// ─── Full scan (first time) ───────────────────────────────────────────────────

async function doFullScan(): Promise<GlobalCache> {
  console.log("[indexer] Starting full scan…");
  const t0     = Date.now();
  const latest = await publicClient.getBlockNumber();

  const [editLogs, burnLogs] = await Promise.all([
    scanRange(CANVAS_DEPLOY_BLOCK, latest, TRANSFORM_EVENT),
    scanRange(CANVAS_DEPLOY_BLOCK, latest, BURN_EVENT),
  ]);

  console.log(`[indexer] ${editLogs.length} edit events, ${burnLogs.length} burn events in ${Date.now() - t0}ms`);

  const editsByToken = new Map<number, RawEditEvent[]>();
  const burnsByToken = new Map<number, RawBurnEvent[]>();

  mergeEditLogs(editsByToken, editLogs);
  mergeBurnLogs(burnsByToken, burnLogs);

  // Build edit count per token for leaderboard
  const editCountByToken = new Map<number, number>();
  for (const [id, events] of editsByToken) {
    editCountByToken.set(id, events.length);
  }

  // Fetch normie details — 8 per batch, 1.5s gap to stay under rate limit
  const allIds  = [...editCountByToken.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH   = 8;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch   = allIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => fetchNormieDetails(id, editCountByToken.get(id)!)));
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < allIds.length) await new Promise(r => setTimeout(r, 1500));
  }
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const entry: GlobalCache = {
    normies,
    editsByToken,
    burnsByToken,
    scannedAt:   Date.now(),
    latestBlock: Number(latest),
  };
  console.log(`[indexer] Full scan done: ${normies.length} normies, block ${Number(latest)} in ${Date.now() - t0}ms`);
  return entry;
}

// ─── Incremental scan (subsequent refreshes) ─────────────────────────────────

async function doIncrementalScan(existing: GlobalCache): Promise<GlobalCache> {
  const fromBlock = BigInt(existing.latestBlock + 1);
  const latest    = await publicClient.getBlockNumber();

  if (fromBlock > latest) {
    // Nothing new — just bump the timestamp so TTL resets
    console.log(`[indexer] Incremental: no new blocks (head=${latest})`);
    return { ...existing, scannedAt: Date.now() };
  }

  console.log(`[indexer] Incremental scan blocks ${fromBlock}–${latest}…`);
  const t0 = Date.now();

  const [editLogs, burnLogs] = await Promise.all([
    scanRange(fromBlock, latest, TRANSFORM_EVENT),
    scanRange(fromBlock, latest, BURN_EVENT),
  ]);

  if (editLogs.length === 0 && burnLogs.length === 0) {
    console.log(`[indexer] Incremental: 0 new events in ${Date.now() - t0}ms`);
    return { ...existing, scannedAt: Date.now(), latestBlock: Number(latest) };
  }

  console.log(`[indexer] Incremental: ${editLogs.length} edits, ${burnLogs.length} burns in ${Date.now() - t0}ms`);

  // Clone maps so we don't mutate the live cache
  const editsByToken = new Map(Array.from(existing.editsByToken, ([k, v]) => [k, [...v]]));
  const burnsByToken = new Map(Array.from(existing.burnsByToken, ([k, v]) => [k, [...v]]));

  const touchedByEdit = mergeEditLogs(editsByToken, editLogs);
  const touchedByBurn = mergeBurnLogs(burnsByToken, burnLogs);

  // Only re-fetch normie details for tokens with new events
  const toRefresh = new Set([...touchedByEdit, ...touchedByBurn]);
  const normies   = existing.normies.filter(n => !toRefresh.has(n.id)); // keep untouched ones

  const toFetch = [...toRefresh];
  const BATCH   = 8;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch   = toFetch.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(id => fetchNormieDetails(id, editsByToken.get(id)?.length ?? 0))
    );
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 1500));
  }
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const entry: GlobalCache = {
    normies,
    editsByToken,
    burnsByToken,
    scannedAt:   Date.now(),
    latestBlock: Number(latest),
  };
  console.log(`[indexer] Incremental done: ${toRefresh.size} tokens refreshed, block ${Number(latest)}`);
  return entry;
}

// ─── Public cache API ─────────────────────────────────────────────────────────

async function getCache(): Promise<GlobalCache> {
  const now = Date.now();

  // Still fresh — return immediately
  if (_cache && now - _cache.scannedAt < CACHE_TTL_MS) return _cache;

  // Already revalidating — return stale if we have it, otherwise wait
  if (_scanPromise) {
    return _cache ?? _scanPromise;
  }

  // Kick off the right kind of scan
  _scanPromise = (_cache ? doIncrementalScan(_cache) : doFullScan())
    .then(entry => { _cache = entry; return entry; })
    .catch(err => {
      console.error("[indexer] scan failed:", err);
      // On failure, keep stale cache if available rather than returning nothing
      if (_cache) return _cache;
      throw err;
    })
    .finally(() => { _scanPromise = null; });

  // Return stale while revalidating (never block on refresh)
  return _cache ?? _scanPromise;
}

// ─── Public exports (unchanged signatures) ────────────────────────────────────

/**
 * Per-token history — fetches timestamps lazily only for this token's blocks.
 */
export async function getTokenHistory(tokenId: number): Promise<{ edits: EditEvent[]; burns: BurnEvent[] }> {
  const cache    = await getCache();
  const rawEdits = cache.editsByToken.get(tokenId) ?? [];
  const rawBurns = cache.burnsByToken.get(tokenId) ?? [];

  if (rawEdits.length === 0 && rawBurns.length === 0) {
    return { edits: [], burns: [] };
  }

  const allBlocks = [...rawEdits.map(e => e.blockNumber), ...rawBurns.map(b => b.blockNumber)];

  let timestamps: Map<number, number>;
  try {
    timestamps = await Promise.race([
      resolveTimestamps(allBlocks),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timestamp timeout")), 25_000)
      ),
    ]);
  } catch (err) {
    console.warn(`[history/${tokenId}] timestamp fallback:`, err);
    timestamps = new Map(allBlocks.map(b => [b, tsCache.get(b) ?? Math.floor(Date.now() / 1000)]));
  }

  const ts = (bn: number) => timestamps.get(bn) ?? Math.floor(Date.now() / 1000);

  const edits: EditEvent[] = rawEdits.map(e => ({ ...e, timestamp: ts(e.blockNumber) }));
  const burns: BurnEvent[] = rawBurns.map(b => ({ ...b, timestamp: ts(b.blockNumber) }));

  return { edits, burns };
}

/** All upgraded normies + metadata for homepage/leaderboard */
export async function getLeaderboards() {
  const cache = await getCache();
  const { normies, scannedAt, latestBlock } = cache;

  const mostEdited   = [...normies].sort((a, b) => b.editCount - a.editCount || b.level - a.level);
  const highestLevel = [...normies].sort((a, b) => b.level - a.level || b.ap - a.ap);

  return {
    all: normies.map(n => ({
      tokenId: n.id, level: n.level, ap: n.ap,
      added: n.added, removed: n.removed, type: n.type, editCount: n.editCount,
    })),
    mostEdited:   mostEdited.slice(0, 50).map(n => ({ tokenId: n.id, value: n.editCount, label: "edits",  type: n.type })),
    highestLevel: highestLevel.slice(0, 50).map(n => ({ tokenId: n.id, value: n.level,     label: "level", type: n.type })),
    totalCustomized: normies.length,
    scannedAt,
    latestBlock,
  };
}

// backward compat
export async function getUpgradedNormies() {
  const cache = await getCache();
  return { normies: cache.normies, scannedAt: cache.scannedAt, latestBlock: cache.latestBlock, fromCache: true };
}

/**
 * The 100 — the first 100 Normies ever edited on the Canvas, sorted by first-edit block.
 */
export async function getThe100(): Promise<{
  entries: Array<{ tokenId: number; blockNumber: number; txHash: string; rank: number; type: string; changeCount: number }>;
  scannedAt: number;
  latestBlock: number;
}> {
  const cache = await getCache();

  const pioneers: Array<{ tokenId: number; blockNumber: number; txHash: string; changeCount: number; type: string }> = [];

  for (const [tokenId, events] of cache.editsByToken) {
    if (events.length === 0) continue;
    const first  = events[0];
    const normie = cache.normies.find(n => n.id === tokenId);
    pioneers.push({
      tokenId,
      blockNumber: first.blockNumber,
      txHash:      first.txHash,
      changeCount: first.changeCount,
      type:        normie?.type ?? "Human",
    });
  }

  pioneers.sort((a, b) => a.blockNumber - b.blockNumber);
  const top100 = pioneers.slice(0, 100);

  return {
    entries: top100.map((p, i) => ({ ...p, rank: i + 1 })),
    scannedAt:   cache.scannedAt,
    latestBlock: cache.latestBlock,
  };
}
