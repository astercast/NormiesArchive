import { NextResponse } from "next/server";
import { getEditHistory, getBurnHistory } from "@/lib/eventIndexer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);

  if (isNaN(tokenId) || tokenId < 1 || tokenId > 10000) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
  }

  try {
    const [edits, burns] = await Promise.all([
      getEditHistory(tokenId),
      getBurnHistory(tokenId),
    ]);

    return NextResponse.json({ tokenId, edits, burns });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
