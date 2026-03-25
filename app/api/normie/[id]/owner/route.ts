import { NextResponse } from "next/server";
import { parseAbi } from "viem";
import { publicClient } from "@/lib/viemClient";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const NFT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as const;
const ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);

interface Props { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);
  if (isNaN(tokenId) || tokenId < 0 || tokenId > 9999)
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });

  try {
    const owner = await publicClient.readContract({
      address: NFT,
      abi: ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    const res = NextResponse.json({ owner: (owner as string).toLowerCase() });
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res;
  } catch {
    return NextResponse.json({ error: "Token not found or RPC error" }, { status: 404 });
  }
}
