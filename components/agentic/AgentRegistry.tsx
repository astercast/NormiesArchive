"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Search } from "lucide-react";
import AgentCard from "./AgentCard";
import { fetchPersonaPreview } from "@/lib/agentic/api";
import type { AgentListItem, PersonaPreview, SortMode, TypeFilter } from "@/lib/agentic/types";

interface Props {
  agents: AgentListItem[];
  totalCount: number;
  loading: boolean;
  dark?: boolean;
  pinnedIds: number[];
  listings: Map<number, { listed: boolean; price?: number; currency?: string }>;
  onSelect: (tokenId: number) => void;
}

export default function AgentRegistry({
  agents,
  totalCount,
  loading,
  dark,
  pinnedIds,
  listings,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [personas, setPersonas] = useState<Map<number, PersonaPreview>>(new Map());

  const filtered = useMemo(() => {
    let list = [...agents];
    if (typeFilter !== "all") list = list.filter(a => a.type === typeFilter);
    if (sort === "oldest") list.reverse();
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (q) {
      list = list.filter(a => {
        const tid = String(a.tokenId);
        const name = (personas.get(Number(a.tokenId))?.name ?? a.name).toLowerCase();
        return name.includes(q) || tid.includes(q);
      });
    }
    return list;
  }, [agents, typeFilter, sort, query, personas]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    for (const a of agents) counts[a.type] = (counts[a.type] ?? 0) + 1;
    return counts;
  }, [agents]);

  useEffect(() => {
    const visible = filtered.slice(0, 36).map(a => Number(a.tokenId)).filter(t => !personas.has(t));
    if (!visible.length) return;
    let cancelled = false;
    (async () => {
      for (const tid of visible.slice(0, 10)) {
        if (cancelled) break;
        const p = await fetchPersonaPreview(tid);
        if (p) setPersonas(prev => new Map(prev).set(tid, p));
        await new Promise(r => setTimeout(r, 40));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtered, personas]);

  const types: TypeFilter[] = ["all", "Human", "Cat", "Alien", "Agent"];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-mono text-n-text flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          agent registry
        </h2>
        <p className="text-xs font-mono text-n-faint mt-1">
          {loading
            ? "loading all agents…"
            : `${filtered.length.toLocaleString()} shown${typeFilter !== "all" ? ` · ${typeFilter.toLowerCase()}` : ""}`}
          {!loading && totalCount > 0 ? ` · ${totalCount.toLocaleString()} total` : ""}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-n-faint" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name or #id"
          className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-sm font-mono rounded-xl border border-n-border bg-[var(--white)] focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
        {types.map(t => {
          const count = typeCounts[t === "all" ? "all" : t] ?? 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3 py-1.5 min-h-[36px] text-[11px] font-mono rounded-full border touch-manipulation ${
                typeFilter === t
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                  : "border-n-border text-n-muted"
              }`}
            >
              {t === "all" ? "all" : t.toLowerCase()}
              {!loading && count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSort(s => (s === "newest" ? "oldest" : "newest"))}
          className="shrink-0 px-3 py-1.5 text-[11px] font-mono rounded-full border border-n-border text-n-muted ml-auto touch-manipulation"
        >
          {sort === "newest" ? "newest" : "oldest"}
        </button>
      </div>

      {loading && agents.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-n-faint" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-sm font-mono text-n-faint">No agents match your search.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => {
            const tid = Number(a.tokenId);
            return (
              <AgentCard
                key={a.tokenId}
                agent={a}
                persona={personas.get(tid)}
                listing={listings.get(tid)}
                pinned={pinnedIds.includes(tid)}
                dark={dark}
                onClick={() => onSelect(tid)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
