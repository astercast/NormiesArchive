"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface FilterState {
  type: string;
  customizedOnly: boolean;
  specialFeature: string;
}

const defaultFilters: FilterState = {
  type: "all", customizedOnly: false, specialFeature: "none",
};

interface SearchFiltersProps {
  compact?: boolean;
}

export default function SearchFilters({ compact = false }: SearchFiltersProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(search);
    if (!isNaN(id) && id >= 0 && id <= 9999) {
      router.push(`/normie/${id}`);
      setSearch("");
    }
  };

  if (compact) {
    return (
      <form onSubmit={handleSearch} className="flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-n-faint" />
          <input
            type="number" min="0" max="9999" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search #0–9999"
            className="w-36 pl-7 pr-2 py-1.5 bg-n-surface border border-n-border rounded text-xs font-mono text-n-text placeholder:text-n-faint focus:outline-none focus:border-n-muted transition-colors"
          />
        </div>
        <button type="submit"
          className="px-2.5 py-1.5 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity">
          go
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-n-faint" />
          <input
            type="number" min="0" max="9999" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search normie #0–9999"
            className="w-full pl-9 pr-4 py-2 bg-n-surface border border-n-border rounded text-xs font-mono text-n-text placeholder:text-n-faint focus:outline-none focus:border-n-text transition-colors"
          />
        </div>
        <button type="submit"
          className="px-4 py-2 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity">
          go
        </button>
        <button type="button" onClick={() => setExpanded(!expanded)}
          className={`px-3 py-2 border rounded text-xs font-mono transition-colors ${
            expanded ? "border-n-text text-n-text bg-n-surface" : "border-n-border text-n-muted hover:border-n-muted"
          }`}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Advanced filters */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3 border border-n-border rounded p-3 bg-n-surface"
        >
          {/* Type filter */}
          <div>
            <div className="text-xs font-mono text-n-muted mb-1.5">type</div>
            <div className="flex gap-1.5 flex-wrap">
              {["all", "Human", "Cat", "Alien", "Agent"].map((t) => (
                <button key={t} onClick={() => setFilters(f => ({...f, type: t}))}
                  className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                    filters.type === t ? "border-n-text text-n-text bg-n-bg" : "border-n-border text-n-muted hover:border-n-muted"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Special */}
          <div>
            <div className="text-xs font-mono text-n-muted mb-1.5">special</div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { v: "none", l: "none" },
                { v: "alien-eye-loss", l: "alien eye loss" },
                { v: "customized", l: "customized" },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => setFilters(f => ({...f, specialFeature: v}))}
                  className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                    filters.specialFeature === v ? "border-n-text text-n-text bg-n-bg" : "border-n-border text-n-muted hover:border-n-muted"
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <button onClick={() => setFilters(defaultFilters)}
            className="flex items-center gap-1 text-xs font-mono text-n-faint hover:text-n-muted transition-colors">
            <X className="w-3 h-3" /> reset
          </button>
        </motion.div>
      )}
    </div>
  );
}
