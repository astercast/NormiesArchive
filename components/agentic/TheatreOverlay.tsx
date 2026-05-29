"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Zap } from "lucide-react";
import { AGENTS_API } from "@/lib/agentic/constants";
import type { LiveTurn } from "@/lib/agentic/types";
import { trunc } from "@/lib/agentic/utils";

interface Props {
  live: LiveTurn | null;
  tickerLines: string[];
  activeConvos: number;
  agentCount: number;
  discovered: number;
  dark?: boolean;
  compact?: boolean;
}

function TypewriterLine({ text, keyId }: { text: string; keyId: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text, keyId]);

  return (
    <span className="text-n-text">
      {shown}
      {shown.length < text.length && (
        <span className="inline-block w-0.5 h-4 bg-cyan-500 ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

export default function TheatreOverlay({
  live,
  tickerLines,
  activeConvos,
  agentCount,
  discovered,
  dark,
  compact,
}: Props) {
  const speakerIsA = live?.speakerId === live?.aId;
  const speakerName = live
    ? speakerIsA
      ? live.aName
      : live.bName
    : "";
  const listenerName = live
    ? speakerIsA
      ? live.bName
      : live.aName
    : "";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-n-border bg-[var(--white)] shadow-lg ${
        compact ? "" : "min-h-[200px]"
      }`}
    >
      {/* Ambient glow when live */}
      <AnimatePresence>
        {live && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 80% 60% at 30% 50%, rgba(6,182,212,0.12), transparent),
                radial-gradient(ellipse 80% 60% at 70% 50%, rgba(139,92,246,0.08), transparent)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Header strip */}
      <div className="relative flex items-center gap-2 px-3 py-2 border-b border-n-border bg-n-surface/80">
        <Radio
          className={`w-3.5 h-3.5 shrink-0 ${live ? "text-cyan-500 animate-pulse" : "text-n-faint"}`}
        />
        <span className="text-[10px] font-mono uppercase tracking-widest text-n-faint">
          {live ? "live theatre" : "the hive theatre"}
        </span>
        <span className="ml-auto text-[10px] font-mono text-n-faint tabular-nums">
          {activeConvos > 0 ? `${activeConvos} talking` : `${discovered}/${agentCount} discovered`}
        </span>
      </div>

      {/* Live conversation */}
      <div className={`relative ${compact ? "p-3" : "p-4 sm:p-5"}`}>
        <AnimatePresence mode="wait">
          {live ? (
            <motion.div
              key={live.convoId + live.turnIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Portraits + resonance */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${AGENTS_API}/agents/image/${live.aId}`}
                    alt=""
                    width={48}
                    height={48}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 object-contain pixelated transition-all ${
                      live.speakerId === live.aId
                        ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.35)] scale-105"
                        : "border-n-border opacity-60"
                    }`}
                    style={{ filter: dark ? "invert(1)" : "none" }}
                  />
                  <span className="text-[10px] font-mono text-n-muted truncate max-w-full">
                    {trunc(live.aName, 14)}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 px-2 shrink-0">
                  <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide text-violet-600 dark:text-violet-400">
                    <Zap className="w-3 h-3" />
                    {live.resonanceScore}%
                  </div>
                  <div className="w-12 h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500 rounded-full opacity-70" />
                  <span className="text-[8px] font-mono text-n-faint text-center max-w-[80px] leading-tight">
                    {live.resonanceLabel}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${AGENTS_API}/agents/image/${live.bId}`}
                    alt=""
                    width={48}
                    height={48}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 object-contain pixelated transition-all ${
                      live.speakerId === live.bId
                        ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.35)] scale-105"
                        : "border-n-border opacity-60"
                    }`}
                    style={{ filter: dark ? "invert(1)" : "none" }}
                  />
                  <span className="text-[10px] font-mono text-n-muted truncate max-w-full">
                    {trunc(live.bName, 14)}
                  </span>
                </div>
              </div>

              {/* Shared traits */}
              {live.sharedTraits.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {live.sharedTraits.map(t => (
                    <span
                      key={t}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-violet-400/40 text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-950/30"
                    >
                      {trunc(t, 24)}
                    </span>
                  ))}
                </div>
              )}

              {/* Dialogue line */}
              <div className="text-center space-y-1.5 px-1">
                <p className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  {speakerName} → {listenerName}
                  <span className="text-n-faint ml-2">
                    {live.turnIndex + 1}/{live.totalTurns}
                  </span>
                </p>
                <p className="text-sm sm:text-base leading-relaxed font-body min-h-[3.5rem]">
                  <TypewriterLine
                    text={live.line}
                    keyId={`${live.convoId}-${live.turnIndex}`}
                  />
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-6 sm:py-8 space-y-2"
            >
              <p className="text-sm font-mono text-n-muted">
                Witness agents converse on the floor
              </p>
              <p className="text-xs font-mono text-n-faint max-w-xs mx-auto leading-relaxed">
                Pairs are matched by persona resonance — when two minds align, the theatre lights up.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ticker */}
      {tickerLines.length > 0 && (
        <div className="relative border-t border-n-border overflow-hidden bg-n-surface/50 h-8 flex items-center">
          <div className="hive-ticker whitespace-nowrap text-[10px] font-mono text-n-faint px-3">
            {tickerLines.join("  ·  ")}
            {"  ·  "}
            {tickerLines.join("  ·  ")}
          </div>
        </div>
      )}
    </div>
  );
}
