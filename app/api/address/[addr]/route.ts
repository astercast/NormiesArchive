import { NextResponse } from "next/server";
import { isAddress, parseAbi } from "viem";
import { publicClient } from "@/lib/viemClient";
import { getLeaderboards, getThe100, getBurnCounts, getLastPixelCounts, getBurnsDoneByAddress } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 45;

const NORMIES_NFT       = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as const;
const COLLECTION_SLUG   = "normies";
const OPENSEA_API_KEY   = process.env.OPENSEA_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

// Strategy 1: OpenSea NFT ownership API
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

// Strategy 2: Reservoir Protocol — free, no API key required, reliable NFT ownership index
async function fetchOwnedViaReservoir(address: string): Promise<number[]> {
  const ids: number[] = [];
  let continuation: string | null = null;

  do {
    const base = `https://api.reservoir.tools/users/${address}/tokens/v7?collection=${NORMIES_NFT}&limit=200&sortBy=acquiredAt&sortDirection=desc`;
    const url: string = continuation ? `${base}&continuation=${encodeURIComponent(continuation)}` : base;

    const res: Response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Reservoir ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    for (const item of data.tokens ?? []) {
      const id = parseInt(item.token?.tokenId ?? "");
      if (!isNaN(id) && id >= 0 && id <= 9999) ids.push(id);
    }
    continuation = data.continuation ?? null;
  } while (continuation);

  return ids;
}

// Strategy 3: Etherscan ERC-721 token transfer history
async function fetchOwnedViaEtherscan(address: string): Promise<number[]> {
  const keyParam = ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : "";
  const url = `https://api.etherscan.io/api?module=account&action=tokennfttx&contractaddress=${NORMIES_NFT}&address=${address}&page=1&offset=10000&sort=asc${keyParam}`;

  const res: Response = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  if (data.status !== "1") {
    // Various "no results" messages Etherscan returns — all mean empty list
    const result = String(data.result ?? "");
    const isEmpty =
      data.message === "No transactions found" ||
      result.toLowerCase().includes("no transactions") ||
      result === "[]" ||
      (Array.isArray(data.result) && data.result.length === 0);
    if (isEmpty) return [];
    throw new Error(`Etherscan: ${data.message ?? result}`);
  }

  // Latest transfer for each tokenId determines current owner
  const ownership = new Map<number, string>();
  for (const tx of data.result as Array<{ tokenID: string; to: string }>) {
    const id = parseInt(tx.tokenID);
    if (!isNaN(id) && id >= 0 && id <= 9999) {
      ownership.set(id, tx.to.toLowerCase());
    }
  }

  const addrLower = address.toLowerCase();
  return [...ownership.entries()]
    .filter(([, owner]) => owner === addrLower)
    .map(([id]) => id);
}

async function fetchOwnedTokenIds(address: string): Promise<number[]> {
  // Strategy 1: OpenSea (most accurate, needs API key)
  if (OPENSEA_API_KEY) {
    try {
      return await fetchOwnedViaOpenSea(address);
    } catch (e) {
      console.warn("[address] OpenSea failed, trying Reservoir:", e);
    }
  }

  // Strategy 2: Reservoir (free, no key, fast)
  try {
    return await fetchOwnedViaReservoir(address);
  } catch (e) {
    console.warn("[address] Reservoir failed, trying multicall:", e);
  }

  // Strategy 3: viem multicall ownerOf — zero external API deps, always works
  console.log("[address] Using multicall fallback for", address);
  return fetchOwnedViaMulticall(address);
}

const NORMIES_API = "https://api.normies.art";

// Fetch the number of lit pixels for a single token from the Normies API
async function fetchPixelCount(tokenId: number): Promise<number> {
  try {
    const res = await fetch(`${NORMIES_API}/normie/${tokenId}/pixels`, { cache: "no-store" });
    if (!res.ok) return 0;
    const text = (await res.text()).trim();
    let count = 0;
    for (const c of text) if (c === "1") count++;
    return count;
  } catch {
    return 0;
  }
}

// Batch-fetch pixel counts for tokens not covered by the edit-event cache
async function fetchPixelCounts(tokenIds: number[]): Promise<Map<number, number>> {
  const BATCH = 20;
  const result = new Map<number, number>();
  for (let i = 0; i < tokenIds.length; i += BATCH) {
    const batch = tokenIds.slice(i, i + BATCH);
    const counts = await Promise.all(batch.map(id => fetchPixelCount(id).then(c => ({ id, c }))));
    for (const { id, c } of counts) result.set(id, c);
  }
  return result;
}

// Multicall: ownerOf for all 10k tokens in parallel batches — no API key needed
const OWNER_OF_ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);

async function fetchOwnedViaMulticall(address: string): Promise<number[]> {
  const addrLower = address.toLowerCase();
  const BATCH = 1000;
  const TOTAL = 10000;

  const batchCount = Math.ceil(TOTAL / BATCH);
  const batchResults = await Promise.all(
    Array.from({ length: batchCount }, (_, b) => {
      const start = b * BATCH;
      const end   = Math.min(start + BATCH, TOTAL);
      const contracts = Array.from({ length: end - start }, (_, i) => ({
        address:      NORMIES_NFT,
        abi:          OWNER_OF_ABI,
        functionName: "ownerOf" as const,
        args:         [BigInt(start + i)] as const,
      }));
      return publicClient
        .multicall({ contracts, allowFailure: true })
        .then(results =>
          results
            .map((r, i) => ({ r, id: start + i }))
            .filter(({ r }) => r.status === "success" && (r.result as string).toLowerCase() === addrLower)
            .map(({ id }) => id)
        );
    })
  );

  return batchResults.flat();
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
  burnCount:  number;
  pixelCount: number;
}

interface Props { params: Promise<{ addr: string }> }

export async function GET(_req: Request, { params }: Props) {
  const { addr } = await params;

  if (!isAddress(addr)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
  }

  const checksumAddr = addr;

  try {
    const [tokenIds, leaderboardData, the100Data] = await Promise.all([
      fetchOwnedTokenIds(checksumAddr),
      getLeaderboards(),
      getThe100(),
    ]);

    const [burnCountMap, totalBurnsDone] = await Promise.all([
      getBurnCounts(tokenIds),
      getBurnsDoneByAddress(checksumAddr),
    ]);

    // Pixel counts: use cached last-edit newPixelCount for edited normies,
    // fetch from Normies API for unedited ones (they have no edit events in the index)
    const cachedPixelCounts = await getLastPixelCounts(tokenIds);
    const uncachedIds = tokenIds.filter(id => cachedPixelCounts.get(id) === null);
    const fetchedPixelCounts = uncachedIds.length > 0 ? await fetchPixelCounts(uncachedIds) : new Map<number, number>();
    const pixelCountOf = (id: number) =>
      cachedPixelCounts.get(id) ?? fetchedPixelCounts.get(id) ?? 0;

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
        burnCount:  burnCountMap.get(id) ?? 0,
        pixelCount: pixelCountOf(id),
      };
    });

    normies.sort((a, b) => b.ap - a.ap || b.level - a.level || a.tokenId - b.tokenId);

    const res = NextResponse.json({
      address:        addr.toLowerCase(),
      normies,
      totalOwned:     normies.length,
      totalAp:        normies.reduce((s, n) => s + n.ap, 0),
      totalPixels:    normies.reduce((s, n) => s + n.pixelCount, 0),
      totalBurns:     totalBurnsDone,
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
