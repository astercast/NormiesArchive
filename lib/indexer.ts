/**
 * Global event indexer — server-side only.
 *
 * PRIMARY PATH (normal operation):
 *   Reads pre-built data from Vercel Blob (written by the cron job).
 *   Cold starts are instant — no blockchain scanning on user requests.
 *
 * FALLBACK PATH (first deploy / blob empty):
 *   Falls back to a full in-memory scan if the blob doesn't exist yet.
 *   The cron job (/api/cron/index) then takes over and keeps blob fresh.
 *
 * INCREMENTAL UPDATES:
 *   The cron job scans only blocks since latestBlock, merges new events,
 *   and writes updated blobs. Blob reads on user requests are always instant.
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";
import {
  loadEventsBlob,
  loadNormiesBlob,
  saveEventsBlob,
  saveNormiesBlob,
  type EventsBlob,
  type NormiesBlob,
  type RawEditEvent,
  type RawBurnEvent,
  type UpgradedNormie,
} from "./blobStore";

export { type UpgradedNormie } from "./blobStore";

export const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE      = 50_000n;
const PARALLEL_CHUNKS = 12;
const CACHE_TTL_MS    = 10 * 60 * 1000; // 10 min in-memory TTL

// ─── Public types ─────────────────────────────────────────────────────────────

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

// ─── In-memory cache (avoids re-reading blob on every request) ────────────────

interface MemCache {
  editsByToken:   Map<number, RawEditEvent[]>;
  burnsByToken:   Map<number, RawBurnEvent[]>;
  normies:        UpgradedNormie[];
  latestBlock:    number;
  loadedAt:       number;
  blobTimestamps: Map<number, number>; // pre-fetched by indexer script
}

let _mem:         MemCache | null          = null;
let _loadPromise: Promise<MemCache> | null = null;

// ─── Block timestamps ─────────────────────────────────────────────────────────

const tsCache      = new Map<number, number>();
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
      const batch   = missing.slice(i, i + TS_BATCH_SIZE);
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

// ─── Blockchain scanning ──────────────────────────────────────────────────────

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
    console.warn(`[indexer] chunk ${from}-${to} failed:`, err);
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

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise(r => setTimeout(r, (retryAfter || 2) * 1000 * (attempt + 1)));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

async function fetchNormieDetails(id: number, editCount: number): Promise<UpgradedNormie | null> {
  const fallback: UpgradedNormie = { id, level: 1, ap: 0, added: 0, removed: 0, pixelCount: 0, editCount, type: "Human" };
  try {
    const [infoRes, diffRes, metaRes] = await Promise.all([
      fetchWithRetry(`${BASE_API}/normie/${id}/canvas/info`),
      fetchWithRetry(`${BASE_API}/normie/${id}/canvas/diff`),
      fetchWithRetry(`${BASE_API}/normie/${id}/metadata`),
    ]);
    // 404 = token truly not found; other errors → keep fallback so the normie isn't dropped
    if (infoRes.status === 404) return null;
    if (!infoRes.ok) {
      console.warn(`[indexer] canvas/info ${id} returned ${infoRes.status} — using fallback`);
      return fallback;
    }
    const info = await infoRes.json();
    if (!info.customized) return null; // canvas reset to all-zeros: genuinely un-customized
    const diff = diffRes.ok ? await diffRes.json() : { addedCount: 0, removedCount: 0 };
    const meta = metaRes.ok ? await metaRes.json() : { attributes: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = meta.attributes ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type       = attrs.find((a: any) => a.trait_type === "Type")?.value ?? "Human";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pixelCount = Number(attrs.find((a: any) => a.trait_type === "Pixel Count")?.value ?? 0);
    return {
      id, level: info.level ?? 1, ap: info.actionPoints ?? 0,
      added: diff.addedCount ?? 0, removed: diff.removedCount ?? 0,
      pixelCount, editCount, type: String(type),
    };
  } catch (err) {
    console.warn(`[indexer] fetchNormieDetails(${id}) threw — using fallback:`, err);
    return fallback;
  }
}

// Fetch canvas info + traits for a normie that received burns but hasn't edited pixels.
// Does NOT require customized=true — just needs AP > 0 to confirm burns happened.
async function fetchBurnOnlyNormie(id: number): Promise<UpgradedNormie | null> {
  try {
    const [infoRes, metaRes] = await Promise.all([
      fetchWithRetry(`${BASE_API}/normie/${id}/canvas/info`),
      fetchWithRetry(`${BASE_API}/normie/${id}/metadata`),
    ]);
    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    if ((info.actionPoints ?? 0) === 0) return null; // no AP = burns haven't been revealed yet
    const meta = metaRes.ok ? await metaRes.json() : { attributes: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = meta.attributes ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type       = attrs.find((a: any) => a.trait_type === "Type")?.value ?? "Human";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pixelCount = Number(attrs.find((a: any) => a.trait_type === "Pixel Count")?.value ?? 0);
    return { id, level: info.level ?? 1, ap: info.actionPoints, added: 0, removed: 0, pixelCount, editCount: 0, type: String(type) };
  } catch { return null; }
}

const NORMIES_NFT_ADDRESS = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as const;
const TOTAL_SUPPLY_ABI = [{ name: "totalSupply", type: "function", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }] as const;

/** Fetch Pixel Count + Type from metadata for the given IDs.
 *  existing: carry-forward from previous blob (will be overwritten for ids in allIds).
 */
