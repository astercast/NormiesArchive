import { Suspense } from "react";
import The100Client from "./The100Client";

export const metadata = {
  title: "The 100",
  description: "The first 100 Normies ever edited on the Canvas — the original pioneers.",
};

export default function The100Page() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8 space-y-1">
        <div className="text-xs font-mono text-n-muted uppercase tracking-widest">hall of pioneers</div>
        <h1 className="text-3xl font-mono font-medium text-n-text">the 100</h1>
        <p className="text-xs font-mono text-n-muted">
          the first 100 normies ever touched by the canvas — sorted by block, verified on-chain.
        </p>
      </div>
      <Suspense fallback={
        <div className="space-y-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-14 border border-n-border rounded animate-pulse bg-n-surface" />
          ))}
        </div>
      }>
        <The100Client />
      </Suspense>
    </div>
  );
}
