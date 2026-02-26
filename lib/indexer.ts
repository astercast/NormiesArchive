/**
 * Server-side indexer for NormiesCanvas contract events.
 *
 * Strategy:
 *  - Scan ALL PixelsTransformed events from deploy block → latest
 *  - Build a set of every tokenId that has EVER been transformed
 *  - Cache the result in module-level memory with a TTL
 *  - On cache miss (first call or expired), do a full rescan
 *  - On cache hit, return instantly + trigger background refresh if stale
 *
 * This is called server-side only (API routes), never in the browser.
 * Scanning ~200k blocks in 10k chunks is ~20 RPC calls, takes ~5-10s on first run,
 * then served from memory for TTL_MS.
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

const BASE_API = "https://api.normies.art";

// NormiesCanvas was deployed at block 19,614,531 (verified on Etherscan)
export const CANVAS_DEPLOY_BLOCK = 19_614_531n;

const CHUNK_SIZE = 10_000n;
const TTL_MS = 5 * 60 * 1000; // 5 minutes — live, not stale

export interface UpgradedNormie {
  id: number;
  level: number;
  ap: number;
  added: number;
  removed: number;
  type: string;
  editCount: number; // total number of PixelsTransformed events
}

interface CacheEntry {
  normies: UpgradedNormie[];
  scannedAt: number;
  latestBlock: number;
}

// Module-level cache — persists across requests in the same Node.js process (Vercel warm instance)
let cache: CacheEntry | null = null;
let scanInProgress = false;

// ─── Event scanning ───────────────────────────────────────────────────────────

/**
 * Scan all PixelsTransformed events and return a map of
 * tokenId → { editCount, totalChangeCount }
 */
async function scanTransformEvents(): Promise<Map<number, { editCount: number; totalChangeCount: number }>> {
  const latest = await publicClient.getBlockNumber();
  const tokenMap = new Map<number, { editCount: number; totalChangeCount: number }>();

  const event = parseAbiItem(
    "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
  );

  let from = CANVAS_DEPLOY_BLOCK;
  while (from <= latest) {
    const to = from + CHUNK_SIZE - 1n < latest ? from + CHUNK_SIZE - 1n : latest;
    try {
      const logs = await publicClient.getLogs({
        address: CANVAS_ADDRESS,
        event,
        fromBlock: from,
        toBlock: to,
      });

      for (const log of logs) {
        const id = Number(log.args.tokenId);
        const changeCount = Number(log.args.changeCount);
        const existing = tokenMap.get(id);
        if (existing) {
          existing.editCount++;
          existing.totalChangeCount += changeCount;
        } else {
          tokenMap.set(id, { editCount: 1, totalChangeCount: changeCount });
        }
      }
    } catch (err) {
      console.error(`[indexer] chunk ${from}-${to} failed:`, err);
      // Continue — partial data is better than nothing
    }
    from = to + 1n;
  }

  return tokenMap;
}

/**
 * Fetch live canvas info + diff + traits for a single normie from the API.
 * Returns null if the normie is not customized or fetch fails.
 */
