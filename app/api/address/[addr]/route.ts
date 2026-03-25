import { NextResponse } from "next/server";
import { isAddress, parseAbiItem } from "viem";
import { publicClient } from "@/lib/viemClient";
import { getLeaderboards, getThe100 } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const NORMIES_NFT       = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as `0x${string}`;
const COLLECTION_SLUG   = "normies";
const OPENSEA_API_KEY   = process.env.OPENSEA_API_KEY ?? "";

// Strategy 1: OpenSea NFT ownership API — most reliable, handles non-Enumerable contracts
async function fetchOwnedViaOpenSea(address: string): Promise<number[]> {
  if (!OPENSEA_API_KEY) throw new Error("no opensea key");

  const ids: number[] = [];
  let next: string | null = null;

  do {
    const base = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=${COLLECTION_SLUG}&limit=200`;
    const url: string = next ? `${base}&next=${encodeURIComponent(next)}` : base;

    const res: Response = await fetch(url, {
      headers: { "x-api-key": OPENSEA_API_KEY, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OpenSea ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    for (const nft of data.nfts ?? []) {
      const id = parseInt(nft.identifier ?? nft.token_id);
      if (!isNaN(id) && id >= 0 && id <= 9999) ids.push(id);
    }
    next = data.next ?? null;
  } while (next);

  return ids;
}

// Strategy 2: Scan on-chain Transfer events (mint + all transfers) then deduplicate current owners.
// Covers the full history from Normies NFT deployment block.
async function fetchOwnedViaLogs(address: `0x${string}`): Promise<number[]> {
  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
  );

  // Received transfers (to = address)
  const received = await publicClient.getLogs({
    address: NORMIES_NFT,
    event:   transferEvent,
    args:    { to: address },
    fromBlock: 19_000_000n,
    toBlock:   "latest",
  });

  // Sent transfers (from = address)
  const sent = await publicClient.getLogs({
    address: NORMIES_NFT,
    event:   transferEvent,
    args:    { from: address },
    fromBlock: 19_000_000n,
    toBlock:   "latest",
  });

  const sentIds = new Set(sent.map(l => Number(l.args.tokenId)));

  // Keep only tokens received but not since sent
  const owned = new Set<number>();
  for (const log of received) {
    const id = Number(log.args.tokenId);
    if (!sentIds.has(id) && id >= 0 && id <= 9999) owned.add(id);
  }
  return [...owned];
}

async function fetchOwnedTokenIds(address: `0x${string}`): Promise<number[]> {
  // Try OpenSea first (fast, no block scanning needed)
  try {
    return await fetchOwnedViaOpenSea(address);
  } catch {
    // Fall back to Transfer event scan
    return fetchOwnedViaLogs(address);
  }
}


export interface WalletNormie {
  tokenId:    number;
  level:      number;
  ap:         number;
  type:       string;
  editCount:  number;
  added:      number;
  removed:    number;
  isThe100:   boolean;
  the100Rank: number | null;
}

interface Props { params: Promise<{ addr: string }> }

export async function GET(_req: Request, { params }: Props) {
  const { addr } = await params;

  if (!isAddress(addr)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
  }

  const checksumAddr = addr as `0x${string}`;

  try {
    const [tokenIds, leaderboardData, the100Data] = await Promise.all([
      fetchOwnedTokenIds(checksumAddr),
      getLeaderboards(),
      getThe100(),
    ]);

    const normieMap  = new Map(leaderboardData.all.map(n => [n.tokenId, n]));
    const the100Map  = new Map(the100Data.entries.map(e => [e.tokenId, e.rank]));

    const normies: WalletNormie[] = tokenIds.map(id => {
      const n    = normieMap.get(id);
      const rank = the100Map.get(id) ?? null;
      return {
        tokenId:    id,
        level:      n?.level     ?? 1,
        ap:         n?.ap        ?? 0,
        type:       n?.type      ?? "Human",
        editCount:  n?.editCount ?? 0,
        added:      n?.added     ?? 0,
        removed:    n?.removed   ?? 0,
        isThe100:   rank !== null,
        the100Rank: rank,
      };
    });

    normies.sort((a, b) => b.ap - a.ap || b.level - a.level || a.tokenId - b.tokenId);

    const res = NextResponse.json({
      address:        addr.toLowerCase(),
      normies,
      totalOwned:     normies.length,
      totalAp:        normies.reduce((s, n) => s + n.ap, 0),
      customizedCount: normies.filter(n => n.editCount > 0 || n.ap > 0).length,
      the100Count:    normies.filter(n => n.isThe100).length,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res;

  } catch (err) {
    console.error(`[address/${addr}]`, err);
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 });
  }
}
