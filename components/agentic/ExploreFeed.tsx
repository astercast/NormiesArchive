"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import AgentCard from "./AgentCard";
import { fetchAgentList, fetchPersonaPreview } from "@/lib/agentic/api";
import type { AgentListItem, PersonaPreview, SortMode, TypeFilter } from "@/lib/agentic/types";
import { INITIAL_LIST_PAGES, MAX_LIST, PAGE_SIZE } from "@/lib/agentic/constants";

interface Props {
  dark?: boolean;
  discoveredIds: Set<number>;
  pinnedIds: number[];
  loungeIds: number[];
  listings: Map<number, { listed: boolean; price?: number; currency?: string }>;
  onSelect: (tokenId: number) => void;
}

export default function ExploreFeed({
  dark,
  discoveredIds,
  pinnedIds,
  loungeIds,
  listings,
  onSelect,
}: Props) {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [personas, setPersonas] = useState<Map<number, PersonaPreview>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const previewQueue = useRef<Set<number>>(new Set());

  const loadPage = useCallback(
    async (nextCursor: string | null, replace = false) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const { items, hasMore: more, nextCursor: nc } = await fetchAgentList({
          limit: PAGE_SIZE,
          cursor: nextCursor,
          sort,
        });
        setAgents(prev => {
          const merged = replace ? items : [...prev, ...items];
          const seen = new Set<string>();
          return merged.filter(a => {
            if (seen.has(a.tokenId)) return false;
            seen.add(a.tokenId);
            return true;
          }).slice(0, MAX_LIST);
        });
        setHasMore(more && (replace ? items.length : agents.length + items.length) < MAX_LIST);
        setCursor(nc);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [sort, agents.length]
  );

  useEffect(() => {
    setAgents([]);
    setCursor(null);
    loadPage(null, true);
  }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadPage(cursor, false);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, [cursor, hasMore, loading, loadingMore, loadPage]);

  // Lazy persona previews for visible cards
  useEffect(() => {
    const missing = agents
      .slice(0, INITIAL_LIST_PAGES * PAGE_SIZE)
      .map(a => Number(a.tokenId))
      .filter(tid => !personas.has(tid) && !previewQueue.current.has(tid))
      .slice(0, 8);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const tid of missing) {
        if (cancelled) break;
        previewQueue.current.add(tid);
        const p = await fetchPersonaPreview(tid);
        if (cancelled || !p) continue;
        setPersonas(prev => new Map(prev).set(tid, p));
        await new Promise(r => setTimeout(r, 80));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agents, personas]);

  const filtered = agents.filter(a => {
    const tid = Number(a.tokenId);
    const p = personas.get(tid);
    const name = (p?.name ?? a.name).toLowerCase();
    const type = p?.type ?? a.type;
    if (typeFilter !== "all" && type !== typeFilter) return false;
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return true;
    return name.includes(q) || String(tid).includes(q);
  });

  const types: TypeFilter[] = ["all", "Human", "Cat", "Alien", "Agent"];

  return (
    <div className="space-y-3 pb-2">
      <div className="sticky top-[52px] z-20 -mx-1 px-1 py-2 bg-[var(--bg)]/90 backdrop-blur-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-n-faint pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or #id"
            className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-sm font-mono rounded-lg border border-n-border bg-[var(--white)] text-n-text placeholder:text-n-faint focus:outline-none focus:border-cyan-500/60"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {types.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3 py-1.5 min-h-[36px] text-[11px] font-mono rounded-full border touch-manipulation transition-colors ${
                typeFilter === t
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                  : "border-n-border text-n-muted hover:border-n-muted"
              }`}
            >
              {t === "all" ? "all types" : t.toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSort(s => (s === "newest" ? "oldest" : "newest"))}
            className="shrink-0 px-3 py-1.5 min-h-[36px] text-[11px] font-mono rounded-full border border-n-border text-n-muted hover:border-n-muted touch-manipulation ml-auto"
          >
            {sort === "newest" ? "newest ↓" : "oldest ↑"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-6 h-6 animate-spin text-n-faint" />
          <p className="text-xs font-mono text-n-muted">Loading agent registry…</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm font-mono text-n-faint text-center py-12">No agents match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(a => {
            const tid = Number(a.tokenId);
            return (
              <AgentCard
                key={a.tokenId}
                agent={a}
                persona={personas.get(tid)}
                listing={listings.get(tid)}
                discovered={discoveredIds.has(tid)}
                pinned={pinnedIds.includes(tid)}
                onFloor={loungeIds.includes(tid)}
                dark={dark}
                onClick={() => onSelect(tid)}
              />
            );
          })}
        </div>
      )}

      <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
        {loadingMore && <Loader2 className="w-4 h-4 animate-spin text-n-faint" />}
        {!hasMore && agents.length > 0 && (
          <p className="text-[10px] font-mono text-n-faint">end of registry</p>
        )}
      </div>
    </div>
  );
}
