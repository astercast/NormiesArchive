/**
 * Global event indexer — server-side only.
 *
 * Scans ALL PixelsTransformed events once, stores full per-token log data.
 * Per-token history is served from this cache — no per-token RPC calls needed.
 *
 * Speed architecture:
 *  - 50k-block chunks (max supported by public RPCs)
 *  - 8 chunks in parallel per batch
 *  - Module-level cache, background revalidation
 *  - Vercel CDN caches API responses for 5 min
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

export const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE      = 50_000n;
const PARALLEL_CHUNKS = 8;
const CACHE_TTL_MS    = 5 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditEvent {
  blockNumber: number;
  timestamp:   number;
  txHash:      string;
  changeCount: number;
  newPixelCount: number;
  transformer: string;
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

// ─── Global cache ─────────────────────────────────────────────────────────────

interface GlobalCache {
  normies:     UpgradedNormie[];
  // Full event logs per token — serves history API instantly
  editsByToken: Map<number, EditEvent[]>;
  burnsByToken: Map<number, BurnEvent[]>;
  scannedAt:   number;
  latestBlock: number;
}

let _cache:       GlobalCache | null          = null;
let _scanPromise: Promise<GlobalCache> | null = null;

// ─── Block timestamps ─────────────────────────────────────────────────────────

const tsCache = new Map<bigint, number>();

async function getTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
  const missing = [...new Set(blocks)].filter(b => !tsCache.has(b));
  if (missing.length > 0) {
    // Batch in groups of 20 to avoid overwhelming RPC
    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20);
      const results = await Promise.allSettled(
        batch.map(bn => publicClient.getBlock({ blockNumber: bn }).then(b => ({ bn, ts: Number(b.timestamp) })))
      );
      for (const r of results) {
        if (r.status === "fulfilled") tsCache.set(r.value.bn, r.value.ts);
      }
    }
  }
  const out = new Map<bigint, number>();
  for (const b of blocks) out.set(b, tsCache.get(b) ?? Math.floor(Date.now() / 1000));
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

async function fetchChunk(from: bigint, to: bigint, event: import("viem").AbiEvent): Promise<RawLog[]> {
  try {
    return await publicClient.getLogs({ address: CANVAS_ADDRESS, event, fromBlock: from, toBlock: to }) as RawLog[];
  } catch {
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
    const results = await Promise.all(chunks.slice(i, i + PARALLEL_CHUNKS).map(([f, t]) => fetchChunk(f, t, event)));
    for (const r of results) all.push(...r);
  }
  return all;
}

// ─── Normie API detail fetching ───────────────────────────────────────────────

const BASE_API = "https://api.normies.art";

async function fetchNormieDetails(id: number, editCount: number): Promise<UpgradedNormie | null> {
  try {
    const [infoRes, diffRes, traitsRes] = await Promise.all([
      fetch(`${BASE_API}/normie/${id}/canvas/info`, { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/canvas/diff`,  { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/traits`,        { next: { revalidate: 3600 } } as RequestInit),
    ]);
    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    if (!info.customized) return null;
    const diff   = diffRes.ok   ? await diffRes.json()   : { addedCount: 0, removedCount: 0 };
    const traits = traitsRes.ok ? await traitsRes.json() : { attributes: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type   = traits.attributes?.find((a: any) => a.trait_type === "Type")?.value ?? "Human";
    return { id, level: info.level ?? 1, ap: info.actionPoints ?? 0,
             added: diff.addedCount ?? 0, removed: diff.removedCount ?? 0,
             editCount, type: String(type) };
  } catch { return null; }
}

// ─── Full scan ────────────────────────────────────────────────────────────────

async function doFullScan(): Promise<GlobalCache> {
  console.log("[indexer] Starting full scan…");
  const t0 = Date.now();
  const latest = await publicClient.getBlockNumber();

  // Scan both event types in parallel
  const [editLogs, burnLogs] = await Promise.all([
    scanEvent(latest, TRANSFORM_EVENT),
    scanEvent(latest, BURN_EVENT),
  ]);

  console.log(`[indexer] ${editLogs.length} edit events, ${burnLogs.length} burn events in ${Date.now()-t0}ms`);

  // Get all unique block numbers and fetch timestamps in bulk
  const allBlocks = [
    ...editLogs.map(l => l.blockNumber),
    ...burnLogs.map(l => l.blockNumber),
  ].filter(Boolean) as bigint[];
  const timestamps = allBlocks.length > 0 ? await getTimestamps([...new Set(allBlocks)]) : new Map<bigint, number>();
  const ts = (bn: bigint) => timestamps.get(bn) ?? Math.floor(Date.now() / 1000);

  // Build per-token edit maps
  const editsByToken = new Map<number, EditEvent[]>();
  const editCountByToken = new Map<number, number>();
  for (const log of editLogs) {
    const id = Number(log.args.tokenId);
    const event: EditEvent = {
      blockNumber:   Number(log.blockNumber),
      timestamp:     ts(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer as string,
    };
    if (!editsByToken.has(id)) editsByToken.set(id, []);
    editsByToken.get(id)!.push(event);
    editCountByToken.set(id, (editCountByToken.get(id) ?? 0) + 1);
  }
  // Sort each token's edits by block
  for (const [, events] of editsByToken) events.sort((a, b) => a.blockNumber - b.blockNumber);

  // Build per-token burn maps
  const burnsByToken = new Map<number, BurnEvent[]>();
  for (const log of burnLogs) {
    const id = Number(log.args.receiverTokenId);
    const event: BurnEvent = {
      blockNumber:  Number(log.blockNumber),
      timestamp:    ts(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      id,
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner as string,
    };
    if (!burnsByToken.has(id)) burnsByToken.set(id, []);
    burnsByToken.get(id)!.push(event);
  }

  // Fetch normie details for all customized tokens
  const allIds = [...editCountByToken.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH = 15;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => fetchNormieDetails(id, editCountByToken.get(id)!)));
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < allIds.length) await new Promise(r => setTimeout(r, 200));
  }
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const entry: GlobalCache = {
    normies,
    editsByToken,
    burnsByToken,
    scannedAt:   Date.now(),
    latestBlock: Number(latest),
  };
  console.log(`[indexer] Done: ${normies.length} normies, ${editLogs.length} events in ${Date.now()-t0}ms`);
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

/** Per-token history — served from global cache, no extra RPC calls */
export async function getTokenHistory(tokenId: number): Promise<{ edits: EditEvent[]; burns: BurnEvent[] }> {
  const cache = await getCache();
  return {
    edits: cache.editsByToken.get(tokenId) ?? [],
    burns: cache.burnsByToken.get(tokenId) ?? [],
  };
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
