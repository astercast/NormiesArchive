"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Trophy, Edit3, RefreshCw, Loader2, Zap } from "lucide-react";

const BASE = "https://api.normies.art";

interface BoardEntry {
  tokenId: number;
  value: number;
  label: string;
  type?: string;
}

interface LeaderboardData {
  highestLevel:    BoardEntry[];
  mostEdited:      BoardEntry[];
  mostAp:          BoardEntry[];
  totalCustomized: number;
  scannedAt:       number;
  latestBlock:     number;
}

const TABS = [
  { id: "mostEdited"   as const, label: "most edited",   icon: Edit3,  desc: "Most PixelsTransformed events on-chain" },
  { id: "highestLevel" as const, label: "highest level", icon: Trophy, desc: "Highest level reached through burns & transforms" },
  { id: "mostAp"       as const, label: "most AP",       icon: Zap,    desc: "Most action points accumulated through burns" },
] as const;
type TabId = typeof TABS[number]["id"];

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

function RankNumber({ rank }: { rank: number }) {
  if (rank === 0) return <span className="w-7 text-center text-sm font-mono font-bold text-amber-500 flex-shrink-0">1</span>;
  if (rank === 1) return <span className="w-7 text-center text-sm font-mono font-bold text-n-muted flex-shrink-0">2</span>;
  if (rank === 2) return <span className="w-7 text-center text-sm font-mono font-bold text-orange-500 flex-shrink-0">3</span>;
  return <span className="w-7 text-center text-xs font-mono text-n-faint flex-shrink-0">{rank + 1}</span>;
}

export default function LeaderboardClient() {
  const [activeTab, setActiveTab] = useState<TabId>("mostEdited");
  const [data, setData]           = useState<LeaderboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/leaderboards?v=${Math.floor(Date.now() / 60000)}`);
      if (!res.ok) throw new Error("fetch failed");
      const d: LeaderboardData = await res.json();
      setData(d);
    } catch (err) {
      console.error("[leaderboard]", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const board = data ? (data[activeTab] ?? []) : [];
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
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1 text-xs font-mono text-n-muted hover:text-n-text transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {data ? new Date(data.scannedAt).toLocaleTimeString() : "live"}
          </button>
        </div>
      </div>

      {/* 2-tab switcher */}
      <div className="flex gap-1.5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 border text-xs font-mono rounded transition-colors ${
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

      {/* Board content */}
      {loading ? (
        <div className="flex items-center gap-3 py-16 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          scanning PixelsTransformed events from Ethereum mainnet…
        </div>
      ) : board.length === 0 ? (
        <p className="text-xs font-mono text-n-faint py-8 text-center">No data yet.</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-1"
          >
            {board.map((entry, rank) => (
              <Link
                key={entry.tokenId}
                href={`/normie/${entry.tokenId}`}
                className="group flex items-center gap-3 px-3 py-2.5 border border-n-border rounded hover:border-n-text hover:bg-n-surface transition-all"
              >
                <RankNumber rank={rank} />

                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BASE}/normie/${entry.tokenId}/image.svg`}
                  alt={`#${entry.tokenId}`}
                  width={32} height={32}
                  className="pixelated border border-n-border rounded bg-n-bg flex-shrink-0 group-hover:scale-110 transition-transform"
                  loading="lazy"
                />

                {/* Token + type */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-xs font-mono text-n-text">normie #{entry.tokenId}</span>
                  <TypeTag type={entry.type} />
                </div>

                {/* Metric */}
                <div className="text-right flex-shrink-0 tabular-nums">
                  <span className="text-sm font-mono font-semibold text-n-text">{entry.value}</span>
                  <span className="text-xs font-mono text-n-faint ml-1.5">{entry.label}</span>
                </div>
              </Link>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
