import { NextResponse } from "next/server";

const OPENSEA_API_KEY    = process.env.OPENSEA_API_KEY ?? "";
const COLLECTION_SLUG    = "normies";

export const dynamic     = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json({ error: "tokenId required" }, { status: 400 });
  }

  if (!OPENSEA_API_KEY) {
    return NextResponse.json({ listed: false, reason: "no_api_key" });
  }

  try {
    const url = `https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/nfts/${tokenId}/best`;
    const res = await fetch(url, {
      headers: {
        "x-api-key": OPENSEA_API_KEY,
        "accept":    "application/json",
      },
      next: { revalidate: 120 }, // cache 2 min
    });

    if (res.status === 404) {
      return NextResponse.json({ listed: false });
    }

    if (!res.ok) {
      console.warn(`[opensea] ${res.status} for token ${tokenId}`);
      return NextResponse.json({ listed: false, reason: "api_error" });
    }

    const data = await res.json();

    // Extract price from the listing
    const price       = data?.price?.current;
    const valueRaw    = price?.value;
    const decimals    = price?.decimals ?? 18;
    const currency    = price?.currency ?? "ETH";

    if (!valueRaw) {
      return NextResponse.json({ listed: false });
    }

    const priceEth = parseFloat(valueRaw) / Math.pow(10, decimals);

    const response = NextResponse.json({
      listed:    true,
      price:     priceEth,
      currency,
      orderHash: data?.order_hash,
    });
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return response;

  } catch (err) {
    console.error("[opensea]", err);
    return NextResponse.json({ listed: false, reason: "fetch_error" });
  }
}
