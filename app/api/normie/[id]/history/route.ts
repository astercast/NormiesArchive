import { NextResponse } from "next/server";
import { getTokenHistory } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const API_BASE = "https://api.normies.art";

interface Props { params: Promise<{ id: string }> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVersionToEdit(v: any) {
  return {
    version:       Number(v.version),     // 0-indexed chronological version number from Ponder
    blockNumber:   Number(v.blockNumber),
    timestamp:     Number(v.timestamp),
    txHash:        v.txHash        as string,
    changeCount:   v.changeCount   as number,
    newPixelCount: v.newPixelCount as number,
    transformer:   v.transformer   as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBurnToBurnEvent(b: any, tokenId: number) {
  return {
    blockNumber:  Number(b.blockNumber),
    timestamp:    Number(b.timestamp),
    txHash:       b.txHash      as string,
    tokenId,
    totalActions: Number(b.totalActions),
    owner:        b.owner       as string,
  };
}

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);
  if (isNaN(tokenId) || tokenId < 0 || tokenId > 9999) {
    return NextResponse.json({ error: "Invalid token ID (0–9999)" }, { status: 400 });
  }

  // Primary: api.normies.art Ponder indexer (reliable, timestamps included, up-to-the-minute)
  try {
    const [versionsRes, burnsRes] = await Promise.allSettled([
      fetch(`${API_BASE}/history/normie/${tokenId}/versions?limit=100`, { cache: "no-store" }),
      fetch(`${API_BASE}/history/burns/receiver/${tokenId}?limit=50`,   { cache: "no-store" }),
    ]);

    if (versionsRes.status === "fulfilled" && versionsRes.value.ok) {
      const raw: unknown[] = await versionsRes.value.json();

      // Only trust the Ponder response if it has data. An empty array means the
      // indexer hasn't caught up yet — fall through to the blob fallback instead.
      if (raw.length > 0) {
        const rawBurns: unknown[] = (burnsRes.status === "fulfilled" && burnsRes.value.ok)
          ? await burnsRes.value.json()
          : [];

        // API returns newest-first; reverse to chronological order (required for frame building)
        const edits = [...raw].reverse().map(mapVersionToEdit);
        const burns = rawBurns.map(b => mapBurnToBurnEvent(b, tokenId));

        const res = NextResponse.json({ tokenId, edits, burns });
        res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
        return res;
      }
    }
  } catch (err) {
    console.warn(`[history/${tokenId}] api.normies.art failed, falling back to blob:`, err);
  }

  // Fallback: blob-based indexer events
  try {
    const { edits, burns } = await getTokenHistory(tokenId);
    const res = NextResponse.json({ tokenId, edits, burns });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error(`[history/${tokenId}]`, err);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
