import { parseAbiItem } from "viem";
import { publicClient, CANVAS_ADDRESS } from "./viemClient";

export interface EditEvent {
  blockNumber: bigint;
  timestamp: number;
  txHash: string;
  changeCount: number;
  newPixelCount: number;
  transformer: string;
}

export interface BurnEvent {
  blockNumber: bigint;
  timestamp: number;
  txHash: string;
  tokenId: number;
  totalActions: number;
  owner: string;
}

// NormiesCanvas deployed at block ~19_614_000 (Feb 2024).
// Using a slightly earlier safe floor so we never miss events.
export const DEPLOY_BLOCK = 19_600_000n;

// ─── Block timestamp batching ─────────────────────────────────────────────────
const timestampCache = new Map<bigint, number>();

/**
 * Fetch timestamps for a batch of block numbers using Promise.all.
 * Much faster than sequential awaits.
 */
async function batchGetTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers)];
  const missing = unique.filter((b) => !timestampCache.has(b));

  if (missing.length > 0) {
    const results = await Promise.all(
      missing.map(async (blockNumber) => {
        try {
          const block = await publicClient.getBlock({ blockNumber });
          return { blockNumber, ts: Number(block.timestamp) };
        } catch {
          return { blockNumber, ts: Math.floor(Date.now() / 1000) };
        }
      })
    );
    for (const { blockNumber, ts } of results) {
      timestampCache.set(blockNumber, ts);
    }
  }

  const out = new Map<bigint, number>();
  for (const b of blockNumbers) {
    out.set(b, timestampCache.get(b) ?? Math.floor(Date.now() / 1000));
  }
  return out;
}

// ─── Per-token history ────────────────────────────────────────────────────────

export async function getEditHistory(tokenId: number): Promise<EditEvent[]> {
  const logs = await publicClient.getLogs({
    address: CANVAS_ADDRESS,
    event: parseAbiItem(
      "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
    ),
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
    args: { tokenId: BigInt(tokenId) },
  });

  if (logs.length === 0) return [];

  const blockNumbers = logs.map((l) => l.blockNumber!);
  const timestamps = await batchGetTimestamps(blockNumbers);

  return logs
    .map((log) => ({
      blockNumber: log.blockNumber!,
      timestamp: timestamps.get(log.blockNumber!) ?? Math.floor(Date.now() / 1000),
      txHash: log.transactionHash!,
      changeCount: Number(log.args.changeCount),
      newPixelCount: Number(log.args.newPixelCount),
      transformer: log.args.transformer as string,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function getBurnHistory(tokenId: number): Promise<BurnEvent[]> {
  const logs = await publicClient.getLogs({
    address: CANVAS_ADDRESS,
    event: parseAbiItem(
      "event BurnRevealed(uint256 indexed commitId, address indexed owner, uint256 indexed receiverTokenId, uint256 totalActions, bool expired)"
    ),
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
    args: { receiverTokenId: BigInt(tokenId) },
  });

  if (logs.length === 0) return [];

  const blockNumbers = logs.map((l) => l.blockNumber!);
  const timestamps = await batchGetTimestamps(blockNumbers);

  return logs
    .map((log) => ({
      blockNumber: log.blockNumber!,
      timestamp: timestamps.get(log.blockNumber!) ?? Math.floor(Date.now() / 1000),
      txHash: log.transactionHash!,
      tokenId: Number(log.args.receiverTokenId),
      totalActions: Number(log.args.totalActions),
      owner: log.args.owner as string,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Global leaderboard scan ──────────────────────────────────────────────────

export async function getGlobalEditData(
  onProgress?: (progress: number) => void
): Promise<Map<number, { totalEdits: number; maxSingleEdit: number; totalChanges: number }>> {
  const CHUNK = 10_000n;
  const data = new Map<number, { totalEdits: number; maxSingleEdit: number; totalChanges: number }>();

  const latest = await publicClient.getBlockNumber();
  const totalChunks = Number((latest - DEPLOY_BLOCK) / CHUNK) + 1;
  let chunks = 0;
  let from = DEPLOY_BLOCK;

  while (from <= latest) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;

    const logs = await publicClient.getLogs({
      address: CANVAS_ADDRESS,
      event: parseAbiItem(
        "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
      ),
      fromBlock: from,
      toBlock: to,
    });

    for (const log of logs) {
      const tokenId = Number(log.args.tokenId);
      const changeCount = Number(log.args.changeCount);
      const existing = data.get(tokenId) ?? { totalEdits: 0, maxSingleEdit: 0, totalChanges: 0 };
      data.set(tokenId, {
        totalEdits: existing.totalEdits + 1,
        maxSingleEdit: Math.max(existing.maxSingleEdit, changeCount),
        totalChanges: existing.totalChanges + changeCount,
      });
    }

    chunks++;
    onProgress?.(chunks / totalChunks);
    from = to + 1n;
  }

  return data;
}
