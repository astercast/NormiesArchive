import { Suspense } from "react";
import NormieDetailClient from "./NormieDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return {
    title: `Normie #${id} — Normies Pixel Archive`,
    description: `Full pixel evolution timeline, transformation history, and life story of Normie #${id}`,
    openGraph: {
      title: `Normie #${id} — Normies Pixel Archive`,
      images: [`https://api.normies.art/normie/${id}/image.svg`],
    },
  };
}

export default async function NormiePage({ params }: Props) {
  const { id } = await params;
  const tokenId = parseInt(id);

  if (isNaN(tokenId) || tokenId < 0 || tokenId > 9999) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 text-center font-mono">
        <h1 className="text-4xl font-medium text-n-text mb-3">normie not found</h1>
        <p className="text-n-muted text-sm">Token IDs range from 0 to 9,999</p>
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
    <div className="max-w-6xl mx-auto px-4 py-12 font-mono">
      <div className="text-2xl font-medium text-n-text animate-pulse mb-8">normie #{tokenId}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="w-[400px] h-[400px] bg-n-surface border border-n-border rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-n-surface border border-n-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
