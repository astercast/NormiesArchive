import { NextResponse } from "next/server";
import { getLeaderboards } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const data = await getLeaderboards();
    const res = NextResponse.json(data);
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error("[api/leaderboards]", err);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
