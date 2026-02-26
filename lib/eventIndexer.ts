/**
 * Per-token event history fetcher.
 *
 * Problem: public RPCs cap getLogs to ~10k-50k blocks per call.
 * Scanning from block 19,600,000 to ~22,000,000 (2.4M blocks) in one call fails.
 *
 * Solution:
 *  1. Chunk getLogs into 50k-block windows, run in parallel batches of 5
 *  2. Cache results in module memory per tokenId (TTL: 10 min)
 *  3. Once fetched, serve from cache instantly
 */

import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

export const DEPLOY_BLOCK = 19_600_000n;
const CHUNK = 50_000n;       // Safe for all public RPCs
const PARALLEL = 5;          // Concurrent chunk fetches
const TTL_MS = 10 * 60_000;  // 10 min cache per token

export interface EditEvent {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  changeCount: number;
  newPixelCount: number;
  transformer: string;
}

export interface BurnEvent {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  tokenId: number;
  totalActions: number;
  owner: string;
}

// ─── Module-level cache ───────────────────────────────────────────────────────

interface TokenCache {
  edits: EditEvent[];
  burns: BurnEvent[];
  fetchedAt: number;
}

const tokenCache = new Map<number, TokenCache>();

// ─── Timestamp helpers ────────────────────────────────────────────────────────

const tsCache = new Map<bigint, number>();

async function getTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
  const missing = [...new Set(blocks)].filter(b => !tsCache.has(b));
  if (missing.length > 0) {
    const results = await Promise.all(
      missing.map(async bn => {
        try {
          const block = await publicClient.getBlock({ blockNumber: bn });
          return { bn, ts: Number(block.timestamp) };
        } catch {
          return { bn, ts: Math.floor(Date.now() / 1000) };
        }
      })
    );
    for (const { bn, ts } of results) tsCache.set(bn, ts);
  }
  const out = new Map<bigint, number>();
  for (const b of blocks) out.set(b, tsCache.get(b) ?? Math.floor(Date.now() / 1000));
  return out;
}

// ─── Chunked log fetching ─────────────────────────────────────────────────────

const TRANSFORM_ABI = parseAbiItem(
  "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
);
const BURN_ABI = parseAbiItem(
  "event BurnRevealed(uint256 indexed commitId, address indexed owner, uint256 indexed receiverTokenId, uint256 totalActions, bool expired)"
);

async function fetchLogsChunked<T>(
  fromBlock: bigint,
  toBlock: bigint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const chunks: Array<[bigint, bigint]> = [];
  for (let f = fromBlock; f <= toBlock; f += CHUNK) {
    const t = f + CHUNK - 1n < toBlock ? f + CHUNK - 1n : toBlock;
    chunks.push([f, t]);
  }

  const allLogs: unknown[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const window = chunks.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      window.map(([f, t]) =>
        publicClient.getLogs({ address: CANVAS_ADDRESS, event, args, fromBlock: f, toBlock: t })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") allLogs.push(...r.value);
    }
  }
  return allLogs;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getTokenHistory(tokenId: number): Promise<{ edits: EditEvent[]; burns: BurnEvent[] }> {
  const cached = tokenCache.get(tokenId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { edits: cached.edits, burns: cached.burns };
  }

  const latest = await publicClient.getBlockNumber();

  const [editLogs, burnLogs] = await Promise.all([
    fetchLogsChunked(DEPLOY_BLOCK, latest, TRANSFORM_ABI, { tokenId: BigInt(tokenId) }),
    fetchLogsChunked(DEPLOY_BLOCK, latest, BURN_ABI, { receiverTokenId: BigInt(tokenId) }),
  ]);

  // Batch-fetch all timestamps
  const allBlocks = [
    ...editLogs.map((l: { blockNumber: bigint }) => l.blockNumber),
    ...burnLogs.map((l: { blockNumber: bigint }) => l.blockNumber),
  ].filter(Boolean) as bigint[];

  const timestamps = allBlocks.length > 0 ? await getTimestamps(allBlocks) : new Map<bigint, number>();
  const ts = (bn: bigint) => timestamps.get(bn) ?? Math.floor(Date.now() / 1000);

  const edits: EditEvent[] = editLogs
    .map((log: {
      blockNumber: bigint; transactionHash: string;
      args: { changeCount: bigint; newPixelCount: bigint; transformer: string }
    }) => ({
      blockNumber:   Number(log.blockNumber),
      timestamp:     ts(log.blockNumber),
      txHash:        log.transactionHash,
      changeCount:   Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer:   log.args.transformer,
    }))
    .sort((a, b) => a.blockNumber - b.blockNumber);

  const burns: BurnEvent[] = burnLogs
    .map((log: {
      blockNumber: bigint; transactionHash: string;
      args: { receiverTokenId: bigint; totalActions: bigint; owner: string }
    }) => ({
      blockNumber:  Number(log.blockNumber),
      timestamp:    ts(log.blockNumber),
      txHash:       log.transactionHash,
      tokenId:      Number(log.args.receiverTokenId),
      totalActions: Number(log.args.totalActions),
      owner:        log.args.owner,
    }))
    .sort((a, b) => a.blockNumber - b.blockNumber);

  tokenCache.set(tokenId, { edits, burns, fetchedAt: Date.now() });
  return { edits, burns };
}

// Keep old exports for backward compat
export async function getEditHistory(tokenId: number): Promise<EditEvent[]> {
  return (await getTokenHistory(tokenId)).edits;
}
export async function getBurnHistory(tokenId: number): Promise<BurnEvent[]> {
  return (await getTokenHistory(tokenId)).burns;
}
