import { NextResponse } from "next/server";
import { normalize } from "viem/ens";
import { publicClient } from "@/lib/viemClient";

export const dynamic     = "force-dynamic";
export const maxDuration = 10;

interface Props { params: Promise<{ name: string }> }

export async function GET(_req: Request, { params }: Props) {
  const { name } = await params;

  let normalized: string;
  try {
    normalized = normalize(name);
  } catch {
    return NextResponse.json({ error: "Invalid ENS name" }, { status: 400 });
  }

  try {
    const address = await publicClient.getEnsAddress({ name: normalized });
    if (!address) {
      return NextResponse.json({ error: "ENS name not found" }, { status: 404 });
    }
    const res = NextResponse.json({ address: address.toLowerCase(), name: normalized });
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error("[resolve-ens]", err);
    return NextResponse.json({ error: "Resolution failed" }, { status: 500 });
  }
}
