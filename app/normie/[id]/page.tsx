import { Suspense } from "react";
import NormieDetailClient from "./NormieDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return {
    title: `Normie #${id} — Eternal Archive`,
    description: `Full pixel evolution timeline, transformation history, and life story of Normie #${id}`,
    openGraph: {
      title: `Normie #${id} — Eternal Archive`,
      images: [`https://api.normies.art/normie/${id}/image.svg`],
    },
  };
}

export default async function NormiePage({ params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);

  if (isNaN(tokenId) || tokenId < 1 || tokenId > 10000) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="text-6xl tracking-wider mb-4" style={{fontFamily:"'Bebas Neue',sans-serif"}}>NORMIE NOT FOUND</h1>
        <p className="text-[#555555] font-mono">Token IDs range from 1 to 10,000</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingState tokenId={tokenId} />}>
      <NormieDetailClient tokenId={tokenId} />
    </Suspense>
  );
}

function LoadingState({ tokenId }: { tokenId: number }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-6xl tracking-wider mb-8 animate-pulse" style={{fontFamily:"'Bebas Neue',sans-serif",color:"#1a1a1a"}}>
        NORMIE #{tokenId}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="aspect-square max-w-sm bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl animate-pulse" />
        <div className="space-y-4">
          {Array.from({length: 4}).map((_, i) => (
            <div key={i} className="h-16 bg-[#0d0d0d] border border-[#1a1a1a] rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
