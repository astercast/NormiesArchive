/**
 * Global event indexer — server-side only.
 *
 * Scans ALL PixelsTransformed + BurnRevealed events once, stores per-token logs.
 * Timestamps are NOT fetched during scan (that was the timeout culprit).
 * Instead, timestamps are fetched lazily per-token when history is requested —
 * each token has at most ~10-20 unique blocks, so this is fast (1-2 RPC calls).
 *
 * Speed architecture:
 *  - 50k-block chunks (max supported by public RPCs)
 *  - 8 chunks in parallel per batch
 *  - Timestamps fetched all-at-once per-token (tiny set, fast)
 *  - Module-level cache, background revalidation after 10 min
 *  - Vercel CDN caches /api/normie/[id]/history for 5 min
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

export const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE      = 50_000n;
const PARALLEL_CHUNKS = 12;             // was 8 — more parallel chunks = faster cold scan
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
  latestBlock:  number;
}

let _cache:       GlobalCache | null          = null;
let _scanPromise: Promise<GlobalCache> | null = null;

// ─── Block timestamps (module-level cache, shared across token lookups) ────────

const tsCache = new Map<number, number>();

const TS_BATCH_SIZE = 15; // was 5 — more parallel timestamp fetches = faster per-token history

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
    // Fetch in small batches to avoid rate-limiting
    for (let i = 0; i < missing.length; i += TS_BATCH_SIZE) {
      const batch = missing.slice(i, i + TS_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(fetchBlockTimestamp));
      for (const r of results) {
        if (r.status === "fulfilled") tsCache.set(r.value.bn, r.value.ts);
      }
      // Small gap between batches to avoid hammering the RPC
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
      // Wait a bit then retry — transient RPC errors are common
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return fetchChunk(from, to, event, attempt + 1);
    }
    console.warn(`[indexer] chunk ${from}-${to} failed after retries:`, err);
    return [];
  }
}

async function scanEvent(latest: bigint, event: import("viem").AbiEvent): Promise<RawLog[]> {
  const chunks: Array<[bigint, bigint]> = [];
  for (let f = CANVAS_DEPLOY_BLOCK; f <= latest; f += CHUNK_SIZE) {
    chunks.push([f, f + CHUNK_SIZE - 1n < latest ? f + CHUNK_SIZE - 1n : latest]);
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
    // Respect rate limit — back off then retry
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise(r => setTimeout(r, (retryAfter || 2) * 1000 * (attempt + 1)));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

// ─── Full scan — no timestamp fetching ───────────────────────────────────────

async function doFullScan(): Promise<GlobalCache> {
  console.log("[indexer] Starting full scan…");
  const t0 = Date.now();
  const latest = await publicClient.getBlockNumber();

  // Scan both event types in parallel
  const [editLogs, burnLogs] = await Promise.all([
    scanEvent(latest, TRANSFORM_EVENT),
    scanEvent(latest, BURN_EVENT),
  ]);

  console.log(`[indexer] ${editLogs.length} edit events, ${burnLogs.length} burn events in ${Date.now() - t0}ms`);

  // Build per-token edit maps — timestamps deferred to per-token lookup
  const editsByToken     = new Map<number, RawEditEvent[]>();
  const editCountByToken = new Map<number, number>();

  for (const log of editLogs) {
    const id    = Number(log.args.tokenId);
    const event: RawEditEvent = {
      blockNumber:   Number(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer as string,
    };
    if (!editsByToken.has(id)) editsByToken.set(id, []);
    editsByToken.get(id)!.push(event);
    editCountByToken.set(id, (editCountByToken.get(id) ?? 0) + 1);
  }

  for (const [, events] of editsByToken) {
    events.sort((a, b) => a.blockNumber - b.blockNumber);
  }

  // Build per-token burn maps
  const burnsByToken = new Map<number, RawBurnEvent[]>();
  for (const log of burnLogs) {
    const id    = Number(log.args.receiverTokenId);
    const event: RawBurnEvent = {
      blockNumber:  Number(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      id,
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner as string,
    };
    if (!burnsByToken.has(id)) burnsByToken.set(id, []);
    burnsByToken.get(id)!.push(event);
  }

  // Fetch normie details for all customized tokens
  // 3 requests per normie × 8 per batch = 24 req/batch, well under 60 req/min with 1.5s gap
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
  console.log(`[indexer] Done: ${normies.length} normies in ${Date.now() - t0}ms`);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getCache(): Promise<GlobalCache> {
  const now = Date.now();
  if (_cache && now - _cache.scannedAt < CACHE_TTL_MS) return _cache;
  if (!_scanPromise) {
    _scanPromise = doFullScan()
      .then(entry => { _cache = entry; return entry; })
      .finally(() => { _scanPromise = null; });
  }
  if (_cache) return _cache; // return stale while revalidating
  return _scanPromise;
}

/**
 * Per-token history — fetches timestamps lazily only for this token's blocks.
 * Very fast: each token has at most ~10-20 unique blocks.
 */
export async function getTokenHistory(tokenId: number): Promise<{ edits: EditEvent[]; burns: BurnEvent[] }> {
  const cache    = await getCache();
  const rawEdits = cache.editsByToken.get(tokenId) ?? [];
  const rawBurns = cache.burnsByToken.get(tokenId) ?? [];

  if (rawEdits.length === 0 && rawBurns.length === 0) {
    return { edits: [], burns: [] };
  }

  // Collect unique block numbers for this token only
  const allBlocks = [...rawEdits.map(e => e.blockNumber), ...rawBurns.map(b => b.blockNumber)];

  // Race timestamp resolution against a 25s timeout to prevent hanging
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
    // Return with best-effort cached timestamps rather than failing
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
 * Returns tokenId + blockNumber + txHash of the first edit, plus trait type.
 */
export async function getThe100(): Promise<{
  entries: Array<{ tokenId: number; blockNumber: number; txHash: string; rank: number; type: string; changeCount: number }>;
  scannedAt: number;
  latestBlock: number;
}> {
  const cache = await getCache();

  // Each token in editsByToken has events sorted by blockNumber ascending.
  // Pull the first edit for each token, sort globally by blockNumber, take top 100.
  const pioneers: Array<{ tokenId: number; blockNumber: number; txHash: string; changeCount: number; type: string }> = [];

  for (const [tokenId, events] of cache.editsByToken) {
    if (events.length === 0) continue;
    const first = events[0];
    // Try to get type from normies list
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
