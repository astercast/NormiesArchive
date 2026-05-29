"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Lock,
  Loader2,
  Orbit,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
import type { AgentInfo } from "@/components/AgentSection";
import ExploreFeed from "@/components/agentic/ExploreFeed";
import AgentDetailSheet from "@/components/agentic/AgentDetailSheet";
import ChatPanel from "@/components/agentic/ChatPanel";
import LoungeStage from "@/components/agentic/LoungeStage";
import HiveNav from "@/components/agentic/HiveNav";
import TheatreOverlay from "@/components/agentic/TheatreOverlay";
import ConstellationMap from "@/components/agentic/ConstellationMap";
import DiscoverDeck from "@/components/agentic/DiscoverDeck";
import {
  fetchAgentCount,
  fetchAgentList,
  fetchAgentBundle,
} from "@/lib/agentic/api";
import {
  PASSCODE,
  LS_UNLOCK,
  CHAT_MAX,
  MAX_PINS,
  PAGE_SIZE,
  INITIAL_LIST_PAGES,
} from "@/lib/agentic/constants";
import {
  loadNumSet,
  saveNumSet,
  loadWitnessLog,
  saveWitnessLog,
  LS_DISCOVERED,
  LS_PINNED,
} from "@/lib/agentic/storage";
import { computeStageCap } from "@/lib/agentic/utils";
import type {
  AgentBundle,
  AgentListItem,
  BondEdge,
  ChatEntry,
  LiveTurn,
  MobileTab,
  WitnessEntry,
} from "@/lib/agentic/types";