async function fetchAllPixelCounts(
  allIds: number[],
  existing?: Map<number, [number, string]>,
): Promise<Map<number, [number, string]>> {
  const counts = new Map<number, [number, string]>(existing ?? []);
  const BATCH = 50;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async id => {
      const res = await fetchWithRetry(`${BASE_API}/normie/${id}/metadata`);
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = await res.json() as { attributes?: any[] };
      const attrs = d.attributes ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pixelCount = Number(attrs.find((a: any) => a.trait_type === "Pixel Count")?.value ?? 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const type = String(attrs.find((a: any) => a.trait_type === "Type")?.value ?? "Human");
      return [id, pixelCount, type] as [number, number, string];
    }));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) counts.set(r.value[0], [r.value[1], r.value[2]]);
    }
    // Brief pause every 10 batches (500 tokens) to avoid rate-limiting
    if (i + BATCH < allIds.length && (i / BATCH) % 10 === 9) {
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return counts;
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

function mergeEditLogs(editsByToken: Map<number, RawEditEvent[]>, logs: RawLog[]): Set<number> {
  const touched = new Set<number>();
  for (const log of logs) {
    const id = Number(log.args.tokenId);
    if (!editsByToken.has(id)) editsByToken.set(id, []);
    editsByToken.get(id)!.push({
      blockNumber:   Number(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer as string,
    });
    touched.add(id);
  }
  for (const id of touched) {
    editsByToken.get(id)!.sort((a, b) => a.blockNumber - b.blockNumber);
  }
  return touched;
}

function mergeBurnLogs(burnsByToken: Map<number, RawBurnEvent[]>, logs: RawLog[]): Set<number> {
  const touched = new Set<number>();
  for (const log of logs) {
    const id = Number(log.args.receiverTokenId);
    if (!burnsByToken.has(id)) burnsByToken.set(id, []);
    burnsByToken.get(id)!.push({
      blockNumber:  Number(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      id,
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner as string,
    });
    touched.add(id);
  }
  return touched;
}

// ─── Full scan (used by cron on first run) ────────────────────────────────────

export async function runFullScan(): Promise<{ eventsBlob: EventsBlob; normiesBlob: NormiesBlob }> {
  console.log("[indexer] Full scan starting…");
  const t0     = Date.now();
  const latest = await publicClient.getBlockNumber();

  const [editLogs, burnLogs] = await Promise.all([
    scanRange(CANVAS_DEPLOY_BLOCK, latest, TRANSFORM_EVENT),
    scanRange(CANVAS_DEPLOY_BLOCK, latest, BURN_EVENT),
  ]);
  console.log(`[indexer] ${editLogs.length} edit logs, ${burnLogs.length} burn logs in ${Date.now() - t0}ms`);

  const editsByToken = new Map<number, RawEditEvent[]>();
  const burnsByToken = new Map<number, RawBurnEvent[]>();
  mergeEditLogs(editsByToken, editLogs);
  mergeBurnLogs(burnsByToken, burnLogs);

  // Build normie details — pixel-edited normies first
  const allIds  = [...editsByToken.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH   = 8;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch   = allIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => fetchNormieDetails(id, editsByToken.get(id)!.length)));
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < allIds.length) await new Promise(r => setTimeout(r, 1500));
  }

  // Also include normies that only received burns (have AP but haven't edited pixels yet)
  const editedIds = new Set(normies.map(n => n.id));
  const burnOnlyIds = [...burnsByToken.keys()].filter(id => !editedIds.has(id));
  for (let i = 0; i < burnOnlyIds.length; i += BATCH) {
    const batch   = burnOnlyIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => fetchBurnOnlyNormie(id)));
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < burnOnlyIds.length) await new Promise(r => setTimeout(r, 1500));
  }

  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  // Build full pixel leaderboard — scan ALL minted normies (not just event-indexed ones)
  const totalSupply = await publicClient.readContract({
    address: NORMIES_NFT_ADDRESS,
    abi: TOTAL_SUPPLY_ABI,
    functionName: "totalSupply",
  }) as bigint;
  const allNormieIds = Array.from({ length: Number(totalSupply) }, (_, i) => i + 1);
  console.log(`[indexer] Scanning pixel counts for ${allNormieIds.length} normies…`);
  const pixelMap = await fetchAllPixelCounts(allNormieIds);
  const pixelCounts: Array<[number, number, string]> = [...pixelMap.entries()].map(([id, [pc, type]]) => [id, pc, type]);
  console.log(`[indexer] Pixel counts fetched: ${pixelCounts.length} normies`);

  const now = Date.now();
  const latestBlock = Number(latest);

  const eventsBlob: EventsBlob = {
    latestBlock,
    savedAt:      now,
    editsByToken: [...editsByToken.entries()],
    burnsByToken: [...burnsByToken.entries()],
  };
  const normiesBlob: NormiesBlob = { normies, savedAt: now, latestBlock, pixelCounts };

  console.log(`[indexer] Full scan done: ${normies.length} normies, block ${latestBlock} in ${Date.now() - t0}ms`);
  return { eventsBlob, normiesBlob };
}

