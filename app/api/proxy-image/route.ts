import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy SVG images from api.normies.art so they can be drawn onto
 * an HTML canvas without triggering CORS taint.
 * Used by the "Export Grid" feature on The 100 page.
 *
 * ?id=123           → current canvas image
 * ?id=123&original  → original pre-edit image
 */
export const runtime = "edge";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const original = request.nextUrl.searchParams.has("original");

  // Validate: only numeric token IDs allowed
  if (!id || !/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 100_000) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const path = original
    ? `https://api.normies.art/normie/${id}/original/image.svg`
    : `https://api.normies.art/normie/${id}/image.svg`;

  const upstream = await fetch(path, { cache: "no-store" });

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
