"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Trophy, Zap, TrendingUp, Flame, RefreshCw, Loader2, Edit3 } from "lucide-react";

const BASE = "https://api.normies.art";

interface BoardEntry {
  tokenId: number;
  value: number;
  label: string;
  type?: string;
}

interface LeaderboardData {
  highestLevel:   BoardEntry[];
  mostAP:         BoardEntry[];
  biggestGlowup:  BoardEntry[];
  mostEdited:     BoardEntry[];
  mostChanged:    BoardEntry[];
  totalCustomized: number;
  scannedAt:      number;
  latestBlock:    number;
}

const TABS = [
  { id: "highestLevel"   as const, label: "highest level",  icon: Trophy,    desc: "Most action points burned → highest level reached" },
  { id: "mostAP"         as const, label: "most AP",         icon: Flame,     desc: "Total action points accumulated through burns" },
  { id: "biggestGlowup"  as const, label: "biggest glow-up", icon: TrendingUp, desc: "Most new pixels added vs original design" },
  { id: "mostEdited"     as const, label: "most edited",     icon: Edit3,     desc: "Most PixelsTransformed events on-chain" },
  { id: "mostChanged"    as const, label: "most changed",    icon: Zap,       desc: "Total pixel operations (add + remove combined)" },
] as const;
type TabId = typeof TABS[number]["id"];

function TypeTag({ type }: { type?: string }) {
  if (!type || type === "Human") return null;
  const colors: Record<string, string> = {
    Alien: "bg-emerald-500/20 text-emerald-700",
    Agent: "bg-violet-500/20 text-violet-700",
    Cat:   "bg-orange-400/20 text-orange-700",
  };
  return (
    <span className={`text-[9px] font-mono px-1 py-px rounded ${colors[type] ?? "bg-n-surface text-n-muted"}`}>
      {type.toLowerCase()}
    </span>
  );
}

export default function LeaderboardsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("highestLevel");
  const [data, setData]           = useState<LeaderboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLive = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/leaderboards");
      if (!res.ok) throw new Error("fetch failed");
      const d: LeaderboardData = await res.json();
      setData(d);
    } catch (err) {
      console.error("[leaderboards] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLive(); }, []);

  const board = data ? data[activeTab] ?? [] : [];
  const activeTabDef = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-5">
      {/* Meta row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-mono text-n-faint">{activeTabDef.desc}</p>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs font-mono text-n-faint">
              {data.totalCustomized} customized · block {data.latestBlock?.toLocaleString()}
            </span>
          )}
          <button
            onClick={() => fetchLive(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1 text-xs font-mono text-n-muted hover:text-n-text transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {data ? new Date(data.scannedAt).toLocaleTimeString() : "live"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono rounded transition-colors ${
                active
                  ? "border-n-text text-n-text bg-n-surface"
                  : "border-n-border text-n-muted hover:border-n-muted hover:text-n-text"
              }`}>
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center gap-3 py-12 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          scanning PixelsTransformed events from the Ethereum mainnet…
        </div>
      ) : board.length === 0 ? (
        <p className="text-xs font-mono text-n-faint py-8 text-center">No data yet.</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-1"
          >
            {board.map((entry, rank) => (
              <Link
                key={entry.tokenId}
                href={`/normie/${entry.tokenId}`}
                className="group flex items-center gap-3 px-3 py-2 border border-n-border rounded hover:border-n-text hover:bg-n-surface transition-colors"
              >
                {/* Rank */}
                <span className={`w-6 text-center text-xs font-mono font-bold flex-shrink-0 ${
                  rank === 0 ? "text-amber-500" :
                  rank === 1 ? "text-n-muted" :
                  rank === 2 ? "text-orange-500" :
                  "text-n-faint"
                }`}>
                  {rank + 1}
                </span>

                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BASE}/normie/${entry.tokenId}/image.svg`}
                  alt={`#${entry.tokenId}`}
                  width={28} height={28}
                  className="pixelated border border-n-border rounded bg-n-bg flex-shrink-0 group-hover:scale-110 transition-transform"
                  loading="lazy"
                />

                {/* Token ID + type */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-xs font-mono text-n-text">#{entry.tokenId}</span>
                  <TypeTag type={entry.type} />
                </div>

                {/* Value */}
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-mono font-semibold text-n-text">{entry.value}</span>
                  <span className="text-xs font-mono text-n-faint ml-1">{entry.label}</span>
                </div>
              </Link>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
