"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Loader2, RefreshCw, ExternalLink, List, Grid } from "lucide-react";

const BASE = "https://api.normies.art";
const ETHERSCAN = "https://etherscan.io/tx";

interface Entry {
  tokenId:     number;
  blockNumber: number;
  txHash:      string;
  changeCount: number;
  type:        string;
  rank:        number;
}

interface ListingMap {
  [tokenId: number]: { price: number; currency: string };
}

interface The100Data {
  entries:     Entry[];
  scannedAt:   number;
  latestBlock: number;
}

function TypeTag({ type }: { type?: string }) {
  if (!type || type === "Human") return null;
  const styles: Record<string, string> = {
    Alien: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Agent: "bg-violet-100 text-violet-700 border-violet-200",
    Cat:   "bg-orange-100 text-orange-700 border-orange-200",
  };
  return (
    <span className={`text-[9px] font-mono px-1.5 py-px rounded border ${styles[type] ?? "bg-n-surface text-n-muted border-n-border"}`}>
      {type.toLowerCase()}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="w-8 text-center text-sm font-mono font-bold text-amber-500 flex-shrink-0">#1</span>;
  if (rank === 2)
    return <span className="w-8 text-center text-sm font-mono font-bold text-slate-400 flex-shrink-0">#2</span>;
  if (rank === 3)
    return <span className="w-8 text-center text-sm font-mono font-bold text-orange-400 flex-shrink-0">#3</span>;
  return <span className="w-8 text-center text-xs font-mono text-n-faint flex-shrink-0">#{rank}</span>;
}

function GridRankBadge({ rank }: { rank: number }) {
  const color =
    rank === 1 ? "text-amber-500" :
    rank === 2 ? "text-slate-400" :
    rank === 3 ? "text-orange-400" :
    "text-n-faint";
  return (
    <span className={`absolute top-1 left-1 text-[9px] font-mono font-bold leading-none bg-black/60 rounded px-1 py-0.5 ${color}`}>
      #{rank}
    </span>
  );
}

export default function The100Client() {
  const [data, setData]             = useState<The100Data | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView]             = useState<"list" | "grid">("list");
  const [listings, setListings]     = useState<ListingMap>({});

  const fetchData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/the-100?v=${Math.floor(Date.now() / 60000)}`);
      if (!res.ok) throw new Error("fetch failed");
      setData(await res.json());
    } catch (err) {
      console.error("[the-100]", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Fetch OpenSea listings for all entries once data loads
  useEffect(() => {
    if (!data?.entries?.length) return;
    const newListings: ListingMap = {};
    let done = 0;
    for (const entry of data.entries) {
      fetch(`/api/opensea?tokenId=${entry.tokenId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.listed) newListings[entry.tokenId] = { price: d.price, currency: d.currency };
          done++;
          if (done === data.entries.length) setListings({ ...newListings });
        })
        .catch(() => { done++; });
    }
  }, [data]);

  return (
    <div className="space-y-5">

      {/* Meta row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* View toggle */}
        <div className="flex items-center gap-1 border border-n-border rounded p-0.5">
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              view === "list" ? "bg-n-text text-n-bg" : "text-n-muted hover:text-n-text"
            }`}
          >
            <List className="w-3 h-3" /> list
          </button>
          <button
            onClick={() => setView("grid")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              view === "grid" ? "bg-n-text text-n-bg" : "text-n-muted hover:text-n-text"
            }`}
          >
            <Grid className="w-3 h-3" /> 10×10
          </button>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs font-mono text-n-faint">
              block {data.latestBlock?.toLocaleString()}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1 text-xs font-mono text-n-muted hover:text-n-text transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {data ? new Date(data.scannedAt).toLocaleTimeString() : "live"}
          </button>
        </div>
      </div>

      {/* Intro blurb */}
      <div className="border border-n-border rounded px-4 py-3 bg-n-surface">
        <p className="text-xs font-mono text-n-muted leading-relaxed">
          when NormiesCanvas went live, someone had to go first. these are the normies whose owners
          stepped up earliest — pioneers of the pixel canvas. rank is determined purely by block number:
          the earliest on-chain edit wins.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-3 py-16 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          scanning PixelsTransformed events from Ethereum mainnet…
        </div>
      ) : !data || data.entries.length === 0 ? (
        <p className="text-xs font-mono text-n-faint py-8 text-center">No data yet.</p>
      ) : (
        <AnimatePresence mode="wait">
          {view === "list" ? (

            /* ── List view ── */
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-1"
            >
              {data.entries.map((entry, i) => (
                <motion.div
                  key={entry.tokenId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12, delay: Math.min(i * 0.008, 0.4) }}
                >
                  <Link
                    href={`/normie/${entry.tokenId}`}
                    className="group flex items-center gap-3 px-3 py-2.5 border border-n-border rounded hover:border-n-text hover:bg-n-surface transition-all"
                  >
                    <RankBadge rank={entry.rank} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${BASE}/normie/${entry.tokenId}/image.svg`}
                      alt={`#${entry.tokenId}`}
                      width={32} height={32}
                      className="pixelated border border-n-border rounded bg-n-bg flex-shrink-0 group-hover:scale-110 transition-transform"
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono text-n-text">normie #{entry.tokenId}</span>
                      <TypeTag type={entry.type} />
                      {listings[entry.tokenId] && (
                        <span className="text-[9px] font-mono px-1.5 py-px rounded border border-blue-300 bg-blue-50 text-blue-600">
                          {listings[entry.tokenId].price.toFixed(4)} Ξ
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-[7px] sm:text-[10px] font-mono text-n-faint">block {entry.blockNumber.toLocaleString()}</span>
                      <span className="text-[8px] sm:text-[10px] font-mono text-n-faint">Δ{entry.changeCount}px</span>
                    </div>
                    <a
                      href={`${ETHERSCAN}/${entry.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 text-n-faint hover:text-n-text transition-colors p-1 -mr-1"
                      title="View transaction on Etherscan"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Link>
                </motion.div>
              ))}
            </motion.div>

          ) : (

            /* ── 10×10 Grid view ── */
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-10 gap-1.5"
            >
              {data.entries.map((entry) => (
                <Link
                  key={entry.tokenId}
                  href={`/normie/${entry.tokenId}`}
                  className="group relative aspect-square border border-n-border rounded overflow-hidden hover:border-n-text transition-all hover:scale-105 hover:z-10"
                  title={`normie #${entry.tokenId} · rank #${entry.rank}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${BASE}/normie/${entry.tokenId}/image.svg`}
                    alt={`#${entry.tokenId}`}
                    className="w-full h-full pixelated"
                    loading="lazy"
                  />
                  <GridRankBadge rank={entry.rank} />
                  {listings[entry.tokenId] && (
                    <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-mono font-bold text-white bg-black/60 py-0.5">
                      {listings[entry.tokenId].price.toFixed(3)}Ξ
                    </span>
                  )}
                </Link>
              ))}
            </motion.div>

          )}
        </AnimatePresence>
      )}
    </div>
  );
}