async function fetchNormieDetails(id: number, editCount: number): Promise<UpgradedNormie | null> {
  try {
    const [infoRes, diffRes, traitsRes] = await Promise.all([
      fetch(`${BASE_API}/normie/${id}/canvas/info`, { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/canvas/diff`,  { cache: "no-store" }),
      fetch(`${BASE_API}/normie/${id}/traits`,        { next: { revalidate: 3600 } }),
    ]);

    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    // Double-check: only include if actually customized
    if (!info.customized) return null;

    const diff   = diffRes.ok   ? await diffRes.json()   : { addedCount: 0, removedCount: 0 };
    const traits = traitsRes.ok ? await traitsRes.json() : { attributes: [] };
    const type   = traits.attributes?.find((a: { trait_type: string }) => a.trait_type === "Type")?.value ?? "Human";

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

/**
 * Full rescan: scan events → fetch details for every transformed tokenId.
 * Runs in parallel batches to respect API rate limit (60 req/min).
 */
async function fullRescan(): Promise<CacheEntry> {
  console.log("[indexer] Starting full rescan…");
  const start = Date.now();

  const tokenMap = await scanTransformEvents();
  console.log(`[indexer] Found ${tokenMap.size} unique transformed tokens in ${Date.now() - start}ms`);

  // Fetch details in parallel batches of 10 (well under 60/min rate limit)
  const ids = [...tokenMap.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH = 10;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(id => fetchNormieDetails(id, tokenMap.get(id)!.editCount))
    );
    for (const r of results) {
      if (r) normies.push(r);
    }
    // Small pause between batches to be polite to the API
    if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 150));
  }

  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const entry: CacheEntry = {
    normies,
    scannedAt: Date.now(),
    latestBlock: Number(await publicClient.getBlockNumber()),
  };

  console.log(`[indexer] Rescan complete: ${normies.length} customized normies in ${Date.now() - start}ms`);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get upgraded normies list. Uses cache if fresh, otherwise scans.
 * If cache is stale but exists, returns stale data immediately and
 * kicks off a background refresh.
 */
export async function getUpgradedNormies(): Promise<{
  normies: UpgradedNormie[];
  scannedAt: number;
  latestBlock: number;
  fromCache: boolean;
}> {
  const now = Date.now();
  const cacheAge = cache ? now - cache.scannedAt : Infinity;

  // Fresh cache — return immediately
  if (cache && cacheAge < TTL_MS) {
    return { ...cache, fromCache: true };
  }

  // Stale cache — return stale data NOW, trigger background refresh
  if (cache && !scanInProgress) {
    scanInProgress = true;
    fullRescan()
      .then(entry => { cache = entry; })
      .catch(err => console.error("[indexer] Background rescan failed:", err))
      .finally(() => { scanInProgress = false; });

    return { ...cache, fromCache: true };
  }

  // No cache — must wait for first scan
  if (!scanInProgress) {
    scanInProgress = true;
    try {
      cache = await fullRescan();
    } finally {
      scanInProgress = false;
    }
  } else {
    // Another request is already scanning — wait for it
    while (scanInProgress) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { ...cache!, fromCache: false };
}

/**
 * Get leaderboard data: sorted views of the upgraded normies list.
 */
export async function getLeaderboards() {
  const { normies, scannedAt, latestBlock } = await getUpgradedNormies();

  const byLevel    = [...normies].sort((a, b) => b.level - a.level || b.ap - a.ap);
  const byAP       = [...normies].sort((a, b) => b.ap - a.ap || b.level - a.level);
  const byAdded    = [...normies].sort((a, b) => b.added - a.added || b.level - a.level);
  const byEdits    = [...normies].sort((a, b) => b.editCount - a.editCount || b.level - a.level);
  const byChanged  = [...normies].sort((a, b) => (b.added + b.removed) - (a.added + a.removed));

  return {
    highestLevel:  byLevel.slice(0, 50).map(n => ({ tokenId: n.id, value: n.level,               label: "level",    type: n.type })),
    mostAP:        byAP.slice(0, 50).map(n   => ({ tokenId: n.id, value: n.ap,                   label: "AP",       type: n.type })),
    biggestGlowup: byAdded.slice(0, 50).map(n => ({ tokenId: n.id, value: n.added,               label: "px added", type: n.type })),
    mostEdited:    byEdits.slice(0, 50).map(n => ({ tokenId: n.id, value: n.editCount,           label: "edits",    type: n.type })),
    mostChanged:   byChanged.slice(0, 50).map(n => ({ tokenId: n.id, value: n.added + n.removed, label: "px total", type: n.type })),
    totalCustomized: normies.length,
    scannedAt,
    latestBlock,
  };
}
