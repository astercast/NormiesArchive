import { NextResponse } from "next/server";
import { getLeaderboards } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET() {
  try {
    const data = await getLeaderboards();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/leaderboards] Error:", err);
    return NextResponse.json({ error: "Failed to fetch leaderboards" }, { status: 500 });
  }
}