// ─── Incremental scan (used by cron on subsequent runs) ───────────────────────

export async function runIncrementalScan(existing: EventsBlob): Promise<{ eventsBlob: EventsBlob; normiesBlob: NormiesBlob; changed: boolean }> {
  const fromBlock = BigInt(existing.latestBlock + 1);
  const latest    = await publicClient.getBlockNumber();

  if (fromBlock > latest) {
    console.log(`[indexer] Incremental: nothing new (head=${latest})`);
    // Reload normies blob as-is, just update timestamp
    const nb = await loadNormiesBlob();
    return {
      eventsBlob:  { ...existing, savedAt: Date.now() },
      normiesBlob: nb ?? { normies: [], savedAt: Date.now(), latestBlock: Number(latest) },
      changed:     false,
    };
  }

  console.log(`[indexer] Incremental scan ${fromBlock}–${latest}…`);
  const t0 = Date.now();

  const [editLogs, burnLogs] = await Promise.all([
    scanRange(fromBlock, latest, TRANSFORM_EVENT),
    scanRange(fromBlock, latest, BURN_EVENT),
  ]);

  if (editLogs.length === 0 && burnLogs.length === 0) {
    console.log(`[indexer] Incremental: 0 new events (${Date.now() - t0}ms)`);
    const nb = await loadNormiesBlob();
    const updatedEvents: EventsBlob = { ...existing, latestBlock: Number(latest), savedAt: Date.now() };
    return {
      eventsBlob:  updatedEvents,
      normiesBlob: nb ?? { normies: [], savedAt: Date.now(), latestBlock: Number(latest) },
      changed:     false,
    };
  }

  console.log(`[indexer] Incremental: ${editLogs.length} edits, ${burnLogs.length} burns (${Date.now() - t0}ms)`);

  // Reconstruct maps from stored entries
  const editsByToken = new Map<number, RawEditEvent[]>(existing.editsByToken);
  const burnsByToken = new Map<number, RawBurnEvent[]>(existing.burnsByToken);

  const touchedEdits = mergeEditLogs(editsByToken, editLogs);
  const touchedBurns = mergeBurnLogs(burnsByToken, burnLogs);
  const toRefresh    = new Set([...touchedEdits, ...touchedBurns]);

  // Load existing normies, replace only the ones that changed
  const existingNormiesBlob = await loadNormiesBlob();
  const existingNormies = existingNormiesBlob?.normies ?? [];
  const normies = existingNormies.filter(n => !toRefresh.has(n.id));

  const toFetch = [...toRefresh];
  const BATCH   = 8;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch   = toFetch.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(id =>
        editsByToken.has(id)
          ? fetchNormieDetails(id, editsByToken.get(id)!.length)
          : fetchBurnOnlyNormie(id)
      )
    );
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 1500));
  }
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  // Update pixel counts — only re-fetch changed IDs, carry forward the rest
  const existingPixelMap = new Map<number, [number, string]>(
    (existingNormiesBlob?.pixelCounts ?? []).map(([id, pc, type]) => [id, [pc, type] as [number, string]])
  );
  const updatedPixelMap = await fetchAllPixelCounts([...toRefresh], existingPixelMap);
  const pixelCounts: Array<[number, number, string]> = [...updatedPixelMap.entries()].map(([id, [pc, type]]) => [id, pc, type]);

  const now         = Date.now();
  const latestBlock = Number(latest);

  const eventsBlob: EventsBlob = {
    latestBlock,
    savedAt:      now,
    editsByToken: [...editsByToken.entries()],
    burnsByToken: [...burnsByToken.entries()],
  };
  const normiesBlob: NormiesBlob = { normies, savedAt: now, latestBlock, pixelCounts };

  console.log(`[indexer] Incremental done: ${toRefresh.size} tokens refreshed, block ${latestBlock}`);
  return { eventsBlob, normiesBlob, changed: true };
}

