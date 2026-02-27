import { NextResponse } from "next/server";
import { getThe100 } from "@/lib/indexer";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const data = await getThe100();
    const res  = NextResponse.json(data);
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error("[the-100]", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
