import Link from "next/link";
import { Trophy, Flame } from "lucide-react";
import SpotlightFader from "@/components/SpotlightFader";
import ExploreGrid from "@/components/ExploreGrid";
import CanvasStatusPill from "@/components/CanvasStatusPill";

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">

      {/* Hero */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 text-xs font-mono text-n-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-n-text inline-block" />
          10,000 normies · ethereum mainnet · all history on-chain
          <CanvasStatusPill />
        </div>

        <div className="space-y-1">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-mono font-medium tracking-tight text-n-text leading-none">
            normies<br />
            <span className="text-n-muted">pixel</span><br />
            archive
          </h1>
        </div>

        <p className="text-sm font-mono text-n-muted max-w-sm leading-relaxed">
          the complete pixel history of 10k on-chain faces.
        </p>

        <div className="flex items-center gap-3">
          <Link href="/leaderboard"
            className="inline-flex items-center gap-2 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
            <Trophy className="w-3.5 h-3.5" />
            leaderboard
          </Link>
          <Link href="/the-100"
            className="inline-flex items-center gap-2 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
            <Flame className="w-3.5 h-3.5" />
            the 100
          </Link>
        </div>
      </section>

      {/* Spotlight */}
      <SpotlightFader />

      {/* Explore grid */}
      <ExploreGrid />

    </div>
  );
}
