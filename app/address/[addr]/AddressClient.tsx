"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { isAddress } from "viem";
import { Copy, Check, ExternalLink, Loader2, AlertCircle, Zap, Trophy, Palette, Star, Flame, Grid2x2 } from "lucide-react";
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

function NormieCard({ n, large = false }: { n: WalletNormie; large?: boolean }) {
  const isGold = n.isThe100;
  const ringClass = isGold
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
          width={large ? 240 : 160}
          height={large ? 240 : 160}
          loading="lazy"
          className="w-full aspect-square block"
          style={{ imageRendering: "pixelated" }}
        />
        {!large && <TypeTag type={n.type} />}
        <LevelBadge level={n.level} />
        {n.isThe100 && n.the100Rank && <The100Badge rank={n.the100Rank} />}
        {/* hover overlay */}
        <div className="absolute inset-0 bg-n-text/0 group-hover:bg-n-text/5 transition-colors duration-200 pointer-events-none" />
      </div>
      <div className="mt-1.5 px-0.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-n-muted ${large ? "text-xs" : "text-[10px]"}`}>#{n.tokenId}</span>
          {n.ap > 0 && (
            <span className={`font-mono text-n-faint flex items-center gap-px ${large ? "text-xs" : "text-[10px]"}`}>
              <Zap className={large ? "w-3 h-3" : "w-2.5 h-2.5"} />{n.ap}
            </span>
          )}
        </div>
        {large && n.type && n.type !== "Human" && (
          <div className="text-[10px] font-mono text-n-faint">{n.type}</div>
        )}
      </div>
    </Link>
  );
}

function StatCard({
  label, value, icon, accent,
}: {
  label: string; value: number | string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className={`bg-n-surface border border-n-border rounded-lg px-4 py-4 flex flex-col gap-2 relative overflow-hidden`}>
      {/* accent stripe */}
      <div className={`absolute top-0 left-0 w-full h-0.5 ${accent}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-n-muted uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-mono font-semibold text-n-text">{value}</div>
    </div>
  );
}

// Level legend strip
function LevelLegend() {
  const tiers = [
    { label: "Lv 20+", bg: "bg-amber-400", text: "text-black" },
    { label: "Lv 10+", bg: "bg-violet-500", text: "text-white" },
    { label: "Lv 5+",  bg: "bg-sky-500",    text: "text-white" },
    { label: "Lv 1+",  bg: "bg-n-text/60",  text: "text-n-bg" },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tiers.map(t => (
        <span key={t.label} className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${t.bg} ${t.text}`}>
          {t.label}
        </span>
      ))}
      <span className="text-[10px] font-mono text-n-faint ml-1">level badge</span>
    </div>
  );
}

interface Props { addr: string }

export default function AddressClient({ addr }: Props) {
  const [copied, setCopied] = useState(false);

  const validAddr = isAddress(addr);
  const short     = validAddr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  const { data, isLoading, isError, error } = useQuery<AddressData>({
    queryKey: ["address", addr.toLowerCase()],
    queryFn:  async () => {
      const res = await fetch(`/api/address/${addr}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "fetch failed");
      }
      return res.json();
    },
    enabled:  validAddr,
    staleTime: 60_000,
    retry: 1,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!validAddr) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 text-n-muted font-mono text-sm border border-n-border rounded-lg p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>&quot;{addr}&quot; is not a valid Ethereum address.</span>
        </div>
      </div>
    );
  }

  // top 3 by AP for spotlight, rest for main grid
  const spotlight = data?.normies.slice(0, 3) ?? [];
  const rest      = data?.normies.slice(3) ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-n-faint uppercase tracking-widest">wallet</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl sm:text-3xl font-semibold text-n-text break-all">{short}</h1>
          <button
            onClick={handleCopy}
            className="p-1.5 border border-n-border rounded-md text-n-muted hover:text-n-text hover:border-n-text transition-colors flex-shrink-0"
            title="Copy address"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={`https://etherscan.io/address/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 border border-n-border rounded-md text-n-muted hover:text-n-text hover:border-n-text transition-colors flex-shrink-0"
            title="View on Etherscan"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="text-xs font-mono text-n-faint/60 break-all hidden sm:block">{addr.toLowerCase()}</div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="owned"      value={data.totalOwned}      icon={<Trophy   className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/50" />
          <StatCard label="total AP"   value={data.totalAp}         icon={<Zap      className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/70" />
          <StatCard label="px changed" value={data.totalPixels}     icon={<Grid2x2  className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
          <StatCard label="burns taken" value={data.totalBurns}     icon={<Flame    className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
          <StatCard label="customized" value={data.customizedCount} icon={<Palette  className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/50" />
          <StatCard label="the 100"    value={data.the100Count}     icon={<Star     className="w-3.5 h-3.5 text-amber-400/80" />} accent="bg-amber-400/60" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-n-muted font-mono text-sm py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>scanning wallet…</span>
          <span className="text-xs text-n-faint">this may take a few seconds</span>
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex items-start gap-3 text-n-muted font-mono text-sm border border-n-border rounded-lg p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-px" />
          <div className="space-y-1">
            <div>Couldn&apos;t load normies for this wallet.</div>
            {error instanceof Error && error.message !== "fetch failed" && (
              <div className="text-xs text-n-faint">{error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Empty */}
      {data && data.normies.length === 0 && (
        <div className="text-center py-16 text-n-faint font-mono text-sm border border-n-border rounded-lg">
          no normies owned by this address
        </div>
      )}

      {/* Spotlight — top 3 */}
      {data && spotlight.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-n-muted uppercase tracking-widest">top normies</span>
            <LevelLegend />
          </div>
          <div className={`grid gap-4 ${
            spotlight.length === 1 ? "grid-cols-1 max-w-xs" :
            spotlight.length === 2 ? "grid-cols-2 max-w-sm" :
            "grid-cols-3 max-w-md"
          }`}>
            {spotlight.map(n => <NormieCard key={n.tokenId} n={n} large />)}
          </div>
        </div>
      )}

      {/* Full grid */}
      {data && rest.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-n-muted uppercase tracking-widest">
              all {data.totalOwned} normie{data.totalOwned !== 1 ? "s" : ""}
              {data.the100Count > 0 && (
                <span className="ml-3 text-amber-400/80">
                  ★ {data.the100Count} in the 100
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {data.normies.map(n => (
              <NormieCard key={n.tokenId} n={n} />
            ))}
          </div>
        </div>
      )}

      {/* If only ≤3 normies, still show the full grid label */}
      {data && data.normies.length > 0 && rest.length === 0 && (
        <div className="text-xs font-mono text-n-faint text-center pt-2">
          showing all {data.totalOwned} normie{data.totalOwned !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
