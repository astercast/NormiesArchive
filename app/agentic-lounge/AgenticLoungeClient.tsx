"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Star } from "lucide-react";
import PinnedSpriteStrip from "@/components/agentic/PinnedSpriteStrip";
import AgentRegistry from "@/components/agentic/AgentRegistry";
import AgentDetailSheet from "@/components/agentic/AgentDetailSheet";
import { fetchAgentCount, fetchAgentBundle, fetchAllAgents } from "@/lib/agentic/api";
import { MAX_PINS } from "@/lib/agentic/constants";
import { loadNumSet, saveNumSet, LS_PINNED } from "@/lib/agentic/storage";
import type { AgentBundle, AgentListItem } from "@/lib/agentic/types";

export default function AgenticLoungeClient() {
  const [dark, setDark] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<AgentBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [pinned, setPinned] = useState<number[]>([]);
  const [listings, setListings] = useState<
    Map<number, { listed: boolean; price?: number; currency?: string }>
  >(new Map());

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setPinned([...loadNumSet(LS_PINNED)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const count = await fetchAgentCount();
        if (cancelled) return;
        setTotalCount(count);
        const all = await fetchAllAgents("newest");
        if (cancelled) return;
        setAgents(all);
      } catch (e) {
        console.error("[AgenticLounge]", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openAgent = useCallback(async (tokenId: number) => {
    setSelectedId(tokenId);
    setBundle(null);
    setBundleLoading(true);
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 pb-16">
      <header className="space-y-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 rounded-full px-3 py-1">
            <Bot className="w-3 h-3" />
            ERC-8004
          </div>
          <h1 className="font-mono text-2xl sm:text-3xl font-medium text-n-text tracking-tight">
            agentic lounge
          </h1>
          <p className="text-sm font-mono text-n-faint leading-relaxed max-w-xl">
            Browse every registered Normie agent: personas, skills, services, and on-chain identity.
          </p>
        </div>

        {totalCount > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-n-border text-n-muted">
              {totalCount.toLocaleString()} agents
            </span>
            {pinned.length > 0 && (
              <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 inline-flex items-center gap-1">
                <Star className="w-3 h-3" />
                {pinned.length} pinned
              </span>
            )}
            {loading && (
              <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-n-border text-n-faint inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                syncing registry
              </span>
            )}
          </div>
        )}
      </header>

      {pinned.length > 0 && (
        <PinnedSpriteStrip tokenIds={pinned} dark={dark} onSelect={openAgent} />
      )}

      <AgentRegistry
        agents={agents}
        totalCount={totalCount}
        loading={loading}
        dark={dark}
        pinnedIds={pinned}
        listings={listings}
        onSelect={openAgent}
      />

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
