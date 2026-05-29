import { NextResponse } from "next/server";

const AGENTS_API = "https://api.normies.art";
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY ?? "";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 30 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params;
  const { searchParams } = new URL(req.url);
  const previewOnly = searchParams.get("preview") === "1";

  if (!/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: "invalid tokenId" }, { status: 400 });
  }

  try {
    const personaP = safeJson(`${AGENTS_API}/agents/persona-preview/${tokenId}`);

    if (previewOnly) {
      const persona = await personaP;
      const response = NextResponse.json({ tokenId, persona });
      response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      return response;
    }

    const [info, persona, card, metadata, listingRes] = await Promise.all([
      safeJson(`${AGENTS_API}/agents/info/${tokenId}`),
      personaP,
      safeJson(`${AGENTS_API}/agents/agent-card/${tokenId}`),
      safeJson(`${AGENTS_API}/agents/metadata/${tokenId}`),
      OPENSEA_API_KEY
        ? fetch(
            `https://api.opensea.io/api/v2/listings/collection/normies/nfts/${tokenId}/best`,
            {
              headers: { "x-api-key": OPENSEA_API_KEY, accept: "application/json" },
              next: { revalidate: 120 },
            }
          ).then(async r => {
            if (r.status === 404) return { listed: false };
            if (!r.ok) return { listed: false };
            const data = await r.json();
            const price = data?.price?.current;
            const valueRaw = price?.value;
            const decimals = price?.decimals ?? 18;
            if (!valueRaw) return { listed: false };
            return {
              listed: true,
              price: parseFloat(valueRaw) / Math.pow(10, decimals),
              currency: price?.currency ?? "ETH",
            };
          }).catch(() => ({ listed: false }))
        : Promise.resolve({ listed: false }),
    ]);

    const response = NextResponse.json({
      tokenId,
      info,
      persona,
      card,
      metadata,
      listing: listingRes,
    });
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return response;
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
