import { NextResponse } from "next/server";
import { getUpgradedNormies } from "@/lib/indexer";

// force-dynamic: consistent with all other API routes.
// Cache is controlled manually via Cache-Control headers below.
export const dynamic     = "force-dynamic";
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
