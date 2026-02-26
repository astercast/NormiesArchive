/**
 * NormiesCanvas event indexer — server-side only.
 *
 * Speed:
 *  - Block chunks fetched in parallel (8 at a time), not serially
 *  - API detail calls run in parallel batches of 15
 *  - Module-level cache: one scan shared across all concurrent requests
 *  - API routes use stale-while-revalidate so users never wait
 *
 * NormiesCanvas deploy block: 19,614,531 (verified on Etherscan)
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

const BASE_API = "https://api.normies.art";
export const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE     = 20_000n;
const PARALLEL_CHUNKS = 8;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 min

export interface UpgradedNormie {
  id:        number;
  level:     number;
  ap:        number;
  added:     number;
  removed:   number;
  type:      string;
  editCount: number;
}

interface CacheEntry {
  normies:     UpgradedNormie[];
  scannedAt:   number;
  latestBlock: number;
}

let _cache:       CacheEntry | null           = null;
let _scanPromise: Promise<CacheEntry> | null  = null;

// ─── RPC scanning ─────────────────────────────────────────────────────────────

const TRANSFORM_EVENT = parseAbiItem(
  "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
);

async function fetchChunk(from: bigint, to: bigint): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  try {
    const logs = await publicClient.getLogs({
      address: CANVAS_ADDRESS,
      event:   TRANSFORM_EVENT,
      fromBlock: from,
      toBlock:   to,
    });
    for (const log of logs) {
      const id = Number(log.args.tokenId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  } catch (err) {
    console.warn(`[indexer] chunk ${from}-${to} failed:`, (err as Error).message);
  }
  return counts;
}

async function scanAllEvents(): Promise<Map<number, number>> {
  const latest = await publicClient.getBlockNumber();

  const chunks: Array<[bigint, bigint]> = [];
  for (let from = CANVAS_DEPLOY_BLOCK; from <= latest; from += CHUNK_SIZE) {
    const to = from + CHUNK_SIZE - 1n < latest ? from + CHUNK_SIZE - 1n : latest;
    chunks.push([from, to]);
  }

  const merged = new Map<number, number>(); // tokenId → editCount

  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const window = chunks.slice(i, i + PARALLEL_CHUNKS);
    const results = await Promise.all(window.map(([f, t]) => fetchChunk(f, t)));
    for (const chunkMap of results) {
      for (const [id, count] of chunkMap) {
        merged.set(id, (merged.get(id) ?? 0) + count);
      }
    }
  }

  return merged;
}

// ─── API detail fetching ──────────────────────────────────────────────────────

async function fetchNormieDetails(id: number, editCount: number): Promise<UpgradedNormie | null> {
  try {
    const [infoRes, diffRes, traitsRes] = await Promise.all([
      fetch(`${BASE_API}/normie/${id}/canvas/info`, { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/canvas/diff`,  { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/traits`,        { next: { revalidate: 3600 } }),
    ]);

    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    if (!info.customized) return null;

    const diff   = diffRes.ok   ? await diffRes.json()   : { addedCount: 0, removedCount: 0 };
    const traits = traitsRes.ok ? await traitsRes.json() : { attributes: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type   = traits.attributes?.find((a: any) => a.trait_type === "Type")?.value ?? "Human";

    return {
      id,
      level:     info.level        ?? 1,
      ap:        info.actionPoints ?? 0,
      added:     diff.addedCount   ?? 0,
      removed:   diff.removedCount ?? 0,
      editCount,
      type:      String(type),
    };
  } catch {
    return null;
  }
}

async function fetchAllDetails(tokenMap: Map<number, number>): Promise<UpgradedNormie[]> {
  const ids     = [...tokenMap.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH   = 15;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch   = ids.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(id => fetchNormieDetails(id, tokenMap.get(id)!))
    );
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 200));
  }

  return normies;
}

// ─── Full scan ────────────────────────────────────────────────────────────────

async function doFullScan(): Promise<CacheEntry> {
  console.log("[indexer] Starting full scan…");
  const t0 = Date.now();

  const tokenMap = await scanAllEvents();
  console.log(`[indexer] ${tokenMap.size} unique transformed tokens in ${Date.now() - t0}ms`);

  const normies = await fetchAllDetails(tokenMap);
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const entry: CacheEntry = {
    normies,
    scannedAt:   Date.now(),
    latestBlock: Number(await publicClient.getBlockNumber()),
  };
  console.log(`[indexer] Done: ${normies.length} customized normies in ${Date.now() - t0}ms`);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getUpgradedNormies(): Promise<CacheEntry & { fromCache: boolean }> {
  const now = Date.now();

  // Fresh cache — return immediately
  if (_cache && now - _cache.scannedAt < CACHE_TTL_MS) {
    return { ..._cache, fromCache: true };
  }

  // Kick off background scan if not already running
  if (!_scanPromise) {
    _scanPromise = doFullScan()
      .then(entry => { _cache = entry; return entry; })
      .finally(() => { _scanPromise = null; });
  }

  // Stale cache — return immediately, scan updates in background
  if (_cache) return { ..._cache, fromCache: true };

  // No cache at all — must wait
  const entry = await _scanPromise;
  return { ...entry, fromCache: false };
}

/**
 * Returns everything needed for both the leaderboard page
 * and the homepage (spotlight + explore grid).
 */
export async function getLeaderboards() {
  const { normies, scannedAt, latestBlock } = await getUpgradedNormies();

  const mostEdited   = [...normies].sort((a, b) => b.editCount - a.editCount || b.level - a.level);
  const highestLevel = [...normies].sort((a, b) => b.level - a.level || b.ap - a.ap);

  return {
    // Full list sorted by level — used by homepage explore grid + spotlight
    all: normies.map(n => ({
      tokenId:   n.id,
      level:     n.level,
      ap:        n.ap,
      added:     n.added,
      removed:   n.removed,
      type:      n.type,
      editCount: n.editCount,
    })),
    // Leaderboard tabs
    mostEdited:   mostEdited.slice(0, 50).map(n => ({
      tokenId: n.id, value: n.editCount, label: "edits", type: n.type,
    })),
    highestLevel: highestLevel.slice(0, 50).map(n => ({
      tokenId: n.id, value: n.level,     label: "level", type: n.type,
    })),
    totalCustomized: normies.length,
    scannedAt,
    latestBlock,
  };
}
