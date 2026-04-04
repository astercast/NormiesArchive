/**
 * GET /api/normie/:id/frames
 *
 * Returns every historical pixel frame for a Normie as raw 40×40 RGBA bitmaps,
 * base64-encoded. Intended for use by external tools such as normuseum.vercel.app.
 *
 * Response shape:
 * {
 *   tokenId: number,
 *   frames: [
 *     { version: -1, pixels: "<base64>" },   // version -1 = original (pre-edit)
 *     { version: 0,  pixels: "<base64>" },   // version 0  = first edit
 *     { version: 1,  pixels: "<base64>" },   // ...
 *   ]
 * }
 *
 * Each `pixels` field is 40×40×4 = 6400 raw RGBA bytes, base64-encoded.
 * Pixel ON  (#48494b) → R:72  G:73  B:75  A:255
 * Pixel OFF (#e3e5e4) → R:227 G:229 B:228 A:255
 */

import { NextResponse } from "next/server";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// CORS headers so normuseum.vercel.app (and any other origin) can call this
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PONDER = "https://api.normies.art";

// Official Normies palette
const R_ON = 72,  G_ON = 73,  B_ON = 75;
const R_OFF = 227, G_OFF = 229, B_OFF = 228;

/** Convert a 1600-char "0"/"1" string to 6400-byte RGBA then base64-encode it. */
function pixelsToRgbaBase64(pixels1600: string): string {
  const buf = new Uint8Array(1600 * 4);
  for (let i = 0; i < 1600; i++) {
    const on = pixels1600[i] === "1";
    buf[i * 4 + 0] = on ? R_ON : R_OFF;
    buf[i * 4 + 1] = on ? G_ON : G_OFF;
    buf[i * 4 + 2] = on ? B_ON : B_OFF;
    buf[i * 4 + 3] = 255;
  }
  // btoa on Uint8Array — convert via string
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function fetchPixelsWithRetry(url: string, attempt = 0): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return null;
    if (res.status === 429 && attempt < 3) {
      const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
      await new Promise(r => setTimeout(r, (wait || 2) * 1000));
      return fetchPixelsWithRetry(url, attempt + 1);
    }
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (text.length !== 1600 || !/^[01]+$/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

interface Props { params: Promise<{ id: string }> }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id, 10);
  if (isNaN(tokenId) || tokenId < 0 || tokenId > 9999) {
    return NextResponse.json(
      { error: "Invalid token ID (0–9999)" },
      { status: 400, headers: CORS }
    );
  }

  // 1. Fetch version list from Ponder (newest-first, so reverse for chronological)
  const versionsRes = await fetch(
    `${PONDER}/history/normie/${tokenId}/versions?limit=100`,
    { cache: "no-store" }
  );

  if (!versionsRes.ok && versionsRes.status !== 404) {
    return NextResponse.json(
      { error: "Failed to fetch version history" },
      { status: 502, headers: CORS }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions: any[] = versionsRes.ok ? await versionsRes.json() : [];

  // Deduplicate version indices (Ponder returns newest-first; reverse for v=0,1,2…)
  const versionIndices: number[] = [...versions]
    .reverse()
    .map((v) => Number(v.version));

  // 2. Fetch all pixel strings in parallel:
  //    version -1 = original, versions 0..N = historical edits
  const toFetch: Array<{ version: number; url: string }> = [
    { version: -1, url: `${PONDER}/normie/${tokenId}/original/pixels` },
    ...versionIndices.map(v => ({
      version: v,
      url: `${PONDER}/history/normie/${tokenId}/version/${v}/pixels`,
    })),
  ];

  // Batch to avoid hammering the rate limit (60 req/min)
  const BATCH = 10;
  const resolved: Array<{ version: number; pixels: string }> = [];

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ({ version, url }) => {
        const pixels = await fetchPixelsWithRetry(url);
        return pixels ? { version, pixels: pixelsToRgbaBase64(pixels) } : null;
      })
    );
    for (const r of results) { if (r) resolved.push(r); }
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 200));
  }

  // Sort: original (-1) first, then ascending version number
  resolved.sort((a, b) => a.version - b.version);

  const response = NextResponse.json(
    { tokenId, frames: resolved },
    { headers: CORS }
  );
  response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  return response;
}
