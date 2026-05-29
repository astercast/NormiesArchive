import { NextResponse } from "next/server";

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY ?? "";
const COLLECTION_SLUG = "normies";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 20)));
  const cursor = searchParams.get("cursor");

  if (!OPENSEA_API_KEY) {
    return NextResponse.json({ nfts: [], next: null, reason: "no_api_key" });
  }

  try {
    const url = new URL(
      `https://api.opensea.io/api/v2/collection/${COLLECTION_SLUG}/nfts`
    );
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("has_agent_binding", "true");
    if (cursor) {
      url.searchParams.set("next", cursor);
    }

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": OPENSEA_API_KEY, accept: "application/json" },
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      console.warn("[opensea/agents]", res.status);
      return NextResponse.json({ nfts: [], next: null, reason: "api_error" });
    }

    const data = await res.json();
    const nfts = (data.nfts ?? []).map(
      (n: {
        identifier?: string;
        name?: string;
        image_url?: string;
        agent_binding?: {
          agent_id?: string;
          registered_by?: string;
        };
      }) => ({
        tokenId: n.identifier ?? "",
        name: n.name,
        image: n.image_url,
        agentId: n.agent_binding?.agent_id,
        registeredBy: n.agent_binding?.registered_by,
      })
    );

    const next = data.next ?? null;
    const response = NextResponse.json({ nfts, next });
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return response;
  } catch (err) {
    console.error("[opensea/agents]", err);
    return NextResponse.json({ nfts: [], next: null, reason: "fetch_error" });
  }
}
