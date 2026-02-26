import { Suspense } from "react";
import LeaderboardsClient from "./LeaderboardsClient";

export const metadata = {
  title: "Leaderboards",
  description: "Global rankings: most edited, highest level, biggest glow-ups, and most burned-for Normies",
};

export default function LeaderboardsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8 space-y-1">
        <div className="text-xs font-mono text-n-muted uppercase tracking-widest">rankings</div>
        <h1 className="text-3xl font-mono font-medium text-n-text">leaderboards</h1>
        <p className="text-xs font-mono text-n-muted">
          the most battle-hardened and legendary normies in existence.
        </p>
      </div>
      <Suspense fallback={
        <div className="space-y-2">
          {Array.from({length:10}).map((_,i)=>(
            <div key={i} className="h-14 border border-n-border rounded animate-pulse bg-n-surface"/>
          ))}
        </div>
      }>
        <LeaderboardsClient />
      </Suspense>
    </div>
  );
}
