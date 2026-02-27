"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, ExternalLink, Clock } from "lucide-react";
import NormieGrid from "@/components/NormieGrid";
import { buildSimulatedFrames } from "@/lib/pixelUtils";

const BASE_API = "https://api.normies.art";
const FRAME_MS = 350; // ms per animation frame
const POLL_MS  = 60_000; // re-check every 60s

interface LatestEntry {
  tokenId:    number;
  blockNumber: number;
  txHash:     string;
  level:      number;
  ap:         number;
  type:       string;
  editCount:  number;
}

interface LatestData {
  entries:     LatestEntry[];
  latestBlock: number;
  savedAt:     number;
  indexing:    boolean;
}

// ─── Per-normie animation state ───────────────────────────────────────────────

interface NormieFrames {
  tokenId: number;
  frames:  string[];
  ready:   boolean;
}

async function loadFrames(tokenId: number): Promise<string[]> {
  const [origRes, currRes, histRes] = await Promise.all([
    fetch(`${BASE_API}/normie/${tokenId}/original/pixels`),
    fetch(`${BASE_API}/normie/${tokenId}/pixels`),
    fetch(`/api/normie/${tokenId}/history`),
  ]);
  if (!origRes.ok || !currRes.ok) return [];
  const [originalStr, currentStr] = await Promise.all([
    origRes.text().then(t => t.trim()),
    currRes.text().then(t => t.trim()),
  ]);
  if (originalStr.length !== 1600 || currentStr.length !== 1600) return [];
  const hist = histRes.ok ? await histRes.json() : { edits: [] };
  const edits = hist.edits ?? [];
  return buildSimulatedFrames(originalStr, currentStr, edits);
}

// ─── Hero — autoplaying looping animation ────────────────────────────────────

function HeroNormie({ entry }: { entry: LatestEntry }) {
  const [frameData, setFrameData] = useState<NormieFrames>({ tokenId: entry.tokenId, frames: [], ready: false });
  const [step,      setStep]      = useState(0);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load frames when entry changes
  useEffect(() => {
    setFrameData({ tokenId: entry.tokenId, frames: [], ready: false });
    setStep(0);
    let cancelled = false;
    loadFrames(entry.tokenId).then(frames => {
      if (cancelled) return;
      setFrameData({ tokenId: entry.tokenId, frames, ready: true });
    });
    return () => { cancelled = true; };
  }, [entry.tokenId]);

  // Loop animation
  useEffect(() => {
    if (!frameData.ready || frameData.frames.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setStep(prev => (prev + 1) % frameData.frames.length);
    }, FRAME_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [frameData.ready, frameData.frames.length]);

  const currentFrame = frameData.frames[step] ?? "";

  return (
    <div className="flex flex-col gap-4">
      {/* Canvas */}
      <div className="relative w-full max-w-[400px] mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={entry.tokenId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full aspect-square"
          >
            {!frameData.ready ? (
              <div className="w-full h-full border border-n-border rounded bg-n-surface flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-n-faint" />
              </div>
            ) : (
              <NormieGrid
                pixelsStr={currentFrame}
                scale={10}
                className="w-full h-full rounded border border-n-border"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Frame indicator dots */}
        {frameData.ready && frameData.frames.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {frameData.frames.map((_, i) => (
              <div
                key={i}
                className={`w-1 h-1 rounded-full transition-all duration-200 ${
                  i === step ? "bg-n-text scale-125" : "bg-n-border"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/normie/${entry.tokenId}`}
            className="text-lg font-mono font-semibold text-n-text hover:underline flex items-center gap-1.5"
          >
            normie #{entry.tokenId}
            <ExternalLink className="w-3.5 h-3.5 text-n-faint" />
          </Link>
          <div className="flex items-center gap-3 mt-1">
            {entry.type !== "Human" && (
              <span className="text-[10px] font-mono text-n-muted border border-n-border px-1.5 py-px rounded">
                {entry.type.toLowerCase()}
              </span>
            )}
            <span className="text-xs font-mono text-n-faint">level {entry.level}</span>
            <span className="text-xs font-mono text-n-faint">{entry.ap} AP</span>
            <span className="text-xs font-mono text-n-faint">{entry.editCount} edits</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] font-mono text-n-faint">block</p>
          <p className="text-xs font-mono text-n-muted">{entry.blockNumber.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Thumbnail card ───────────────────────────────────────────────────────────

function NormieCard({ entry, active, onClick }: { entry: LatestEntry; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left border rounded transition-all ${
        active
          ? "border-n-text bg-n-surface"
          : "border-n-border hover:border-n-muted hover:bg-n-surface"
      }`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-t">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE_API}/normie/${entry.tokenId}/image.svg`}
          alt={`normie #${entry.tokenId}`}
          className="w-full h-full pixelated group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>
      <div className="px-2 py-1.5">
        <p className="text-[11px] font-mono text-n-text truncate">#{entry.tokenId}</p>
        <p className="text-[9px] font-mono text-n-faint">block {entry.blockNumber.toLocaleString()}</p>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LatestWorksClient() {
  const [data,       setData]       = useState<LatestData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroIndex,  setHeroIndex]  = useState(0);
  const prevBlockRef                = useRef<number>(0);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/latest?count=10&v=${Date.now()}`);
      if (!res.ok) throw new Error("fetch failed");
      const d: LatestData = await res.json();

      // If new edits came in, reset hero to the newest
      if (prevBlockRef.current && d.latestBlock > prevBlockRef.current) {
        setHeroIndex(0);
      }
      prevBlockRef.current = d.latestBlock;
      setData(d);
    } catch (err) {
      console.error("[latest]", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const hero  = data?.entries[heroIndex] ?? null;
  const rest  = data?.entries ?? [];

  const timeAgo = (ms: number) => {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div className="space-y-8">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-mono text-n-faint">
          most recently edited normies on-chain · auto-refreshes every minute
        </p>
        <div className="flex items-center gap-3">
          {data && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-n-faint">
              <Clock className="w-3 h-3" />
              {timeAgo(data.savedAt)}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1 text-xs font-mono text-n-muted hover:text-n-text transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-20 text-n-faint font-mono text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          loading latest works…
        </div>
      ) : !hero ? (
        <p className="text-xs font-mono text-n-faint py-12 text-center">No edits indexed yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-12">

          {/* Hero — left / top */}
          <div className="max-w-[420px] w-full">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-mono text-n-faint uppercase tracking-widest">latest edit</span>
              <div className="h-px flex-1 bg-n-border" />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={hero.tokenId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <HeroNormie entry={hero} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Sidebar grid — right / bottom */}
          <div className="w-full lg:w-[280px]">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-mono text-n-faint uppercase tracking-widest">recent</span>
              <div className="h-px flex-1 bg-n-border" />
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-3 gap-2">
              {rest.map((entry, i) => (
                <NormieCard
                  key={entry.tokenId}
                  entry={entry}
                  active={i === heroIndex}
                  onClick={() => setHeroIndex(i)}
                />
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
