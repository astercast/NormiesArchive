"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Heart, SkipForward, Sparkles, Loader2 } from "lucide-react";
import { AGENTS_API } from "@/lib/agentic/constants";
import { fetchPersonaPreview } from "@/lib/agentic/api";
import type { AgentListItem, PersonaPreview } from "@/lib/agentic/types";
import { trunc } from "@/lib/agentic/utils";

interface Props {
  agents: AgentListItem[];
  discoveredIds: Set<number>;
  dark?: boolean;
  onSummon: (tokenId: number) => void;
  onSkip: (tokenId: number) => void;
}

export default function DiscoverDeck({
  agents,
  discoveredIds,
  dark,
  onSummon,
  onSkip,
}: Props) {
  const [personas, setPersonas] = useState<Map<number, PersonaPreview>>(new Map());
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const skipOpacity = useTransform(x, [-100, 0], [1, 0]);

  const deck = useMemo(
    () =>
      agents
        .filter(a => !discoveredIds.has(Number(a.tokenId)))
        .slice(0, 30),
    [agents, discoveredIds]
  );

  const current = deck[0];
  const tid = current ? Number(current.tokenId) : null;

  useEffect(() => {
    if (tid == null || personas.has(tid)) return;
    let cancelled = false;
    (async () => {
      setLoadingId(tid);
      const p = await fetchPersonaPreview(tid);
      if (!cancelled && p) setPersonas(prev => new Map(prev).set(tid, p));
      if (!cancelled) setLoadingId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [tid, personas]);

  const dismiss = useCallback(
    (dir: "left" | "right") => {
      if (!current) return;
      const id = Number(current.tokenId);
      setExitDir(dir);
      setTimeout(() => {
        if (dir === "right") onSummon(id);
        else onSkip(id);
        setExitDir(null);
        x.set(0);
      }, 280);
    },
    [current, onSummon, onSkip, x]
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 100) dismiss("right");
    else if (info.offset.x < -100) dismiss("left");
    else x.set(0);
  };

  const persona = tid != null ? personas.get(tid) : null;

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-3 rounded-xl border border-n-border bg-[var(--white)]">
        <Sparkles className="w-8 h-8 text-cyan-500" />
        <p className="text-sm font-mono text-n-text">Deck cleared</p>
        <p className="text-xs font-mono text-n-faint max-w-xs">
          You&apos;ve scanned every agent in the current batch. Check the archive or wait for new registrations.
        </p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-sm space-y-4">
      <p className="text-center text-[10px] font-mono text-n-faint uppercase tracking-widest">
        swipe to discover · {deck.length} remaining
      </p>

      <div className="relative h-[420px] sm:h-[460px]">
        {/* Next card peek */}
        {deck[1] && (
          <div className="absolute inset-x-4 top-3 bottom-8 rounded-2xl border border-n-border bg-n-surface scale-[0.96] opacity-50" />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={current.tokenId}
            style={{ x, rotate }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              x: exitDir === "right" ? 300 : exitDir === "left" ? -300 : 0,
              transition: { duration: 0.28 },
            }}
            className="absolute inset-0 rounded-2xl border border-n-border bg-[var(--white)] shadow-xl overflow-hidden touch-none cursor-grab active:cursor-grabbing"
          >
            {/* Swipe hints */}
            <motion.div
              style={{ opacity: likeOpacity }}
              className="absolute top-6 right-6 z-10 px-3 py-1.5 rounded-lg border-2 border-emerald-500 text-emerald-600 font-mono text-sm rotate-12 pointer-events-none"
            >
              SUMMON
            </motion.div>
            <motion.div
              style={{ opacity: skipOpacity }}
              className="absolute top-6 left-6 z-10 px-3 py-1.5 rounded-lg border-2 border-n-muted text-n-muted font-mono text-sm -rotate-12 pointer-events-none"
            >
              SKIP
            </motion.div>

            <div className="h-full flex flex-col">
              <div className="relative flex-1 flex items-center justify-center bg-gradient-to-b from-cyan-500/5 to-violet-500/5 p-6">
                {loadingId === tid ? (
                  <Loader2 className="w-8 h-8 animate-spin text-n-faint" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`${AGENTS_API}/agents/image/${tid}`}
                    alt=""
                    className="w-32 h-32 sm:w-40 sm:h-40 object-contain pixelated drop-shadow-lg"
                    style={{ filter: dark ? "invert(1)" : "none" }}
                  />
                )}
              </div>
              <div className="p-5 space-y-3 border-t border-n-border">
                <div>
                  <h3 className="font-mono text-xl font-medium text-n-text">
                    {persona?.name ?? current.name}
                  </h3>
                  <p className="text-xs font-mono text-n-faint mt-0.5">
                    #{tid} · {(persona?.type ?? current.type).toLowerCase()}
                  </p>
                </div>
                {persona?.tagline && (
                  <p className="text-sm text-n-muted italic leading-snug">
                    &ldquo;{persona.tagline}&rdquo;
                  </p>
                )}
                {persona?.greeting && (
                  <p className="text-sm text-n-text leading-relaxed line-clamp-3">
                    {trunc(persona.greeting, 160)}
                  </p>
                )}
                {persona?.personalityTraits && (
                  <div className="flex flex-wrap gap-1.5">
                    {persona.personalityTraits.slice(0, 3).map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-n-border text-n-faint"
                      >
                        {trunc(t, 28)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => dismiss("left")}
          className="w-14 h-14 rounded-full border-2 border-n-border flex items-center justify-center text-n-muted hover:border-n-text hover:text-n-text transition-colors touch-manipulation"
          aria-label="Skip"
        >
          <SkipForward className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => dismiss("right")}
          className="w-16 h-16 rounded-full border-2 border-cyan-500 bg-cyan-500/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-colors touch-manipulation shadow-[0_0_24px_rgba(6,182,212,0.25)]"
          aria-label="Summon to floor"
        >
          <Heart className="w-7 h-7 fill-current" />
        </button>
      </div>
    </div>
  );
}
