"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { isAddress } from "viem";
import {
  Zap, Trophy, Palette, Star, Flame, Grid2x2,
  Loader2, AlertCircle, ExternalLink,
} from "lucide-react";
import type { WalletNormie } from "@/app/api/address/[addr]/route";

const BASE_IMG = "https://api.normies.art";

interface AddressData {
  address:         string;
  normies:         WalletNormie[];
  totalOwned:      number;
  totalAp:         number;
  totalPixels:     number;
  totalBurns:      number;
  customizedCount: number;
  the100Count:     number;
}

function TypeTag({ type }: { type: string }) {
  if (!type || type === "Human") return null;
  const styles: Record<string, string> = {
    Alien: "bg-emerald-500/90 text-white",
    Agent: "bg-violet-500/90 text-white",
    Cat:   "bg-orange-400/90 text-white",
  };
  return (
    <span className={`absolute top-1 left-1 text-[7px] leading-none font-mono font-bold px-1 py-0.5 rounded ${styles[type] ?? "bg-n-text/60 text-n-bg"}`}>
      {type.toUpperCase()}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  const bg =
    level >= 20 ? "bg-amber-400 text-black shadow-[0_0_6px_rgba(251,191,36,0.6)]" :
    level >= 10 ? "bg-violet-500 text-white shadow-[0_0_6px_rgba(139,92,246,0.5)]" :
    level >= 5  ? "bg-sky-500 text-white" :
                  "bg-n-text/60 text-n-bg";
  return (
    <span className={`absolute bottom-1 right-1 text-[9px] leading-none font-mono font-bold px-1 py-0.5 rounded ${bg}`}>
      Lv{level}
    </span>
  );
}

function The100Badge({ rank }: { rank: number }) {
  const label = rank <= 3 ? `#${rank}` : "★";
  return (
    <span className="absolute top-1 right-1 text-[8px] leading-none font-mono font-bold px-1 py-0.5 rounded bg-amber-400 text-black shadow-[0_0_8px_rgba(251,191,36,0.7)]">
      {label}
    </span>
  );
}

function NormieCard({ n }: { n: WalletNormie }) {
  const ringClass = n.isThe100
    ? "ring-2 ring-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
    : n.ap >= 50
    ? "ring-1 ring-violet-500/40"
    : n.ap > 0
    ? "ring-1 ring-n-border/60"
    : "ring-1 ring-n-border/30 opacity-60";

  return (
    <Link href={`/normie/${n.tokenId}`} className="block group">
      <div className={`relative rounded-lg overflow-hidden ${ringClass} transition-all duration-200 group-hover:scale-[1.04] group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE_IMG}/normie/${n.tokenId}/image.png`}
          alt={`Normie #${n.tokenId}`}
          width={160} height={160}
          loading="lazy"
          className="w-full aspect-square block"
          style={{ imageRendering: "pixelated" }}
        />
        <TypeTag type={n.type} />
        <LevelBadge level={n.level} />
        {n.isThe100 && n.the100Rank && <The100Badge rank={n.the100Rank} />}
        <div className="absolute inset-0 bg-n-text/0 group-hover:bg-n-text/5 transition-colors duration-200 pointer-events-none" />
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-n-muted text-[10px]">#{n.tokenId}</span>
          {n.ap > 0 && (
            <span className="font-mono text-n-faint flex items-center gap-px text-[10px]">
              <Zap className="w-2.5 h-2.5" />{n.ap}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatCard({
  label, value, icon, accent,
}: {
  label: string; value: number | string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-n-surface border border-n-border rounded-lg px-4 py-4 flex flex-col gap-2 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-0.5 ${accent}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-n-muted uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-mono font-semibold text-n-text">{value}</div>
    </div>
  );
}

interface Props { addrs: string[] }

export default function AddressesClient({ addrs }: Props) {
  const validAddrs = addrs.filter(a => isAddress(a));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["addresses", [...validAddrs].sort().join(",")],
    queryFn: async () => {
      const results: AddressData[] = await Promise.all(
        validAddrs.map(addr =>
          fetch(`/api/address/${addr}`).then(r => {
            if (!r.ok) throw new Error(`fetch failed for ${addr}`);
            return r.json() as Promise<AddressData>;
          })
        )
      );

      // Merge normies — deduplicate by tokenId (keep first, already sorted by AP desc)
      const seen = new Set<number>();
      const allNormies: WalletNormie[] = [];
      for (const r of results) {
        for (const n of (r.normies ?? [])) {
          if (!seen.has(n.tokenId)) { seen.add(n.tokenId); allNormies.push(n); }
        }
      }
      allNormies.sort((a, b) => b.ap - a.ap || b.level - a.level || a.tokenId - b.tokenId);

      return {
        normies:         allNormies,
        totalOwned:      allNormies.length,
        totalAp:         allNormies.reduce((s, n) => s + n.ap, 0),
        totalPixels:     allNormies.reduce((s, n) => s + (n.pixelCount ?? 0), 0),
        totalBurns:      results.reduce((s, r) => s + (r.totalBurns ?? 0), 0),
        customizedCount: allNormies.filter(n => n.editCount > 0).length,
        the100Count:     allNormies.filter(n => n.isThe100).length,
      };
    },
    enabled:   validAddrs.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  if (validAddrs.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 text-n-muted font-mono text-sm border border-n-border rounded-lg p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>No valid Ethereum addresses provided.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">

      {/* Header */}
      <div className="space-y-3">
        <div className="text-xs font-mono text-n-faint uppercase tracking-widest">
          {validAddrs.length} wallet{validAddrs.length !== 1 ? "s" : ""} · combined view
        </div>
        <div className="flex flex-wrap gap-2">
          {validAddrs.map(addr => (
            <Link key={addr} href={`/address/${addr}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-n-border rounded-lg text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors">
              {addr.slice(0, 6)}…{addr.slice(-4)}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="owned"        value={data.totalOwned}      icon={<Trophy   className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/50" />
          <StatCard label="total AP"     value={data.totalAp}         icon={<Zap      className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/70" />
          <StatCard label="total pixels" value={data.totalPixels}     icon={<Grid2x2  className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
          <StatCard label="total burns"  value={data.totalBurns}      icon={<Flame    className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
          <StatCard label="customized"   value={data.customizedCount} icon={<Palette  className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/50" />
          <StatCard label="the 100"      value={data.the100Count}     icon={<Star     className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-n-muted font-mono text-sm py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>scanning {validAddrs.length} wallets…</span>
          <span className="text-xs text-n-faint">this may take a few seconds</span>
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex items-start gap-3 text-n-muted font-mono text-sm border border-n-border rounded-lg p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-px" />
          <div>Couldn&apos;t load normies for one or more wallets.</div>
        </div>
      )}

      {/* Empty */}
      {data && data.normies.length === 0 && (
        <div className="text-center py-16 text-n-faint font-mono text-sm border border-n-border rounded-lg">
          no normies found across these addresses
        </div>
      )}

      {/* Full grid */}
      {data && data.normies.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-mono text-n-muted uppercase tracking-widest">
            all {data.totalOwned} normie{data.totalOwned !== 1 ? "s" : ""}
            {data.the100Count > 0 && (
              <span className="ml-3 text-amber-400/80">★ {data.the100Count} in the 100</span>
            )}
          </span>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {data.normies.map(n => <NormieCard key={n.tokenId} n={n} />)}
          </div>
        </div>
      )}
    </div>
  );
}
