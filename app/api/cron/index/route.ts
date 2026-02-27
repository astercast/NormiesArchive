/**
 * Vercel Cron Job — runs every 10 minutes.
 * Scans new blockchain events and writes updated data to Vercel Blob.
 *
 * Protected by CRON_SECRET env var (set automatically by Vercel for cron jobs).
 * Configure in vercel.json:
 *   crons: [{ path: "/api/cron/index", schedule: "every 10 minutes" }]
 */

import { NextResponse } from "next/server";
import { loadEventsBlob, saveEventsBlob, saveNormiesBlob } from "@/lib/blobStore";
import { runFullScan, runIncrementalScan } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 300; // 5 min — full scan needs time

export async function GET(req: Request) {
  // Verify this is called by Vercel's cron scheduler (or by us manually)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log("[cron] Starting indexer run…");

  try {
    const existing = await loadEventsBlob();

    if (!existing) {
      // First ever run — full scan
      console.log("[cron] No existing blob — running full scan");
      const { eventsBlob, normiesBlob } = await runFullScan();
      await Promise.all([
        saveEventsBlob(eventsBlob),
        saveNormiesBlob(normiesBlob),
      ]);
      return NextResponse.json({
        status:      "full_scan",
        normies:     normiesBlob.normies.length,
        latestBlock: eventsBlob.latestBlock,
        durationMs:  Date.now() - t0,
      });
    }

    // Incremental scan from last saved block
    const { eventsBlob, normiesBlob, changed } = await runIncrementalScan(existing);
    await Promise.all([
      saveEventsBlob(eventsBlob),
      saveNormiesBlob(normiesBlob),
    ]);

    return NextResponse.json({
      status:      changed ? "incremental_updated" : "incremental_no_change",
      normies:     normiesBlob.normies.length,
      latestBlock: eventsBlob.latestBlock,
      durationMs:  Date.now() - t0,
    });

  } catch (err) {
    console.error("[cron] Indexer run failed:", err);
    return NextResponse.json(
      { error: "Indexer run failed", detail: String(err), durationMs: Date.now() - t0 },
      { status: 500 }
    );
  }
}