// ─── In-memory cache loader (reads from blob) ─────────────────────────────────

async function loadMemCache(): Promise<MemCache> {
  const [eventsBlob, normiesBlob] = await Promise.all([
    loadEventsBlob(),
    loadNormiesBlob(),
  ]);

  if (!eventsBlob || !normiesBlob) {
    // Blob not populated yet — return empty cache.
    // The cron job at /api/cron/index will populate it on first run.
    // Do NOT do a fallback scan here — that would run at build time and fail.
    console.warn("[indexer] Blob empty — returning empty cache. Run /api/cron/index to populate.");
    return {
      editsByToken:   new Map(),
      burnsByToken:   new Map(),
      normies:        [],
      latestBlock:    Number(CANVAS_DEPLOY_BLOCK),
      loadedAt:       Date.now(),
      blobTimestamps: new Map(),
    };
  }

  return {
    editsByToken:   new Map(eventsBlob.editsByToken),
    burnsByToken:   new Map(eventsBlob.burnsByToken),
    normies:        normiesBlob.normies,
    latestBlock:    eventsBlob.latestBlock,
    loadedAt:       Date.now(),
    blobTimestamps: new Map(eventsBlob.timestamps ?? []),
  };
}

async function getCache(): Promise<MemCache> {
  const now = Date.now();

  // Still fresh
  if (_mem && now - _mem.loadedAt < CACHE_TTL_MS) return _mem;

  // Already loading
  if (_loadPromise) return _mem ?? _loadPromise;

  _loadPromise = loadMemCache()
    .then(m => { _mem = m; return m; })
    .catch(err => {
      console.error("[indexer] cache load failed:", err);
      if (_mem) return _mem;
      throw err;
    })
    .finally(() => { _loadPromise = null; });

  return _mem ?? _loadPromise;
}

