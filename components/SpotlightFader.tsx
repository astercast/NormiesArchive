"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

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

function LevelPill({ level, type }: { level: number; type: string }) {
  const color =
    level >= 20 ? "bg-amber-400 text-black" :
    level >= 10 ? "bg-violet-500 text-white" :
    level >= 5  ? "bg-sky-500 text-white" :
                  "bg-n-border text-n-muted";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold ${color}`}>
      lvl {level} · {type.toLowerCase()}
    </span>
  );
}

export default function SpotlightFader() {
  const [normies, setNormies] = useState<NormieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx,     setIdx]     = useState(0);
  const [fading,  setFading]  = useState(false);
  const [nextIdx, setNextIdx] = useState(0);
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`/api/leaderboards?v=${Math.floor(Date.now() / 60000)}`)
      .then(r => r.json())
      .then(d => {
        let entries: NormieEntry[] = [];
        if (Array.isArray(d.all) && d.all.length > 0) {
          entries = d.all;
        } else if (Array.isArray(d.highestLevel) && d.highestLevel.length > 0) {
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
        if (entries.length > 0) {
          const spotlight = entries.filter(n => n.level >= 2).sort((a, b) => b.level - a.level);
          setNormies(spotlight);
          setIdx(0);
          setNextIdx(Math.min(1, spotlight.length - 1));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const rotate = useCallback(() => {
    if (normies.length < 2) return;
    setNextIdx(prev => {
      let next: number;
      do { next = Math.floor(Math.random() * normies.length); } while (next === prev);
      return next;
    });
    setFading(true);
  }, [normies.length]);

  useEffect(() => {
    if (normies.length < 2) return;
    timerRef.current = setInterval(rotate, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [rotate, normies.length]);

  const handleTransitionEnd = () => {
    if (fading) { setIdx(nextIdx); setFading(false); }
  };

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">spotlight</h2>
        <div className="border border-n-border bg-n-white rounded p-6 flex items-center gap-3 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          scanning on-chain events…
        </div>
      </section>
    );
  }

  if (!normies.length) return null;

  const current = normies[idx];
  const next    = normies[nextIdx];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">spotlight</h2>
        <Link href={`/normie/${current.tokenId}`}
          className="text-xs font-mono text-n-muted hover:text-n-text transition-colors flex items-center gap-1">
          view history <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="border border-n-border bg-n-white rounded p-6 flex flex-col sm:flex-row gap-6 items-start">
        {/* Crossfading image */}
        <div className="relative w-40 h-40 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE}/normie/${current.tokenId}/image.svg`}
            alt={`Normie #${current.tokenId}`}
            className="absolute inset-0 w-full h-full object-contain pixelated border border-n-border rounded bg-n-bg"
            style={{ transition: "opacity 0.8s ease", opacity: fading ? 0 : 1 }}
            onTransitionEnd={handleTransitionEnd}
          />
          {next && next.tokenId !== current.tokenId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${BASE}/normie/${next.tokenId}/image.svg`}
              alt={`Normie #${next.tokenId}`}
              className="absolute inset-0 w-full h-full object-contain pixelated border border-n-border rounded bg-n-bg"
              style={{ transition: "opacity 0.8s ease", opacity: fading ? 1 : 0 }}
            />
          )}
        </div>

        {/* Info */}
        <div className="space-y-3 flex-1" style={{ transition: "opacity 0.4s ease", opacity: fading ? 0 : 1 }}>
          <div className="font-mono text-2xl font-medium text-n-text">normie #{current.tokenId}</div>
          <LevelPill level={current.level} type={current.type} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { label: "action pts", value: current.ap },
              { label: "px added",   value: `+${current.added}` },
              { label: "px removed", value: `-${current.removed}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-n-bg border border-n-border rounded px-3 py-2">
                <div className="text-xs font-mono text-n-faint">{label}</div>
                <div className="text-sm font-mono font-medium text-n-text">{value}</div>
              </div>
            ))}
          </div>
          <Link href={`/normie/${current.tokenId}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-n-text text-xs font-mono text-n-text hover:bg-n-text hover:text-n-bg transition-colors rounded">
            open timeline <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Dot nav */}
      <div className="flex items-center gap-1.5 justify-center">
        {normies.map((n, i) => (
          <button key={n.tokenId}
            onClick={() => { setNextIdx(i); setFading(true); }}
            className={`rounded-full transition-all ${i === idx ? "w-3 h-1.5 bg-n-text" : "w-1.5 h-1.5 bg-n-border hover:bg-n-muted"}`}
          />
        ))}
      </div>
    </section>
  );
}
