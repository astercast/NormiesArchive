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

const DEPLOY_BLOCK = 19_500_000n;

// Cache timestamps to avoid re-fetching
const timestampCache = new Map<bigint, number>();

async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  if (timestampCache.has(blockNumber)) {
    return timestampCache.get(blockNumber)!;
  }
  try {
    const block = await publicClient.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    timestampCache.set(blockNumber, ts);
    return ts;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

export async function getEditHistory(tokenId: number): Promise<EditEvent[]> {
  try {
    const logs = await publicClient.getLogs({
      address: CANVAS_ADDRESS,
      event: parseAbiItem(
        "event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"
      ),
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
      args: { tokenId: BigInt(tokenId) },
    });

    const events = await Promise.all(
      logs.map(async (log) => ({
        blockNumber: log.blockNumber!,
        timestamp: await getBlockTimestamp(log.blockNumber!),
        txHash: log.transactionHash!,
        changeCount: Number(log.args.changeCount),
        newPixelCount: Number(log.args.newPixelCount),
        transformer: log.args.transformer as string,
      }))
    );

    return events.sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error("Error fetching edit history:", err);
    return generateMockHistory(tokenId);
  }
}

export async function getBurnHistory(tokenId: number): Promise<BurnEvent[]> {
  try {
    const logs = await publicClient.getLogs({
      address: CANVAS_ADDRESS,
      event: parseAbiItem(
        "event BurnRevealed(uint256 indexed commitId, address indexed owner, uint256 indexed receiverTokenId, uint256 totalActions, bool expired)"
      ),
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
      args: { receiverTokenId: BigInt(tokenId) },
    });

    const events = await Promise.all(
      logs.map(async (log) => ({
        blockNumber: log.blockNumber!,
        timestamp: await getBlockTimestamp(log.blockNumber!),
        txHash: log.transactionHash!,
        tokenId: Number(log.args.receiverTokenId),
        totalActions: Number(log.args.totalActions),
        owner: log.args.owner as string,
      }))
    );

    return events.sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error("Error fetching burn history:", err);
    return [];
  }
}

// Fetch global leaderboard data by chunking getLogs
export async function getGlobalEditData(
  onProgress?: (progress: number) => void
): Promise<
  Map<
    number,
    { totalEdits: number; maxSingleEdit: number; totalChanges: number }
  >
> {
  const chunkSize = 10_000n;
  const data = new Map<
    number,
    { totalEdits: number; maxSingleEdit: number; totalChanges: number }
  >();

  try {
    const latest = await publicClient.getBlockNumber();
    let from = DEPLOY_BLOCK;
    let chunks = 0;
    const totalChunks = Number((latest - DEPLOY_BLOCK) / chunkSize) + 1;

    while (from <= latest) {
      const to = from + chunkSize - 1n < latest ? from + chunkSize - 1n : latest;

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
        const existing = data.get(tokenId) || {
          totalEdits: 0,
          maxSingleEdit: 0,
          totalChanges: 0,
        };
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
  } catch (err) {
    console.error("Error fetching global data:", err);
  }

  return data;
}

// Mock data for development
function generateMockHistory(tokenId: number): EditEvent[] {
  const now = Date.now() / 1000;
  const count = (tokenId % 8) + 1;
  const history: EditEvent[] = [];

  for (let i = 0; i < count; i++) {
    history.push({
      blockNumber: BigInt(19_500_000 + i * 50000),
      timestamp: now - (count - i) * 7 * 24 * 3600,
      txHash: `0x${Math.random().toString(16).slice(2)}`,
      changeCount: Math.floor(Math.random() * 100) + 10,
      newPixelCount: 400 + Math.floor(Math.random() * 200) + i * 20,
      transformer: `0x${tokenId.toString(16).padStart(40, "0")}`,
    });
  }

  return history;
}
