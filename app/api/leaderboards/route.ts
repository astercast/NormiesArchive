import { NextResponse } from "next/server";
import { getGlobalEditData } from "@/lib/eventIndexer";
import { getNormieInfo } from "@/lib/normiesApi";

export const revalidate = 21600; // 6 hours

export async function GET() {
  try {
    const editData = await getGlobalEditData();

    // Convert to arrays and sort
    const entries = Array.from(editData.entries()).map(([tokenId, data]) => ({
      tokenId,
      ...data,
    }));

    const mostEdited = entries
      .sort((a, b) => b.totalEdits - a.totalEdits)
      .slice(0, 50)
      .map((e) => ({ tokenId: e.tokenId, value: e.totalEdits }));

    const biggestGlowup = entries
      .sort((a, b) => b.maxSingleEdit - a.maxSingleEdit)
      .slice(0, 50)
      .map((e) => ({ tokenId: e.tokenId, value: e.maxSingleEdit }));

    const mostChanges = entries
      .sort((a, b) => b.totalChanges - a.totalChanges)
      .slice(0, 50)
      .map((e) => ({ tokenId: e.tokenId, value: e.totalChanges }));

    return NextResponse.json({
      mostEdited,
      biggestGlowup,
      mostChanges,
      lastUpdated: Date.now(),
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard data" }, { status: 500 });
  }
}
