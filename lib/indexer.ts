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
    const type = traits.attributes?.find((a: any) => a.trait_type === "Type")?.value ?? "Human";
    return {
      id, level: info.level ?? 1, ap: info.actionPoints ?? 0,
      added: diff.addedCount ?? 0, removed: diff.removedCount ?? 0,
      editCount, type: String(type),
    };
  } catch { return null; }
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

  // Build normie details
  const allIds  = [...editsByToken.keys()];
  const normies: UpgradedNormie[] = [];
  const BATCH   = 8;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch   = allIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(id => fetchNormieDetails(id, editsByToken.get(id)!.length)));
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < allIds.length) await new Promise(r => setTimeout(r, 1500));
  }
  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);

  const now = Date.now();
  const latestBlock = Number(latest);

  const eventsBlob: EventsBlob = {
    latestBlock,
    savedAt:      now,
    editsByToken: [...editsByToken.entries()],
    burnsByToken: [...burnsByToken.entries()],
  };
  const normiesBlob: NormiesBlob = { normies, savedAt: now, latestBlock };

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
  const existingNormies = (await loadNormiesBlob())?.normies ?? [];
  const normies = existingNormies.filter(n => !toRefresh.has(n.id));

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

  const now         = Date.now();
  const latestBlock = Number(latest);

  const eventsBlob: EventsBlob = {
    latestBlock,
    savedAt:      now,
    editsByToken: [...editsByToken.entries()],
    burnsByToken: [...burnsByToken.entries()],
  };
  const normiesBlob: NormiesBlob = { normies, savedAt: now, latestBlock };

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
  const highestLevel = [...normies].sort((a, b) => b.level - a.level || b.ap - a.ap);
  const mostAp       = [...normies].sort((a, b) => b.ap - a.ap || b.level - a.level);

  return {
    all: normies.map(n => ({
      tokenId: n.id, level: n.level, ap: n.ap,
      added: n.added, removed: n.removed, type: n.type, editCount: n.editCount,
    })),
    mostEdited:   mostEdited.slice(0, 50).map(n => ({ tokenId: n.id, value: n.editCount, label: "edits",  type: n.type })),
    highestLevel: highestLevel.slice(0, 50).map(n => ({ tokenId: n.id, value: n.level,   label: "level",  type: n.type })),
    mostAp:       mostAp.slice(0, 50).map(n => ({ tokenId: n.id, value: n.ap,        label: "AP",    type: n.type })),
    totalCustomized: normies.length,
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