// ─── Public exports (identical signatures to before) ─────────────────────────

/** Returns burn count (number of normies burned INTO each token) for the given token IDs. */
export async function getBurnCounts(tokenIds: number[]): Promise<Map<number, number>> {
  const cache = await getCache();
  const result = new Map<number, number>();
  for (const id of tokenIds) {
    result.set(id, cache.burnsByToken.get(id)?.length ?? 0);
  }
  return result;
}

/** Returns the total number of non-expired burns performed BY a given wallet address.
 *  Primary: Ponder API (/history/burns?owner=...) — same indexer the rest of the site
 *  uses. Each row has tokenCount (normies burned in that commit) and expired flag.
 *  Fallback: topic-filtered getLogs scan (slower, public RPCs may drop chunks). */
export async function getBurnsDoneByAddress(address: string): Promise<number> {
  const PONDER = "https://api.normies.art";

  // Primary: Ponder API
  try {
    let count = 0;
    let offset = 0;
    const LIMIT = 100; // API hard-caps at 100 per page
    while (true) {
      const res = await fetch(
        `${PONDER}/history/burns/address/${address}?limit=${LIMIT}&offset=${offset}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Ponder ${res.status}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await res.json();
      for (const r of rows) {
        if (!r.expired) count += Number(r.tokenCount ?? 1);
      }
      if (rows.length < LIMIT) break;
      offset += LIMIT;
    }
    return count;
  } catch (err) {
    console.warn("[getBurnsDoneByAddress] Ponder API failed, falling back to getLogs:", err);
  }

  // Fallback: topic-filtered getLogs across the full block range
  const CHUNK    = 50_000n;
  const PARALLEL = 12;
  const latest   = await publicClient.getBlockNumber();

  const chunks: Array<[bigint, bigint]> = [];
  for (let f = CANVAS_DEPLOY_BLOCK; f <= latest; f += CHUNK) {
    chunks.push([f, f + CHUNK - 1n < latest ? f + CHUNK - 1n : latest]);
  }

  let count = 0;
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const results = await Promise.allSettled(
      chunks.slice(i, i + PARALLEL).map(([from, to]) =>
        publicClient.getLogs({
          address:   CANVAS_ADDRESS,
          event:     BURN_EVENT,
          args:      { owner: address as `0x${string}` },
          fromBlock: from,
          toBlock:   to,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const log of r.value) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(log as any).args.expired) count++;
        }
      }
    }
  }
  return count;
}

/**
 * Returns the most recently recorded lit-pixel count per token.
 * Edited normies: uses the last edit event's newPixelCount (in-memory, instant).
 * Unedited normies: returns null — caller should fetch from the Normies API.
 */
export async function getLastPixelCounts(tokenIds: number[]): Promise<Map<number, number | null>> {
  const cache = await getCache();
  const result = new Map<number, number | null>();
  for (const id of tokenIds) {
    const events = cache.editsByToken.get(id);
    result.set(id, events && events.length > 0 ? events[events.length - 1].newPixelCount : null);
  }
  return result;
}

export async function getTokenHistory(tokenId: number): Promise<{ edits: EditEvent[]; burns: BurnEvent[] }> {
  const cache    = await getCache();
  const rawEdits = cache.editsByToken.get(tokenId) ?? [];
  const rawBurns = cache.burnsByToken.get(tokenId) ?? [];

  if (rawEdits.length === 0 && rawBurns.length === 0) return { edits: [], burns: [] };

  const allBlocks = [...rawEdits.map(e => e.blockNumber), ...rawBurns.map(b => b.blockNumber)];

  // Seed tsCache from pre-fetched blob timestamps — avoids RPC calls for known blocks
  for (const [bn, ts] of cache.blobTimestamps) {
    if (!tsCache.has(bn)) tsCache.set(bn, ts);
  }

  // Only hit RPC for blocks not already cached
  const missing = allBlocks.filter(b => !tsCache.has(b));
  let timestamps: Map<number, number>;
  try {
    if (missing.length > 0) {
      await Promise.race([
        resolveTimestamps(missing),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ts timeout")), 25_000)),
      ]);
    }
    timestamps = new Map(allBlocks.map(b => [b, tsCache.get(b) ?? Math.floor(Date.now() / 1000)]));
  } catch (err) {
    console.warn(`[history/${tokenId}] timestamp fallback:`, err);
    timestamps = new Map(allBlocks.map(b => [b, tsCache.get(b) ?? Math.floor(Date.now() / 1000)]));
  }

  const ts = (bn: number) => timestamps.get(bn) ?? Math.floor(Date.now() / 1000);
  return {
    edits: rawEdits.map(e => ({ ...e, timestamp: ts(e.blockNumber) })),
    burns: rawBurns.map(b => ({ ...b, timestamp: ts(b.blockNumber) })),
  };
}

export async function getLeaderboards() {
  const cache = await getCache();
  const { normies, latestBlock } = cache;

  // Use normies blob savedAt as scannedAt
  const normiesBlob = await loadNormiesBlob().catch(() => null);
  const scannedAt   = normiesBlob?.savedAt ?? Date.now();

  const mostEdited   = [...normies].sort((a, b) => b.editCount - a.editCount || b.level - a.level);
  const highestLevel = [...normies].sort((a, b) => b.level - a.level || b.editCount - a.editCount);

  // mostPixels: use full pixel scan (all minted normies) if available, else fall back to indexed normies only
  let mostPixelsList: Array<{ tokenId: number; value: number; label: string; type: string }>;
  if (normiesBlob?.pixelCounts && normiesBlob.pixelCounts.length > 0) {
    mostPixelsList = [...normiesBlob.pixelCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([tokenId, value, type]) => ({ tokenId, value, label: "pixels", type }));
  } else {
    // Fallback: indexed normies only (pre-full-rescan)
    const sorted = [...normies].sort((a, b) => (b.pixelCount ?? b.added) - (a.pixelCount ?? a.added) || b.editCount - a.editCount);
    mostPixelsList = sorted.filter(n => (n.pixelCount ?? n.added) > 0).slice(0, 50).map(n => ({ tokenId: n.id, value: n.pixelCount ?? n.added, label: "pixels", type: n.type }));
  }

  return {
    all: normies.map(n => ({
      tokenId: n.id, level: n.level, ap: n.ap,
      added: n.added, removed: n.removed, type: n.type, editCount: n.editCount,
    })),
    mostEdited:   mostEdited.filter(n => n.editCount > 0).slice(0, 50).map(n => ({ tokenId: n.id, value: n.editCount, label: "edits",   type: n.type })),
    highestLevel: highestLevel.filter(n => n.level > 1).slice(0, 50).map(n => ({ tokenId: n.id, value: n.level,   label: "level",   type: n.type })),
    mostPixels:   mostPixelsList,
    totalCustomized: new Set([...cache.editsByToken.keys(), ...cache.burnsByToken.keys()]).size,
    scannedAt,
    latestBlock,
  };
}

export async function getUpgradedNormies() {
  const cache = await getCache();
  return { normies: cache.normies, scannedAt: Date.now(), latestBlock: cache.latestBlock, fromCache: true };
}

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
  const normiesBlob = await loadNormiesBlob().catch(() => null);

  return {
    entries:     pioneers.slice(0, 100).map((p, i) => ({ ...p, rank: i + 1 })),
    scannedAt:   normiesBlob?.savedAt ?? Date.now(),
    latestBlock: cache.latestBlock,
  };
}
