"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Trophy, Zap, Flame, TrendingUp } from "lucide-react";
import { getNormieImageUrl } from "@/lib/normiesApi";

const MOCK_BOARDS = {
  mostEdited: [
    {tokenId:1337,value:48,label:"edits"},{tokenId:420,value:41,label:"edits"},
    {tokenId:8888,value:39,label:"edits"},{tokenId:69,value:35,label:"edits"},
    {tokenId:777,value:31,label:"edits"},{tokenId:404,value:28,label:"edits"},
    {tokenId:2024,value:24,label:"edits"},{tokenId:1000,value:20,label:"edits"},
    {tokenId:9999,value:17,label:"edits"},{tokenId:42,value:14,label:"edits"},
  ],
  highestLevel: [
    {tokenId:888,value:99,label:"level"},{tokenId:1111,value:91,label:"level"},
    {tokenId:4444,value:85,label:"level"},{tokenId:7777,value:79,label:"level"},
    {tokenId:2222,value:73,label:"level"},{tokenId:3333,value:67,label:"level"},
    {tokenId:5555,value:61,label:"level"},{tokenId:6666,value:55,label:"level"},
    {tokenId:9876,value:49,label:"level"},{tokenId:1234,value:43,label:"level"},
  ],
  biggestGlowup: [
    {tokenId:6969,value:412,label:"px"},{tokenId:420,value:381,label:"px"},
    {tokenId:1337,value:355,label:"px"},{tokenId:5000,value:329,label:"px"},
    {tokenId:2500,value:303,label:"px"},{tokenId:7500,value:277,label:"px"},
    {tokenId:3000,value:251,label:"px"},{tokenId:8000,value:225,label:"px"},
    {tokenId:1500,value:199,label:"px"},{tokenId:9000,value:173,label:"px"},
  ],
  mostBurned: [
    {tokenId:3141,value:120,label:"AP"},{tokenId:2718,value:110,label:"AP"},
    {tokenId:1618,value:100,label:"AP"},{tokenId:1000,value:90,label:"AP"},
    {tokenId:7777,value:80,label:"AP"},{tokenId:999,value:70,label:"AP"},
    {tokenId:4321,value:60,label:"AP"},{tokenId:8765,value:50,label:"AP"},
    {tokenId:1111,value:40,label:"AP"},{tokenId:9999,value:30,label:"AP"},
  ],
};

const TABS = [
  { id: "highestLevel",  label: "highest level",  icon: Trophy },
  { id: "mostEdited",    label: "most edited",     icon: Zap },
  { id: "biggestGlowup", label: "biggest glow-up", icon: TrendingUp },
  { id: "mostBurned",    label: "most burned for", icon: Flame },
] as const;

type TabId = typeof TABS[number]["id"];

export default function LeaderboardsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("highestLevel");
  const board = MOCK_BOARDS[activeTab];

  return (
    <div className="space-y-5">
      {/* Tabs */}
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

      {/* Board */}
      <div className="border border-n-border rounded overflow-hidden bg-n-white">
        <div className="divide-y divide-n-border">
          {board.map((entry, i) => (
            <motion.div key={`${activeTab}-${entry.tokenId}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}>
              <Link href={`/normie/${entry.tokenId}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-n-surface transition-colors group">

                {/* Rank */}
                <span className={`w-6 text-center text-xs font-mono flex-shrink-0 ${
                  i === 0 ? "font-semibold text-n-text" : i < 3 ? "font-medium text-n-text" : "text-n-faint"
                }`}>
                  {i + 1}
                </span>

                {/* Image */}
                <div className="w-10 h-10 border border-n-border rounded overflow-hidden flex-shrink-0 bg-n-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getNormieImageUrl(entry.tokenId)} alt={`#${entry.tokenId}`}
                    className="w-full h-full object-contain pixelated group-hover:scale-105 transition-transform"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>

                {/* Name */}
                <div className="flex-1">
                  <div className="text-xs font-mono text-n-text group-hover:text-n-muted transition-colors">
                    normie #{entry.tokenId}
                  </div>
                </div>

                {/* Value */}
                <div className="font-mono text-sm font-medium text-n-text">
                  {entry.value.toLocaleString()} <span className="text-n-muted text-xs">{entry.label}</span>
                </div>

                {/* Bar */}
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
        </div>
      </div>

      <p className="text-xs font-mono text-n-faint">
        leaderboard data aggregated from on-chain events · updates every 6h
      </p>
    </div>
  );
}
