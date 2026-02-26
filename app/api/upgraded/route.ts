import { NextResponse } from "next/server";
import { getUpgradedNormies } from "@/lib/indexer";

// ISR: Vercel CDN serves cached response instantly.
// Background revalidation runs every 5 minutes.
// First-ever call may take ~10-15s; every subsequent call is <50ms from edge.
export const revalidate = 300; // 5 minutes
export const maxDuration = 300;

export async function GET() {
  try {
    const result = await getUpgradedNormies();
    const res = NextResponse.json({
      upgraded:    result.normies,
      count:       result.normies.length,
      scannedAt:   result.scannedAt,
      latestBlock: result.latestBlock,
      fromCache:   result.fromCache,
    });
    // Tell Vercel edge cache: serve this for 5 min, stale-while-revalidate for 10 min
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error("[api/upgraded]", err);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