/* ─── Passcode ────────────────────────────────────────────────────────── */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const push = useCallback(
    (d: string) => {
      if (shake || success) return;
      setDigits(prev => {
        if (prev.length >= 4) return prev;
        const next = [...prev, d];
        if (next.length === 4) {
          if (next.join("") === PASSCODE) {
            setSuccess(true);
            setTimeout(onUnlock, 400);
          } else {
            setShake(true);
            setTimeout(() => { setShake(false); setDigits([]); }, 550);
          }
        }
        return next;
      });
    },
    [shake, success, onUnlock]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-4 select-none">
      <motion.div
        animate={success ? { scale: [1, 1.05, 1] } : shake ? { x: [-12, 12, -8, 8, 0] } : {}}
        className="text-center space-y-3"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center">
          <Lock className={`w-7 h-7 ${success ? "text-cyan-500" : "text-n-muted"}`} />
        </div>
        <h1 className="font-mono text-xl text-n-text tracking-tight">the hive</h1>
        <p className="text-sm font-mono text-n-faint max-w-xs leading-relaxed">
          Enter the ERC-8004 agent constellation. Passcode required for early access.
        </p>
      </motion.div>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center transition-all ${
              i < digits.length ? "border-cyan-500 bg-cyan-500/10" : "border-n-border"
            }`}
          >
            {i < digits.length ? "●" : ""}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {["1","2","3","4","5","6","7","8","9","←","0",""].map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => (k === "←" ? setDigits(p => p.slice(0,-1)) : k ? push(k) : undefined)}
            disabled={!k || shake}
            className={`min-h-[52px] font-mono text-base rounded-xl border border-n-border touch-manipulation ${
              k ? "active:bg-n-surface hover:border-n-text text-n-muted" : "invisible"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildBonds(witnessLog: WitnessEntry[]): BondEdge[] {
  const map = new Map<string, BondEdge>();
  for (const w of witnessLog) {
    const key = [Math.min(w.aId, w.bId), Math.max(w.aId, w.bId)].join("-");
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { aId: Math.min(w.aId, w.bId), bId: Math.max(w.aId, w.bId), count: 1 });
  }
  return [...map.values()];
}

/* ─── The Hive ────────────────────────────────────────────────────────── */
function HiveRoom() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [infoMap, setInfoMap] = useState<Map<number, AgentInfo>>(new Map());
  const [bundles, setBundles] = useState<Map<number, AgentBundle>>(new Map());
  const [listings, setListings] = useState<Map<number, { listed: boolean; price?: number; currency?: string }>>(new Map());
  const [loungeIds, setLoungeIds] = useState<number[]>([]);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [witnessLog, setWitnessLog] = useState<WitnessEntry[]>([]);
  const [discoveredIds, setDiscoveredIds] = useState<Set<number>>(() => new Set());
  const [skippedIds, setSkippedIds] = useState<Set<number>>(() => new Set());
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("hive");
  const [chatTab, setChatTab] = useState<"live" | "witness">("live");
  const [focusId, setFocusId] = useState<number | null>(null);
  const [focusBundle, setFocusBundle] = useState<AgentBundle | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(null);
  const [activeConvos, setActiveConvos] = useState(0);
  const [tickerLines, setTickerLines] = useState<string[]>([]);

  const bonds = useMemo(() => buildBonds(witnessLog), [witnessLog]);
  const undiscovered = useMemo(
    () => agents.filter(a => !discoveredIds.has(Number(a.tokenId)) && !skippedIds.has(Number(a.tokenId))).length,
    [agents, discoveredIds, skippedIds]
  );
  const discoveryPct = agentCount > 0 ? Math.min(100, Math.round((discoveredIds.size / agentCount) * 100)) : 0;

  useEffect(() => {
    setDiscoveredIds(loadNumSet(LS_DISCOVERED));
    setPinnedIds([...loadNumSet(LS_PINNED)].slice(0, MAX_PINS));
    setWitnessLog(loadWitnessLog());
    setPersistReady(true);
  }, []);
  useEffect(() => { if (persistReady) saveNumSet(LS_DISCOVERED, discoveredIds); }, [discoveredIds, persistReady]);
  useEffect(() => { if (persistReady) saveNumSet(LS_PINNED, new Set(pinnedIds)); }, [pinnedIds, persistReady]);
  useEffect(() => { if (persistReady) saveWitnessLog(witnessLog); }, [witnessLog, persistReady]);
  useEffect(() => {
    const chk = () => setDark(document.documentElement.classList.contains("dark"));
    chk();
    const mo = new MutationObserver(chk);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const markDiscovered = useCallback((tokenId: number) => {
    setDiscoveredIds(prev => {
      if (prev.has(tokenId)) return prev;
      const next = new Set(prev);
      next.add(tokenId);
      return next;
    });
  }, []);

  const ensureBundle = useCallback(async (tokenId: number): Promise<AgentBundle | null> => {
    const cached = bundles.get(tokenId);
    if (cached?.info) return cached;
    const bundle = await fetchAgentBundle(tokenId);
    if (!bundle) return null;
    setBundles(prev => new Map(prev).set(tokenId, bundle));
    if (bundle.info) setInfoMap(prev => new Map(prev).set(tokenId, bundle.info!));
    if (bundle.listing) setListings(prev => new Map(prev).set(tokenId, bundle.listing!));
    return bundle;
  }, [bundles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [count, listRes] = await Promise.all([
          fetchAgentCount(),
          fetchAgentList({ limit: PAGE_SIZE * INITIAL_LIST_PAGES, sort: "newest" }),
        ]);
        if (cancelled) return;
        setAgentCount(count || listRes.items.length);
        setAgents(listRes.items);
        const cap = computeStageCap(window.innerWidth);
        const seed = [...listRes.items].sort(() => Math.random() - 0.5).slice(0, cap).map(a => Number(a.tokenId));
        setLoungeIds(seed);
        setLoading(false);
        for (const tid of seed) {
          if (cancelled) break;
          await ensureBundle(tid);
          await new Promise(r => setTimeout(r, 80));
        }
      } catch (e) {
        console.error("[Hive]", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const tid of loungeIds) {
      if (!infoMap.has(tid)) ensureBundle(tid);
    }
  }, [loungeIds, infoMap, ensureBundle]);

  useEffect(() => {
    if (!persistReady) return;
    for (const id of pinnedIds) {
      setLoungeIds(prev => prev.includes(id) ? prev : [...prev, id].slice(0, computeStageCap(window.innerWidth)));
    }
  }, [pinnedIds, persistReady]);

  const bringToStage = useCallback((tokenId: number) => {
    markDiscovered(tokenId);
    setMobileTab("hive");
    setLoungeIds(prev => {
      if (prev.includes(tokenId)) return prev;
      const cap = computeStageCap(window.innerWidth);
      if (prev.length < cap) return [...prev, tokenId];
      const removable = prev.filter(id => !pinnedIds.includes(id));
      if (!removable.length) return prev;
      const rm = removable[Math.floor(Math.random() * removable.length)];
      return [...prev.filter(id => id !== rm), tokenId];
    });
    ensureBundle(tokenId);
  }, [markDiscovered, pinnedIds, ensureBundle]);

  const togglePin = useCallback((tokenId: number) => {
    markDiscovered(tokenId);
    setPinnedIds(prev => {
      if (prev.includes(tokenId)) return prev.filter(id => id !== tokenId);
      if (prev.length >= MAX_PINS) return prev;
      return [...prev, tokenId];
    });
    bringToStage(tokenId);
  }, [markDiscovered, bringToStage]);

  const openAgent = useCallback(async (tokenId: number) => {
    markDiscovered(tokenId);
    setFocusId(tokenId);
    setFocusLoading(true);
    setFocusBundle(bundles.get(tokenId) ?? null);
    const bundle = await ensureBundle(tokenId);
    setFocusBundle(bundle);
    setFocusLoading(false);
  }, [markDiscovered, bundles, ensureBundle]);

  useEffect(() => {
    if (focusId == null) { setFocusBundle(null); setFocusLoading(false); }
  }, [focusId]);

  const onChatEntry = useCallback((entry: ChatEntry) => {
    setChatLog(prev => [entry, ...prev].slice(0, CHAT_MAX));
    setDiscoveredIds(prev => { const n = new Set(prev); n.add(entry.aId); n.add(entry.bId); return n; });
    const snippet = entry.lines[0]?.text;
    if (snippet) {
      setTickerLines(prev => [`${entry.aName}: ${snippet.slice(0, 60)}`, ...prev].slice(0, 8));
    }
  }, []);

  const onWitness = useCallback((entry: WitnessEntry) => {
    setWitnessLog(prev => prev.some(w => w.id === entry.id) ? prev : [entry, ...prev]);
  }, []);

  const onLiveTurn = useCallback((turn: LiveTurn | null) => {
    setLiveTurn(turn);
    if (turn) setMobileTab(prev => prev === "archive" ? prev : "hive");
  }, []);

  const focusAgent = useMemo(
    () => focusId != null ? agents.find(a => Number(a.tokenId) === focusId) : null,
    [focusId, agents]
  );

  const stageProps = {
    agents,
    loungeIds,
    setLoungeIds,
    infoMap,
    pinnedIds,
    dark,
    loading,
    onAgentClick: openAgent,
    onDiscover: markDiscovered,
    onChatEntry,
    onWitness,
    onLiveTurn,
    onActiveConvos: setActiveConvos,
  };

  const archivePanel = (
    <div className="space-y-4">
      <ChatPanel
        chatLog={chatLog}
        witnessLog={witnessLog}
        tab={chatTab}
        onTabChange={setChatTab}
        onSummonPair={(a, b) => { bringToStage(a); bringToStage(b); }}
        empty={loading}
      />
      <ExploreFeed
        dark={dark}
        discoveredIds={discoveredIds}
        pinnedIds={pinnedIds}
        loungeIds={loungeIds}
        listings={listings}
        onSelect={openAgent}
      />
    </div>
  );

  const youStats = (
    <div className="grid grid-cols-3 gap-2 text-center">
      {[
        { label: "discovered", val: discoveredIds.size },
        { label: "bonds", val: bonds.length },
        { label: "witnessed", val: witnessLog.length },
      ].map(s => (
        <div key={s.label} className="rounded-lg bg-n-surface p-2.5">
          <p className="text-lg font-mono font-medium text-n-text tabular-nums">{s.val}</p>
          <p className="text-[9px] font-mono text-n-faint uppercase">{s.label}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative pb-20 lg:pb-6 min-h-[100dvh]">
      {/* Ambient field */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background: `
            radial-gradient(900px 500px at 15% -5%, rgba(6,182,212,0.14), transparent 55%),
            radial-gradient(700px 450px at 85% 15%, rgba(139,92,246,0.10), transparent 50%),
            radial-gradient(600px 400px at 50% 100%, rgba(6,182,212,0.06), transparent 45%)`,
        }}
      />

      <div className="max-w-[1500px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5 space-y-4">
        {/* ── Header ── */}
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Orbit className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-mono text-lg sm:text-2xl font-medium text-n-text tracking-tight">
                the hive
              </h1>
              <p className="text-[11px] font-mono text-n-faint truncate">
                persona resonance · live theatre · constellation bonds
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono px-2 py-1 rounded-full border border-cyan-400/40 text-cyan-700 dark:text-cyan-300">
                ERC-8004
              </span>
              {activeConvos > 0 && (
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  {activeConvos} live
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-n-muted">
            {loading ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> syncing…</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1"><Bot className="w-3.5 h-3.5" />{agentCount.toLocaleString()} agents</span>
                <span className="text-n-faint">·</span>
                <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" />{loungeIds.length} on floor</span>
                <span className="text-n-faint">·</span>
                <span>{discoveryPct}% mapped</span>
              </>
            )}
          </div>
          <div className="h-1 rounded-full bg-n-border overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-400"
              animate={{ width: `${discoveryPct}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          {youStats}
        </header>

        {/* ═══ MOBILE: tab panels ═══ */}
        <div className="lg:hidden space-y-4">
          {mobileTab === "hive" && (
            <div className="space-y-3">
              <TheatreOverlay
                live={liveTurn}
                tickerLines={tickerLines}
                activeConvos={activeConvos}
                agentCount={agentCount}
                discovered={discoveredIds.size}
                dark={dark}
                compact
              />
              <LoungeStage {...stageProps} className="rounded-xl" />
            </div>
          )}
          {mobileTab === "deck" && (
            <DiscoverDeck
              agents={agents}
              discoveredIds={discoveredIds}
              dark={dark}
              onSummon={bringToStage}
              onSkip={id => setSkippedIds(prev => new Set(prev).add(id))}
            />
          )}
          {mobileTab === "map" && (
            <ConstellationMap
              discoveredIds={discoveredIds}
              infoMap={infoMap}
              bonds={bonds}
              pinnedIds={pinnedIds}
              dark={dark}
              onSelect={openAgent}
              className="min-h-[calc(100dvh-280px)]"
            />
          )}
          {mobileTab === "archive" && archivePanel}
        </div>

        {/* ═══ DESKTOP: tri-pane hive ═══ */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4 min-h-[640px]">
          {/* Left: constellation */}
          <div className="col-span-3 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2 px-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-n-faint">constellation</span>
            </div>
            <ConstellationMap
              discoveredIds={discoveredIds}
              infoMap={infoMap}
              bonds={bonds}
              pinnedIds={pinnedIds}
              dark={dark}
              onSelect={openAgent}
              className="flex-1 min-h-[480px]"
            />
            {pinnedIds.length > 0 && (
              <div className="rounded-xl border border-n-border p-3 space-y-2">
                <p className="text-[10px] font-mono text-n-faint uppercase flex items-center gap-1">
                  <Star className="w-3 h-3" /> pinned ({pinnedIds.length}/{MAX_PINS})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pinnedIds.map(tid => (
                    <button key={tid} type="button" onClick={() => openAgent(tid)}
                      className="text-[10px] font-mono px-2 py-1 rounded-md border border-cyan-400/50 text-cyan-700 dark:text-cyan-300 touch-manipulation">
                      {infoMap.get(tid)?.name ?? `#${tid}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center: floor + theatre */}
          <div className="col-span-5 flex flex-col gap-3 min-h-0">
            <TheatreOverlay
              live={liveTurn}
              tickerLines={tickerLines}
              activeConvos={activeConvos}
              agentCount={agentCount}
              discovered={discoveredIds.size}
              dark={dark}
            />
            <LoungeStage {...stageProps} className="flex-1 rounded-xl" />
          </div>

          {/* Right: deck + archive */}
          <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto max-h-[calc(100vh-180px)]">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-n-faint">discover deck</span>
            </div>
            <DiscoverDeck
              agents={agents}
              discoveredIds={discoveredIds}
              dark={dark}
              onSummon={bringToStage}
              onSkip={id => setSkippedIds(prev => new Set(prev).add(id))}
            />
            <div className="border-t border-n-border pt-3">
              {archivePanel}
            </div>
          </div>
        </div>

        <footer className="text-[10px] font-mono text-n-faint flex flex-wrap gap-x-4 pt-2">
          <span>Resonance-matched pairs · live persona theatre · bonds grow with every witness</span>
          <a href="https://api.normies.art" target="_blank" rel="noopener noreferrer" className="underline hover:text-n-muted">agents API ↗</a>
        </footer>
      </div>

      <HiveNav
        active={mobileTab}
        onChange={setMobileTab}
        liveBadge={activeConvos > 0}
        undiscovered={undiscovered}
      />

      {focusId != null && (
        <AgentDetailSheet
          tokenId={focusId}
          agent={focusAgent}
          bundle={focusBundle}
          loading={focusLoading}
          dark={dark}
          pinned={pinnedIds.includes(focusId)}
          onFloor={loungeIds.includes(focusId)}
          pinDisabled={!pinnedIds.includes(focusId) && pinnedIds.length >= MAX_PINS}
          onClose={() => setFocusId(null)}
          onSummon={() => bringToStage(focusId)}
          onTogglePin={() => togglePin(focusId)}
        />
      )}
    </div>
  );
}

export default function AgenticLoungeClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setUnlocked(localStorage.getItem(LS_UNLOCK) === "1");
    setChecked(true);
  }, []);
  const unlock = useCallback(() => {
    localStorage.setItem(LS_UNLOCK, "1");
    setUnlocked(true);
  }, []);
  if (!checked) return null;
  if (!unlocked) return <LockScreen onUnlock={unlock} />;
  return <HiveRoom />;
}
