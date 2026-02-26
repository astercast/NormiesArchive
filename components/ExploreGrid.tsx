"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Seed pool — we'll filter down to only those that are actually customized
const CANDIDATE_IDS = [
  42, 69, 100, 200, 300, 404, 420, 500, 600, 700, 777,
  888, 999, 1000, 1111, 1337, 1500, 1600, 1700, 1800,
  1999, 2000, 2100, 2222, 2500, 2718, 3000, 3141, 3333,
  3500, 4000, 4200, 4321, 4444, 5000, 5555, 6000, 6666,
  6969, 7000, 7500, 7777, 8000, 8500, 8888, 9000, 9500,
  9876, 9999, 1234, 2345, 3456, 4567, 5678, 6789, 8765,
  9876, 1618, 2718, 3141, 1729, 8008, 5040,
];

interface NormieCard {
  id: number;
  level: number;
  customized: boolean;
}

async function fetchInfo(id: number): Promise<NormieCard> {
  try {
    const res = await fetch(`https://api.normies.art/normie/${id}/canvas/info`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();
    return { id, level: data.level ?? 1, customized: data.customized ?? false };
  } catch {
    return { id, level: 1, customized: false };
  }
}

function LevelBadge({ level }: { level: number }) {
  const color =
    level >= 50 ? "bg-yellow-400 text-black" :
    level >= 20 ? "bg-violet-500 text-white" :
    level >= 10 ? "bg-sky-500 text-white" :
    "bg-n-border text-n-muted";

  return (
    <span
      className={`absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold leading-none px-0.5 rounded ${color}`}
    >
      {level}
    </span>
  );
}

export default function ExploreGrid() {
  const [cards, setCards] = useState<NormieCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dedupe candidate IDs
    const ids = [...new Set(CANDIDATE_IDS)];

    // Fetch in parallel, batched to avoid hammering API
    const BATCH = 10;
    let results: NormieCard[] = [];

    async function run() {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(fetchInfo));
        results = [...results, ...batchResults];
        // Show upgraded ones as they come in
        const upgraded = results.filter((c) => c.customized && c.level > 1);
        setCards(upgraded);
      }
      setLoading(false);
    }

    run();
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">explore</h2>
        {loading && (
          <span className="text-xs font-mono text-n-faint animate-pulse">loading upgraded normies…</span>
        )}
      </div>

      {cards.length === 0 && !loading && (
        <p className="text-xs font-mono text-n-faint">no upgraded normies found</p>
      )}

      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1">
        {cards.map(({ id, level }) => (
          <Link
            key={id}
            href={`/normie/${id}`}
            title={`Normie #${id} · Level ${level}`}
            className="relative aspect-square border border-n-border rounded overflow-hidden hover:border-n-text transition-colors group bg-n-bg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.normies.art/normie/${id}/image.svg`}
              alt={`#${id}`}
              className="w-full h-full object-contain pixelated group-hover:scale-105 transition-transform"
              loading="lazy"
            />
            <LevelBadge level={level} />
          </Link>
        ))}
      </div>

      {cards.length > 0 && (
        <p className="text-xs font-mono text-n-faint text-center">
          showing {cards.length} upgraded normies · click any to explore its full history
        </p>
      )}
    </section>
  );
}
