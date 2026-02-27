"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Zap } from "lucide-react";

interface NormieEntry {
  tokenId:   number;
  level:     number;
  ap:        number;
  added:     number;
  removed:   number;
  type:      string;
  editCount: number;
}

const BASE = "https://api.normies.art";

function LevelBadge({ level }: { level: number }) {
  const bg =
    level >= 20 ? "bg-amber-400 text-black" :
    level >= 10 ? "bg-violet-500 text-white" :
    level >= 5  ? "bg-sky-500 text-white" :
                  "bg-n-text/70 text-n-bg";
  return (
    <span className={`absolute bottom-0.5 right-0.5 text-[8px] leading-none font-mono font-bold px-0.5 py-px rounded ${bg}`}>
      {level}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (type === "Alien") return <span className="absolute top-0.5 left-0.5 text-[7px] leading-none font-mono px-0.5 py-px rounded bg-emerald-500/80 text-white">AL</span>;
  if (type === "Agent") return <span className="absolute top-0.5 left-0.5 text-[7px] leading-none font-mono px-0.5 py-px rounded bg-violet-500/80 text-white">AG</span>;
  if (type === "Cat")   return <span className="absolute top-0.5 left-0.5 text-[7px] leading-none font-mono px-0.5 py-px rounded bg-orange-400/80 text-white">CT</span>;
  return null;
}

function EditCountBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className="absolute top-0.5 right-0.5 text-[7px] leading-none font-mono px-0.5 py-px rounded bg-n-text/60 text-n-bg flex items-center gap-px">
      <Zap className="w-[6px] h-[6px]" />{count}
    </span>
  );
}

export default function ExploreGrid() {
  const [normies,    setNormies]  = useState<NormieEntry[]>([]);
  const [loading,    setLoading]  = useState(true);
  const [scannedAt,  setScanned]  = useState<number | null>(null);
  const [latestBlock, setBlock]   = useState<number | null>(null);

  useEffect(() => {
    // Add cache-bust so we always get a fresh response after redeployment
    fetch(`/api/leaderboards?v=${Math.floor(Date.now() / 60000)}`)
      .then(r => r.json())
      .then(d => {
        // Prefer `all` (full data). Fall back to building from `highestLevel` if missing (cached old response).
        let entries: NormieEntry[] = [];
        if (Array.isArray(d.all) && d.all.length > 0) {
          entries = d.all;
        } else if (Array.isArray(d.highestLevel) && d.highestLevel.length > 0) {
          // Old response shape — reconstruct from leaderboard arrays
          const byId = new Map<number, NormieEntry>();
          for (const e of d.highestLevel) {
            byId.set(e.tokenId, { tokenId: e.tokenId, level: e.value, ap: 0, added: 0, removed: 0, type: e.type ?? "Human", editCount: 0 });
          }
          for (const e of (d.mostEdited ?? [])) {
            const n = byId.get(e.tokenId);
            if (n) n.editCount = e.value;
          }
          entries = [...byId.values()];
        }
        const sorted = [...entries].sort((a, b) => b.level - a.level || b.ap - a.ap);
        setNormies(sorted);
        if (d.scannedAt)   setScanned(d.scannedAt);
        if (d.latestBlock) setBlock(d.latestBlock);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">upgraded normies</h2>
        <div className="flex items-center gap-3 py-8 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          scanning on-chain events…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">
          upgraded normies
          <span className="ml-2 text-n-faint">({normies.length} of 10,000)</span>
        </h2>
        {latestBlock && scannedAt && (
          <span className="text-xs font-mono text-n-faint">
            block {latestBlock.toLocaleString()} · {new Date(scannedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {normies.length === 0 ? (
        <p className="text-xs font-mono text-n-faint py-4">No customized normies found.</p>
      ) : (
        <>
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-1.5">
            {normies.map(({ tokenId, level, type, editCount }) => (
              <Link
                key={tokenId}
                href={`/normie/${tokenId}`}
                title={`Normie #${tokenId} · Level ${level} ${type} · ${editCount} edit${editCount !== 1 ? "s" : ""}`}
                className="relative aspect-square border border-n-border rounded overflow-hidden hover:border-n-text transition-colors group bg-n-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BASE}/normie/${tokenId}/image.svg`}
                  alt={`#${tokenId}`}
                  className="w-full h-full object-contain pixelated group-hover:scale-110 transition-transform duration-200"
                  loading="lazy"
                />
                <TypeBadge type={type} />
                <LevelBadge level={level} />
                <EditCountBadge count={editCount} />
              </Link>
            ))}
          </div>
          <p className="text-xs font-mono text-n-faint text-center">
            {normies.length} normie{normies.length !== 1 ? "s" : ""} transformed out of 10,000 ·{" "}
            click any to explore its full on-chain history
          </p>
        </>
      )}
    </section>
  );
}
