import { NextResponse } from "next/server";
import { getGlobalEditData } from "@/lib/eventIndexer";

// Never pre-render at build time — always run on-demand at runtime
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Allow up to 300s on Vercel Pro / 60s on Hobby — set to max allowed
export const maxDuration = 300;

export async function GET() {
  try {
    // Race the data fetch against a timeout so we always return something
    const timeoutMs = 55_000; // stay under Vercel's 60s function limit
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs)
    );

    const editDataPromise = getGlobalEditData();
    const result = await Promise.race([editDataPromise, timeoutPromise]);

    // If we timed out, return empty leaderboards rather than an error
    if (result === null) {
      console.warn("Leaderboard fetch timed out — returning empty data");
      return NextResponse.json({
        mostEdited: [],
        biggestGlowup: [],
        mostChanges: [],
        lastUpdated: Date.now(),
        partial: true,
      });
    }

    const editData = result;

    // Convert to arrays and sort
    const entries = Array.from(editData.entries()).map(([tokenId, data]) => ({
      tokenId,
      ...data,
    }));

    const mostEdited = [...entries]
      .sort((a, b) => b.totalEdits - a.totalEdits)
      .slice(0, 50)
      .map((e) => ({ tokenId: e.tokenId, value: e.totalEdits }));

    const biggestGlowup = [...entries]
      .sort((a, b) => b.maxSingleEdit - a.maxSingleEdit)
      .slice(0, 50)
      .map((e) => ({ tokenId: e.tokenId, value: e.maxSingleEdit }));

    const mostChanges = [...entries]
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
    return NextResponse.json(
      { error: "Failed to fetch leaderboard data", mostEdited: [], biggestGlowup: [], mostChanges: [] },
      { status: 500 }
    );
  }
}
