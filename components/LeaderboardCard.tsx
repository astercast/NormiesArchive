"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { getNormieImageUrl } from "@/lib/normiesApi";

export interface LeaderboardEntry {
  tokenId: number;
  value: number;
  label?: string;
}

interface LeaderboardCardProps {
  title: string;
  subtitle: string;
  icon: string;
  entries: LeaderboardEntry[];
  unit: string;
  className?: string;
}

export default function LeaderboardCard({
  title,
  subtitle,
  icon,
  entries,
  unit,
  className = "",
}: LeaderboardCardProps) {
  return (
    <div className={`bg-normie-surface border border-normie-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-normie-border bg-normie-bg/50">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="text-normie-text font-display font-bold text-lg leading-tight">{title}</h3>
            <p className="text-normie-muted text-xs">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Entries */}
      <div className="divide-y divide-normie-border">
        {entries.slice(0, 10).map((entry, i) => (
          <motion.div
            key={entry.tokenId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              href={`/normie/${entry.tokenId}`}
              className="flex items-center gap-3 p-3 hover:bg-normie-green/5 transition-colors group"
            >
              {/* Rank */}
              <div
                className={`w-6 text-center font-mono text-sm font-bold ${
                  i === 0
                    ? "text-yellow-400"
                    : i === 1
                    ? "text-gray-300"
                    : i === 2
                    ? "text-amber-600"
                    : "text-normie-muted"
                }`}
              >
                {i + 1}
              </div>

              {/* Normie image */}
              <div className="w-8 h-8 bg-normie-bg border border-normie-border rounded overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getNormieImageUrl(entry.tokenId)}
                  alt={`Normie #${entry.tokenId}`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>

              {/* Token ID */}
              <span className="flex-1 font-mono text-sm text-normie-text group-hover:text-normie-green transition-colors">
                #{entry.tokenId}
              </span>

              {/* Value */}
              <div className="text-right">
                <span className="font-mono text-sm font-bold text-normie-green">
                  {entry.value.toLocaleString()}
                </span>
                <span className="text-normie-muted text-xs ml-1">{unit}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
