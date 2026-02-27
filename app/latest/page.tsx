import type { Metadata } from "next";
import LatestWorksClient from "./LatestWorksClient";

export const metadata: Metadata = {
  title: "Latest Works — Normies Pixel Archive",
  description: "The most recently edited Normies on Ethereum mainnet.",
};

export default function LatestWorksPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-mono font-semibold text-n-text">latest works</h1>
        <p className="text-xs font-mono text-n-faint mt-1">
          normies with the most recent on-chain pixel edits
        </p>
      </div>
      <LatestWorksClient />
    </main>
  );
}
