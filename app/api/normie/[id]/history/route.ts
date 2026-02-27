import { NextResponse } from "next/server";
import { getTokenHistory } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 300; // 5 min — cold scan needs time

interface Props { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);
  if (isNaN(tokenId) || tokenId < 0 || tokenId > 9999) {
    return NextResponse.json({ error: "Invalid token ID (0–9999)" }, { status: 400 });
  }
  try {
    const { edits, burns } = await getTokenHistory(tokenId);
    const res = NextResponse.json({ tokenId, edits, burns });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error(`[history/${tokenId}]`, err);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
