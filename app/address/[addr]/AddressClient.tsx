"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { isAddress } from "viem";
import { Copy, Check, ExternalLink, Loader2, AlertCircle, Zap } from "lucide-react";
import type { WalletNormie } from "@/app/api/address/[addr]/route";

const BASE_IMG = "https://api.normies.art";

interface AddressData {
  address:         string;
  normies:         WalletNormie[];
  totalOwned:      number;
  totalAp:         number;
  customizedCount: number;
  the100Count:     number;
}

function TypeTag({ type }: { type: string }) {
  if (!type || type === "Human") return null;
  const styles: Record<string, string> = {
    Alien: "bg-emerald-500/80 text-white",
    Agent: "bg-violet-500/80 text-white",
    Cat:   "bg-orange-400/80 text-white",
  };
  return (
    <span className={`absolute top-0.5 left-0.5 text-[7px] leading-none font-mono px-0.5 py-px rounded ${styles[type] ?? "bg-n-text/60 text-n-bg"}`}>
      {type.slice(0, 2).toUpperCase()}
    </span>
  );
}

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

function The100Badge({ rank }: { rank: number }) {
  const label = rank <= 3 ? `THE100 #${rank}` : "THE100";
  return (
    <span className="absolute top-0.5 right-0.5 text-[6px] sm:text-[7px] leading-none font-mono font-bold px-0.5 py-px rounded bg-black/80 text-white/90">
      {label}
    </span>
  );
}

function NormieCard({ n }: { n: WalletNormie }) {
  const borderClass = n.isThe100
    ? "border-2 border-amber-400/80"
    : n.ap > 0
    ? "border border-n-border"
    : "border border-n-border opacity-70";

  return (
    <Link href={`/normie/${n.tokenId}`} className="block group">
      <div className={`relative rounded overflow-hidden ${borderClass} transition-transform group-hover:scale-[1.03]`}>
        {/* Pixel image — lazy loaded via img tag */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE_IMG}/normie/${n.tokenId}/image.png`}
          alt={`Normie #${n.tokenId}`}
          width={160}
          height={160}
          loading="lazy"
          className="w-full aspect-square block"
          style={{ imageRendering: "pixelated" }}
        />
        <TypeTag type={n.type} />
        <LevelBadge level={n.level} />
        {n.isThe100 && n.the100Rank && <The100Badge rank={n.the100Rank} />}
      </div>
      <div className="mt-1 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-mono text-n-muted">#{n.tokenId}</span>
        {n.ap > 0 && (
          <span className="text-[10px] font-mono text-n-faint flex items-center gap-px">
            <Zap className="w-2.5 h-2.5" />{n.ap}
          </span>
        )}
      </div>
    </Link>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-n-bg px-4 py-3">
      <div className="text-xs font-mono text-n-muted">{label}</div>
      <div className="text-lg font-mono font-medium text-n-text">{value}</div>
    </div>
  );
}

interface Props { addr: string }

export default function AddressClient({ addr }: Props) {
  const [copied, setCopied] = useState(false);

  const validAddr = isAddress(addr);
  const short     = validAddr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  const { data, isLoading, isError } = useQuery<AddressData>({
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
        <div className="flex items-center gap-3 text-n-muted font-mono text-sm border border-n-border rounded p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>&quot;{addr}&quot; is not a valid Ethereum address.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs font-mono text-n-faint uppercase tracking-wider">wallet</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl sm:text-2xl font-medium text-n-text break-all">{short}</h1>
          <button
            onClick={handleCopy}
            className="p-1.5 border border-n-border rounded text-n-muted hover:text-n-text hover:border-n-text transition-colors flex-shrink-0"
            title="Copy address"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={`https://etherscan.io/address/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 border border-n-border rounded text-n-muted hover:text-n-text hover:border-n-text transition-colors flex-shrink-0"
            title="View on Etherscan"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="text-xs font-mono text-n-faint break-all hidden sm:block">{addr.toLowerCase()}</div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-4 gap-px bg-n-border">
          <StatBox label="owned"      value={data.totalOwned} />
          <StatBox label="total AP"   value={data.totalAp} />
          <StatBox label="customized" value={data.customizedCount} />
          <StatBox label="the 100"    value={data.the100Count} />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 text-n-muted font-mono text-sm py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          loading wallet…
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex items-center gap-3 text-n-muted font-mono text-sm border border-n-border rounded p-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Couldn&apos;t load normies for this wallet. The address may own none, or the RPC is temporarily unavailable.</span>
        </div>
      )}

      {/* Empty */}
      {data && data.normies.length === 0 && (
        <div className="text-center py-12 text-n-faint font-mono text-sm">
          no normies owned by this address
        </div>
      )}

      {/* Grid */}
      {data && data.normies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono text-n-muted uppercase tracking-wider">
              {data.totalOwned} normie{data.totalOwned !== 1 ? "s" : ""} — sorted by AP
            </span>
            {data.the100Count > 0 && (
              <span className="text-xs font-mono text-n-faint flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-sm border-2 border-amber-400/80" />
                {data.the100Count} in the 100
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {data.normies.map(n => (
              <NormieCard key={n.tokenId} n={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
