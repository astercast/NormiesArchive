import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

// Curated IDs that show nicely and span the collection
const EXPLORE_IDS = [0,42,69,100,200,300,420,500,600,700,777,888,999,1000,1111,1337,1500,1600,1700,1800,1999,2000,2100,2222,2500,3000,3141,3333,3500,4000,4200,4321,4444,5000,5555,6000,6666,6969,7000,7500,7777,8000,8500,8888,9000,9500,9876,9999];

const FEATURES = [
  { label: "timeline", desc: "full animated pixel evolution" },
  { label: "particles", desc: "3d birth & death effects" },
  { label: "heatmap", desc: "visual changed pixel overlay" },
  { label: "leaderboards", desc: "global rankings & records" },
  { label: "life story", desc: "on-chain event narrative" },
  { label: "gif export", desc: "one-click animated export" },
];

// Hourly spotlight rotation
function getSpotlightId(): number {
  const ids = [42, 1337, 8888, 404, 777, 2024, 69, 9999, 1000, 3141, 6969, 0];
  return ids[Math.floor(Date.now() / 1000 / 3600) % ids.length];
}

export default function HomePage() {
  const spotlightId = getSpotlightId();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">

      {/* Hero */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 text-xs font-mono text-n-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-n-text inline-block" />
          10,000 normies · ethereum mainnet · all history on-chain
        </div>

        <div className="space-y-1">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-mono font-medium tracking-tight text-n-text leading-none">
            normie<br />
            <span className="text-n-muted">eternal</span><br />
            archive
          </h1>
        </div>

        <p className="text-sm font-mono text-n-muted max-w-sm leading-relaxed">
          every transformation, every scar, every burn —<br />
          the complete pixel history of 10k on-chain faces.
        </p>

        <div className="flex items-center gap-3">
          <Link href="/leaderboards"
            className="inline-flex items-center gap-2 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
            <Trophy className="w-3.5 h-3.5" />
            leaderboards
          </Link>
          <Link href={`/normie/${spotlightId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity">
            explore normie #{spotlightId}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-n-border">
          {FEATURES.map(({ label, desc }) => (
            <div key={label} className="bg-n-bg p-4 space-y-1">
              <div className="text-xs font-mono font-medium text-n-text">{label}</div>
              <div className="text-xs font-mono text-n-muted">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Spotlight */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">spotlight</h2>
          <Link href={`/normie/${spotlightId}`}
            className="text-xs font-mono text-n-muted hover:text-n-text transition-colors flex items-center gap-1">
            view history <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="border border-n-border bg-n-white rounded p-6 flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-32 h-32 border border-n-border rounded overflow-hidden flex-shrink-0 bg-n-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.normies.art/normie/${spotlightId}/image.svg`}
              alt={`Normie #${spotlightId}`}
              className="w-full h-full object-contain pixelated"
            />
          </div>
          <div className="space-y-3">
            <div className="font-mono text-xl font-medium text-n-text">normie #{spotlightId}</div>
            <p className="text-xs font-mono text-n-muted leading-relaxed max-w-xs">
              explore the complete pixel evolution timeline — every edit since mint, animated frame by frame with particle effects.
            </p>
            <Link href={`/normie/${spotlightId}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-n-text text-xs font-mono text-n-text hover:bg-n-text hover:text-n-bg transition-colors rounded">
              open timeline
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Explore grid */}
      <section className="space-y-4">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">explore</h2>
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1">
          {EXPLORE_IDS.map((id) => (
            <Link
              key={id}
              href={`/normie/${id}`}
              title={`Normie #${id}`}
              className="aspect-square border border-n-border rounded overflow-hidden hover:border-n-text transition-colors group bg-n-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.normies.art/normie/${id}/image.svg`}
                alt={`#${id}`}
                className="w-full h-full object-contain pixelated group-hover:scale-105 transition-transform"
                loading="lazy"
              />
            </Link>
          ))}
        </div>
        <p className="text-xs font-mono text-n-faint text-center">
          click any normie to explore its full history
        </p>
      </section>

    </div>
  );
}
