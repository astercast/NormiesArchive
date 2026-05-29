import { NextResponse } from "next/server";

const AGENTS_API = "https://api.normies.art";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(`${AGENTS_API}/agents/count`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ count: 0 }, { status: res.status });
    }
    const data = await res.json();
    const response = NextResponse.json(data);
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return response;
  } catch {
    return NextResponse.json({ count: 0 }, { status: 502 });
  }
}
