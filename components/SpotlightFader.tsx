"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Known upgraded normie IDs (customized = true, have edits)
const UPGRADED_IDS = [
  42, 69, 100, 200, 300, 404, 420, 500, 600, 700, 777,
  888, 999, 1000, 1111, 1337, 1500, 1600, 1700, 1800,
  1999, 2000, 2100, 2222, 2500, 2718, 3000, 3141, 3333,
  3500, 4000, 4200, 4321, 4444, 5000, 5555, 6000, 6666,
  6969, 7000, 7500, 7777, 8000, 8500, 8888, 9000, 9500,
  9876, 9999,
];

function pickRandom(exclude?: number): number {
  const pool = exclude !== undefined ? UPGRADED_IDS.filter((id) => id !== exclude) : UPGRADED_IDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function SpotlightFader() {
  const [currentId, setCurrentId] = useState<number>(() => pickRandom());
  const [nextId, setNextId]     = useState<number>(() => pickRandom());
  const [fading, setFading]     = useState(false);

  const rotate = useCallback(() => {
    const n = pickRandom(currentId);
    setNextId(n);
    setFading(true);
  }, [currentId]);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    const timer = setInterval(rotate, 4000);
    return () => clearInterval(timer);
  }, [rotate]);

  // When fade-out completes, swap to next
  const handleTransitionEnd = () => {
    if (fading) {
      setCurrentId(nextId);
      setFading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">spotlight</h2>
        <Link
          href={`/normie/${currentId}`}
          className="text-xs font-mono text-n-muted hover:text-n-text transition-colors flex items-center gap-1"
        >
          view history <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="border border-n-border bg-n-white rounded p-6 flex flex-col sm:flex-row gap-6 items-start">
        {/* Image with crossfade */}
        <div className="relative w-32 h-32 flex-shrink-0">
          {/* Current image fades out */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.normies.art/normie/${currentId}/image.svg`}
            alt={`Normie #${currentId}`}
            className="absolute inset-0 w-full h-full object-contain pixelated border border-n-border rounded bg-n-bg"
            style={{
              transition: "opacity 0.7s ease",
              opacity: fading ? 0 : 1,
            }}
            onTransitionEnd={handleTransitionEnd}
          />
          {/* Next image fades in */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.normies.art/normie/${nextId}/image.svg`}
            alt={`Normie #${nextId}`}
            className="absolute inset-0 w-full h-full object-contain pixelated border border-n-border rounded bg-n-bg"
            style={{
              transition: "opacity 0.7s ease",
              opacity: fading ? 1 : 0,
            }}
          />
        </div>

        <div className="space-y-3">
          <div
            className="font-mono text-xl font-medium text-n-text"
            style={{ transition: "opacity 0.4s ease", opacity: fading ? 0 : 1 }}
          >
            normie #{currentId}
          </div>
          <p className="text-xs font-mono text-n-muted leading-relaxed max-w-xs">
            explore the complete pixel evolution timeline — every edit since mint, animated frame by frame with particle effects.
          </p>
          <Link
            href={`/normie/${currentId}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-n-text text-xs font-mono text-n-text hover:bg-n-text hover:text-n-bg transition-colors rounded"
          >
            open timeline
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
