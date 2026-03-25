import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { publicClient } from "@/lib/viemClient";
import { getLeaderboards, getThe100 } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const NORMIES_NFT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as `0x${string}`;

const ERC721_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }],
    outputs: [{ name: "",      type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }],
    outputs: [{ name: "",      type: "uint256" }],
  },
] as const;

async function fetchOwnedTokenIds(address: `0x${string}`): Promise<number[]> {
  const balance = await publicClient.readContract({
    address: NORMIES_NFT,
    abi:     ERC721_ABI,
    functionName: "balanceOf",
    args:    [address],
  });

  const count = Number(balance);
  if (count === 0) return [];

  // Batch all tokenOfOwnerByIndex calls via viem's built-in multicall
  const contracts = Array.from({ length: count }, (_, i) => ({
    address:      NORMIES_NFT,
    abi:          ERC721_ABI,
    functionName: "tokenOfOwnerByIndex" as const,
    args:         [address, BigInt(i)] as [`0x${string}`, bigint],
  }));

  const results = await publicClient.multicall({ contracts, allowFailure: true });

  return results
    .filter(r => r.status === "success")
    .map(r => Number((r as { status: "success"; result: bigint }).result))
    .filter(id => id >= 0 && id <= 9999);
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
