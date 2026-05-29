import { NextResponse } from "next/server";

const AGENTS_API = "https://api.normies.art";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "24";
  const sort = searchParams.get("sort") ?? "newest";
  const cursor = searchParams.get("cursor");

  const url = new URL(`${AGENTS_API}/agents/list`);
  url.searchParams.set("limit", limit);
  url.searchParams.set("sort", sort);
  if (cursor) url.searchParams.set("cursor", cursor);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 30 } });
    if (!res.ok) {
      return NextResponse.json({ items: [], hasMore: false }, { status: res.status });
    }
    const data = await res.json();
    const response = NextResponse.json(data);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return response;
  } catch {
    return NextResponse.json({ items: [], hasMore: false }, { status: 502 });
  }
}
