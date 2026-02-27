import { NextResponse } from "next/server";
import { loadEventsBlob, loadNormiesBlob } from "@/lib/blobStore";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const count  = Math.min(20, parseInt(url.searchParams.get("count") ?? "10", 10));

  try {
    const [eventsBlob, normiesBlob] = await Promise.all([
      loadEventsBlob(),
      loadNormiesBlob(),
    ]);

    if (!eventsBlob || !normiesBlob) {
      return NextResponse.json({ entries: [], latestBlock: 0, indexing: true });
    }

    // Find the most recent edit block per token
    const latestEditByToken = new Map<number, { blockNumber: number; txHash: string }>();
    for (const [tokenId, events] of eventsBlob.editsByToken) {
      if (events.length === 0) continue;
      const last = events[events.length - 1]; // already sorted asc
      latestEditByToken.set(tokenId, { blockNumber: last.blockNumber, txHash: last.txHash });
    }

    // Sort by most recent edit block descending
    const sorted = [...latestEditByToken.entries()]
      .sort((a, b) => b[1].blockNumber - a[1].blockNumber)
      .slice(0, count);

    // Enrich with normie details from normies blob
    const normiesMap = new Map(normiesBlob.normies.map(n => [n.id, n]));

    const entries = sorted.map(([tokenId, { blockNumber, txHash }]) => {
      const n = normiesMap.get(tokenId);
      return {
        tokenId,
        blockNumber,
        txHash,
        level:     n?.level     ?? 1,
        ap:        n?.ap        ?? 0,
        type:      n?.type      ?? "Human",
        editCount: n?.editCount ?? 0,
      };
    });

    const res = NextResponse.json({
      entries,
      latestBlock: eventsBlob.latestBlock,
      savedAt:     eventsBlob.savedAt,
      indexing:    false,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("[api/latest]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
