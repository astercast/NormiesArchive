"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Lock, Loader2, Star } from "lucide-react";
import LoungeLock from "@/components/agentic/LoungeLock";
import AgentRegistry from "@/components/agentic/AgentRegistry";
import AgentDetailSheet from "@/components/agentic/AgentDetailSheet";
import AgentCard from "@/components/agentic/AgentCard";
import { fetchAgentCount, fetchAgentList, fetchAgentBundle } from "@/lib/agentic/api";
import {
  LS_UNLOCK,
  MAX_PINS,
  PAGE_SIZE,
  INITIAL_LIST_PAGES,
  MAX_LIST,
} from "@/lib/agentic/constants";
import { loadNumSet, saveNumSet, LS_DISCOVERED, LS_PINNED } from "@/lib/agentic/storage";
import type { AgentBundle, AgentListItem } from "@/lib/agentic/types";

export default function AgenticLoungeClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [dark, setDark] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<AgentBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [discovered, setDiscovered] = useState<Set<number>>(() => new Set());
  const [pinned, setPinned] = useState<number[]>([]);
  const [listings, setListings] = useState<
    Map<number, { listed: boolean; price?: number; currency?: string }>
  >(new Map());

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_UNLOCK) === "1") setUnlocked(true);
    setDiscovered(loadNumSet(LS_DISCOVERED));
    setPinned([...loadNumSet(LS_PINNED)]);
  }, []);

  const handleUnlock = useCallback(() => {
    localStorage.setItem(LS_UNLOCK, "1");
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(() => {
    localStorage.removeItem(LS_UNLOCK);
    setUnlocked(false);
    setSelectedId(null);
    setBundle(null);
  }, []);

  const loadAgents = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setAgents([]);
      setCursor(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const count = await fetchAgentCount();
      setTotalCount(count);
      let nextCursor = reset ? null : cursor;
      let batch: AgentListItem[] = reset ? [] : [...agents];
      let more = true;
      const pages = reset ? INITIAL_LIST_PAGES : 1;

      for (let i = 0; i < pages && more && batch.length < MAX_LIST; i++) {
        const res = await fetchAgentList({ limit: PAGE_SIZE, cursor: nextCursor });
        batch = [...batch, ...res.items];
        nextCursor = res.nextCursor;
        more = res.hasMore;
      }

      setAgents(batch);
      setCursor(nextCursor);
      setHasMore(more && batch.length < MAX_LIST);
    } catch (e) {
      console.error("[AgenticLounge]", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [agents, cursor]);

  useEffect(() => {
    if (!unlocked) return;
    loadAgents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const openAgent = useCallback(async (tokenId: number) => {
    setSelectedId(tokenId);
    setBundle(null);
    setBundleLoading(true);
    setDiscovered(prev => {
      const next = new Set(prev);
      next.add(tokenId);
      saveNumSet(LS_DISCOVERED, next);
      return next;
    });
    try {
      const b = await fetchAgentBundle(tokenId);
      setBundle(b);
      if (b?.listing) {
        setListings(prev => new Map(prev).set(tokenId, b.listing!));
      }
    } catch (e) {
      console.error("[AgenticLounge] bundle", e);
    } finally {
      setBundleLoading(false);
    }
  }, []);

  const togglePin = useCallback((tokenId: number) => {
    setPinned(prev => {
      let next: number[];
      if (prev.includes(tokenId)) {
        next = prev.filter(id => id !== tokenId);
      } else if (prev.length >= MAX_PINS) {
        return prev;
      } else {
        next = [...prev, tokenId];
      }
      saveNumSet(LS_PINNED, new Set(next));
      return next;
    });
  }, []);

  const selectedAgent = useMemo(
    () => (selectedId != null ? agents.find(a => Number(a.tokenId) === selectedId) ?? null : null),
    [agents, selectedId]
  );

  const pinnedAgents = useMemo(
    () =>
      pinned
        .map(id => agents.find(a => Number(a.tokenId) === id))
        .filter((a): a is AgentListItem => !!a),
    [pinned, agents]
  );

  if (!unlocked) {
    return <LoungeLock onUnlock={handleUnlock} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 pb-16">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 rounded-full px-3 py-1">
              <Bot className="w-3 h-3" />
              ERC-8004
            </div>
            <h1 className="font-mono text-2xl sm:text-3xl font-medium text-n-text tracking-tight">
              agentic lounge
            </h1>
            <p className="text-sm font-mono text-n-faint leading-relaxed max-w-xl">
              Every registered Normie agent — names, personas, skills, and on-chain identity in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLock}
            className="shrink-0 min-h-[44px] px-3 text-[11px] font-mono rounded-lg border border-n-border text-n-faint hover:text-n-text hover:border-n-muted touch-manipulation inline-flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            lock
          </button>
        </div>

        {totalCount > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-n-border text-n-muted">
              {totalCount.toLocaleString()} agents
            </span>
            <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-n-border text-n-muted">
              {discovered.size} viewed
            </span>
            {pinned.length > 0 && (
              <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 inline-flex items-center gap-1">
                <Star className="w-3 h-3" />
                {pinned.length} pinned
              </span>
            )}
          </div>
        )}
      </header>

      {pinnedAgents.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-n-faint flex items-center gap-1.5">
            <Star className="w-3 h-3 text-cyan-500" />
            pinned identities
          </h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
            {pinnedAgents.map(a => (
              <div key={a.tokenId} className="w-[min(100%,280px)] shrink-0">
                <AgentCard
                  agent={a}
                  listing={listings.get(Number(a.tokenId))}
                  discovered
                  pinned
                  dark={dark}
                  onClick={() => openAgent(Number(a.tokenId))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <AgentRegistry
        agents={agents}
        totalCount={totalCount}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={() => loadAgents(false)}
        dark={dark}
        discoveredIds={discovered}
        pinnedIds={pinned}
        listings={listings}
        onSelect={openAgent}
      />

      {loading && agents.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-n-faint" />
        </div>
      )}

      {selectedId != null && (
        <AgentDetailSheet
          tokenId={selectedId}
          agent={selectedAgent}
          bundle={bundle}
          loading={bundleLoading}
          dark={dark}
          pinned={pinned.includes(selectedId)}
          pinDisabled={!pinned.includes(selectedId) && pinned.length >= MAX_PINS}
          onClose={() => {
            setSelectedId(null);
            setBundle(null);
          }}
          onTogglePin={() => togglePin(selectedId)}
        />
      )}
    </div>
  );
}
