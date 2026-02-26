import { NextResponse } from "next/server";
import { getUpgradedNormies } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // Allow up to 5min for first-ever scan

export async function GET() {
  try {
    const result = await getUpgradedNormies();
    return NextResponse.json({
      upgraded:  result.normies,
      count:     result.normies.length,
      scannedAt: result.scannedAt,
      latestBlock: result.latestBlock,
      fromCache: result.fromCache,
    });
  } catch (err) {
    console.error("[api/upgraded] Error:", err);
    return NextResponse.json({ error: "Failed to fetch upgraded normies" }, { status: 500 });
  }
}
