/**
 * Manual trigger endpoint for the indexer.
 * The indexer normally runs via GitHub Actions every 10 minutes.
 * Visit /api/cron/index to trigger a manual run if needed.
 */

import { NextResponse } from "next/server";
import { loadEventsBlob, saveEventsBlob, saveNormiesBlob } from "@/lib/blobStore";
import { runFullScan, runIncrementalScan } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const t0 = Date.now();
  try {
    const existing = await loadEventsBlob();
    if (!existing) {
      const { eventsBlob, normiesBlob } = await runFullScan();
      await Promise.all([saveEventsBlob(eventsBlob), saveNormiesBlob(normiesBlob)]);
      return NextResponse.json({ status: "full_scan", normies: normiesBlob.normies.length, latestBlock: eventsBlob.latestBlock, durationMs: Date.now() - t0 });
    }
    const { eventsBlob, normiesBlob, changed } = await runIncrementalScan(existing);
    await Promise.all([saveEventsBlob(eventsBlob), saveNormiesBlob(normiesBlob)]);
    return NextResponse.json({ status: changed ? "updated" : "no_change", normies: normiesBlob.normies.length, latestBlock: eventsBlob.latestBlock, durationMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: String(err), durationMs: Date.now() - t0 }, { status: 500 });
  }
}
