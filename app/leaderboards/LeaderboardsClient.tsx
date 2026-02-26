"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Trophy, Zap, TrendingUp, Loader2 } from "lucide-react";
import { getNormieImageUrl } from "@/lib/normiesApi";

interface BoardEntry {
  tokenId: number;
  value: number;
}

interface LeaderboardData {
  mostEdited: BoardEntry[];
  biggestGlowup: BoardEntry[];
  mostChanges: BoardEntry[];
  lastUpdated?: number;
  partial?: boolean;
}

const TABS = [
  { id: "mostEdited",    label: "most edited",     icon: Zap,       valueLabel: "edits" },
  { id: "biggestGlowup", label: "biggest glow-up", icon: TrendingUp, valueLabel: "px" },
  { id: "mostChanges",   label: "most changes",    icon: Trophy,    valueLabel: "px changed" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function LeaderboardsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("mostEdited");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/leaderboards")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: LeaderboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const board: BoardEntry[] = data?.[activeTab] ?? [];
  const activeTabDef = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono rounded transition-colors ${
                active ? "border-n-text text-n-text bg-n-surface" : "border-n-border text-n-muted hover:border-n-muted hover:text-n-text"
              }`}>
              <Icon className="w-3.5 h-3.5"/>
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-12 justify-center text-xs font-mono text-n-muted">
          <Loader2 className="w-4 h-4 animate-spin"/>
          scanning on-chain events…
        </div>
      )}

      {error && !loading && (
        <div className="py-12 text-center text-xs font-mono text-n-muted">
          failed to load leaderboard data — {error}
        </div>
      )}

      {!loading && !error && data?.partial && (
        <div className="text-xs font-mono text-n-faint border border-n-border rounded px-3 py-2">
          ⚠ data scan timed out — showing partial results
        </div>
      )}

      {!loading && !error && board.length > 0 && (
        <div className="border border-n-border rounded overflow-hidden bg-n-white">
          <div className="divide-y divide-n-border">
            <AnimatePresence mode="wait">
              {board.map((entry, i) => (
                <motion.div key={`${activeTab}-${entry.tokenId}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}>
                  <Link href={`/normie/${entry.tokenId}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-n-surface transition-colors group">
                    <span className={`w-6 text-center text-xs font-mono flex-shrink-0 ${
                      i === 0 ? "font-semibold text-n-text" : i < 3 ? "font-medium text-n-text" : "text-n-faint"
                    }`}>{i + 1}</span>
                    <div className="w-10 h-10 border border-n-border rounded overflow-hidden flex-shrink-0 bg-n-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={getNormieImageUrl(entry.tokenId)} alt={`#${entry.tokenId}`}
                        className="w-full h-full object-contain pixelated group-hover:scale-105 transition-transform"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-mono text-n-text group-hover:text-n-muted transition-colors">
                        normie #{entry.tokenId}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-medium text-n-text">
                      {entry.value.toLocaleString()} <span className="text-n-muted text-xs">{activeTabDef.valueLabel}</span>
                    </div>
                    <div className="hidden sm:block w-24">
                      <div className="h-px bg-n-border overflow-hidden">
                        <motion.div className="h-full bg-n-text"
                          initial={{ width: 0 }}
                          animate={{ width: `${(entry.value / board[0].value) * 100}%` }}
                          transition={{ delay: i * 0.03 + 0.15, duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {!loading && !error && board.length === 0 && (
        <div className="py-12 text-center text-xs font-mono text-n-muted">no data yet</div>
      )}

      <p className="text-xs font-mono text-n-faint">
        {data?.lastUpdated ? `last updated ${new Date(data.lastUpdated).toLocaleTimeString()} · ` : ""}
        live on-chain data · aggregated from ethereum events
      </p>
    </div>
  );
}
