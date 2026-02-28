/**
 * Standalone indexer script — runs via GitHub Actions on a schedule.
 * Scans Ethereum for NormiesCanvas events, fetches normie details,
 * and writes the result to Vercel Blob storage.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=xxx node scripts/indexer.mjs
 *
 * Required env vars:
 *   BLOB_READ_WRITE_TOKEN  — from your Vercel project's Storage settings
 *
 * Optional env vars:
 *   ETHEREUM_RPC_URL       — custom RPC (Alchemy/Infura recommended)
 */

import { createPublicClient, http, fallback, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";
import { put, head } from "@vercel/blob";

// ─── Config ───────────────────────────────────────────────────────────────────

const CANVAS_ADDRESS      = "0x64951d92e345C50381267380e2975f66810E869c";
const CANVAS_DEPLOY_BLOCK = 19_614_531n;
const CHUNK_SIZE          = 50_000n;
const PARALLEL_CHUNKS     = 12;
const BASE_API            = "https://api.normies.art";
const EVENTS_KEY          = "normies-index/events.json";
const NORMIES_KEY         = "normies-index/normies.json";

const RPC_URLS = [
  process.env.ETHEREUM_RPC_URL,
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com",
].filter(Boolean);

const client = createPublicClient({
  chain: mainnet,
  transport: fallback(
    RPC_URLS.map(url => http(url, { timeout: 15_000 })),
    { rank: false, retryCount: 3 }
  ),
  batch: { multicall: true },
});

// ─── ABI events ───────────────────────────────────────────────────────────────

const TRANSFORM_EVENT = parseAbiItem(
  "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
);
const BURN_EVENT = parseAbiItem(
  "event BurnRevealed(uint256 indexed commitId, address indexed owner, uint256 indexed receiverTokenId, uint256 totalActions, bool expired)"
);

// ─── Blob helpers ─────────────────────────────────────────────────────────────

async function blobGet(key) {
  try {
    const info = await head(key);
    if (!info) return null;
    const res = await fetch(info.url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function blobPut(key, data) {
  await put(key, JSON.stringify(data), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

// ─── Blockchain scanning ──────────────────────────────────────────────────────

async function fetchChunk(from, to, event, attempt = 0) {
  try {
    return await client.getLogs({ address: CANVAS_ADDRESS, event, fromBlock: from, toBlock: to });
  } catch (err) {
    if (attempt < 3) {
      await sleep(800 * (attempt + 1));
      return fetchChunk(from, to, event, attempt + 1);
    }
    console.warn(`  chunk ${from}-${to} failed after retries:`, err.message);
    return [];
  }
}

async function scanRange(from, to, event) {
  if (from > to) return [];
  const chunks = [];
  for (let f = from; f <= to; f += CHUNK_SIZE) {
    chunks.push([f, f + CHUNK_SIZE - 1n < to ? f + CHUNK_SIZE - 1n : to]);
  }
  console.log(`  scanning ${chunks.length} chunks (${from}–${to})…`);
  const all = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + PARALLEL_CHUNKS);
    const results = await Promise.all(batch.map(([f, t]) => fetchChunk(f, t, event)));
    for (const r of results) all.push(...r);
  }
  return all;
}

// ─── API fetching ─────────────────────────────────────────────────────────────

async function fetchWithRetry(url, attempt = 0) {
  try {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 5) {
      const wait = parseInt(res.headers.get("Retry-After") ?? "3", 10);
      console.log(`  rate limited, waiting ${wait * (attempt + 1)}s…`);
      await sleep((wait || 3) * 1000 * (attempt + 1));
      return fetchWithRetry(url, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

async function fetchNormieDetails(id, editCount) {
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
    const type   = traits.attributes?.find(a => a.trait_type === "Type")?.value ?? "Human";
    return {
      id, level: info.level ?? 1, ap: info.actionPoints ?? 0,
      added: diff.addedCount ?? 0, removed: diff.removedCount ?? 0,
      editCount, type: String(type),
    };
  } catch (err) {
    console.warn(`  fetchNormieDetails(${id}) failed:`, err.message);
    return null;
  }
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

function mergeEditLogs(editsByToken, logs) {
  const touched = new Set();
  for (const log of logs) {
    const id = Number(log.args.tokenId);
    if (!editsByToken.has(id)) editsByToken.set(id, []);
    editsByToken.get(id).push({
      blockNumber:   Number(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer,
    });
    touched.add(id);
  }
  for (const id of touched) {
    editsByToken.get(id).sort((a, b) => a.blockNumber - b.blockNumber);
  }
  return touched;
}

function mergeBurnLogs(burnsByToken, logs) {
  const touched = new Set();
  for (const log of logs) {
    const id = Number(log.args.receiverTokenId);
    if (!burnsByToken.has(id)) burnsByToken.set(id, []);
    burnsByToken.get(id).push({
      blockNumber:  Number(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      id,
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner,
    });
    touched.add(id);
  }
  return touched;
}


// ─── Block timestamp fetching ─────────────────────────────────────────────────

async function fetchTimestamps(blockNumbers, existingTimestamps = new Map()) {
  const unique  = [...new Set(blockNumbers)].filter(b => !existingTimestamps.has(b));
  if (unique.length === 0) return existingTimestamps;

  console.log(`  fetching timestamps for ${unique.length} unique blocks…`);
  const result  = new Map(existingTimestamps);
  const BATCH   = 20;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async bn => {
        const block = await client.getBlock({ blockNumber: BigInt(bn) });
        return { bn, ts: Number(block.timestamp) };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") result.set(r.value.bn, r.value.ts);
    }
    if (i + BATCH < unique.length) await sleep(100);
  }

  console.log(`  resolved ${result.size} timestamps`);
  return result;
}

// ─── Normie details batch fetcher ─────────────────────────────────────────────

async function fetchNormiesBatch(ids, editsByToken) {
  const normies = [];
  const BATCH = 8;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch   = ids.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(id => fetchNormieDetails(id, editsByToken.get(id)?.length ?? 0))
    );
    for (const r of results) { if (r) normies.push(r); }
    if (i + BATCH < ids.length) await sleep(1500);
    if (i % 80 === 0 && i > 0) console.log(`  fetched details for ${i}/${ids.length} normies…`);
  }
  return normies;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("=== Normies Indexer ===");
  console.log(`Started: ${new Date().toISOString()}`);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("ERROR: BLOB_READ_WRITE_TOKEN is not set");
    process.exit(1);
  }

  // Load existing blob
  console.log("\n[1/5] Loading existing index from Blob…");
  const existing = await blobGet(EVENTS_KEY);

  const latest = await client.getBlockNumber();
  console.log(`      Chain head: block ${latest}`);

  let editsByToken = new Map();
  let burnsByToken = new Map();
  let fromBlock    = CANVAS_DEPLOY_BLOCK;
  let isIncremental = false;

  if (existing) {
    editsByToken  = new Map(existing.editsByToken);
    burnsByToken  = new Map(existing.burnsByToken);
    fromBlock     = BigInt(existing.latestBlock + 1);
    isIncremental = true;
    console.log(`      Found existing index at block ${existing.latestBlock}`);
    console.log(`      Scanning ${Number(latest - fromBlock)} new blocks…`);
  } else {
    console.log("      No existing index — running full scan from deploy block");
  }

  if (fromBlock > latest) {
    console.log("\n      Nothing new. Index is up to date.");
    process.exit(0);
  }

  // Scan new events
  console.log("\n[2/5] Scanning blockchain events…");
  const [editLogs, burnLogs] = await Promise.all([
    scanRange(fromBlock, latest, TRANSFORM_EVENT),
    scanRange(fromBlock, latest, BURN_EVENT),
  ]);
  console.log(`      Found ${editLogs.length} new edit events, ${burnLogs.length} new burn events`);

  const touchedEdits = mergeEditLogs(editsByToken, editLogs);
  const touchedBurns = mergeBurnLogs(burnsByToken, burnLogs);
  const toRefresh    = new Set([...touchedEdits, ...touchedBurns]);

  // Fetch normie details
  console.log(`\n[3/5] Fetching normie details for ${toRefresh.size} token(s)…`);
  let normies = [];

  if (isIncremental && toRefresh.size > 0) {
    const existingNormies = (await blobGet(NORMIES_KEY))?.normies ?? [];
    normies = existingNormies.filter(n => !toRefresh.has(n.id));
    const refreshed = await fetchNormiesBatch([...toRefresh], editsByToken);
    normies.push(...refreshed);
  } else if (!isIncremental) {
    normies = await fetchNormiesBatch([...editsByToken.keys()], editsByToken);
  } else {
    // Incremental but nothing changed — keep existing normies
    normies = (await blobGet(NORMIES_KEY))?.normies ?? [];
  }

  normies.sort((a, b) => b.level - a.level || b.ap - a.ap);
  console.log(`      Total customized normies: ${normies.length}`);

  // Write to Blob
  
  const now         = Date.now();
  const latestBlock = Number(latest);

  // Collect all block numbers from all events and fetch their timestamps
  console.log("\n[4/5] Fetching block timestamps…");
  const allBlockNums = [];
  for (const events of editsByToken.values()) for (const e of events) allBlockNums.push(e.blockNumber);
  for (const events of burnsByToken.values()) for (const e of events) allBlockNums.push(e.blockNumber);
  const existingTs = existing?.timestamps ? new Map(existing.timestamps) : new Map();
  const timestamps = await fetchTimestamps(allBlockNums, existingTs);

  console.log("\n[5/5] Writing to Vercel Blob…");
  await Promise.all([
    blobPut(EVENTS_KEY, {
      latestBlock,
      savedAt:      now,
      editsByToken: [...editsByToken.entries()],
      burnsByToken: [...burnsByToken.entries()],
      timestamps:   [...timestamps.entries()],
    }),
    blobPut(NORMIES_KEY, {
      normies,
      savedAt:  now,
      latestBlock,
    }),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s`);
  console.log(`  Block: ${latestBlock}`);
  console.log(`  Normies: ${normies.length}`);
  console.log(`  Mode: ${isIncremental ? "incremental" : "full scan"}`);
  if (toRefresh.size > 0) console.log(`  Tokens refreshed: ${toRefresh.size}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
