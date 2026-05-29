"use client";

import { Bot, Sparkles } from "lucide-react";
import { formatEth } from "@/lib/agentic/utils";
import type { AgentListItem, PersonaPreview } from "@/lib/agentic/types";
import { AGENTS_API } from "@/lib/agentic/constants";
import { trunc } from "@/lib/agentic/utils";

interface Props {
  agent: AgentListItem;
  persona?: PersonaPreview | null;
  listing?: { listed: boolean; price?: number; currency?: string } | null;
  discovered?: boolean;
  pinned?: boolean;
  onFloor?: boolean;
  dark?: boolean;
  onClick: () => void;
}

export default function AgentCard({
  agent,
  persona,
  listing,
  discovered,
  pinned,
  onFloor,
  dark,
  onClick,
}: Props) {
  const tid = Number(agent.tokenId);
  const name = persona?.name ?? agent.name;
  const tagline = persona?.tagline;
  const type = persona?.type ?? agent.type;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 touch-manipulation transition-all active:scale-[0.98] ${
        pinned
          ? "border-cyan-400/70 bg-cyan-50/80 dark:bg-cyan-950/30 ring-1 ring-cyan-400/30"
          : onFloor
            ? "border-cyan-300/50 bg-n-surface"
            : discovered
              ? "border-violet-300/40 bg-violet-50/30 dark:bg-violet-950/20"
              : "border-n-border bg-[var(--white)] hover:border-n-muted"
      }`}
    >
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${AGENTS_API}/agents/image/${tid}`}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className="w-14 h-14 shrink-0 rounded-lg border border-n-border bg-n-surface object-contain pixelated"
          style={{ filter: dark ? "invert(1)" : "none" }}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-n-text truncate">{name}</p>
              <p className="text-[11px] font-mono text-n-faint tabular-nums">
                #{tid} · {type.toLowerCase()}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {pinned && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                  pinned
                </span>
              )}
              {onFloor && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-n-surface border border-n-border text-n-muted">
                  on floor
                </span>
              )}
            </div>
          </div>
          {tagline && (
            <p className="text-xs text-n-muted italic line-clamp-2 leading-snug">
              &ldquo;{trunc(tagline, 100)}&rdquo;
            </p>
          )}
          {persona?.greeting && !tagline && (
            <p className="text-xs text-n-muted line-clamp-2 leading-snug">
              {trunc(persona.greeting, 100)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {listing?.listed && listing.price != null && (
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                {formatEth(listing.price, listing.currency)} listed
              </span>
            )}
            <span className="text-[9px] font-mono text-n-faint inline-flex items-center gap-1">
              <Bot className="w-2.5 h-2.5" />
              ERC-8004
            </span>
            {persona?.personalityTraits?.[0] && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-n-border text-n-faint truncate max-w-[140px]">
                {trunc(persona.personalityTraits[0], 28)}
              </span>
            )}
          </div>
        </div>
      </div>
      {persona?.personalityTraits && persona.personalityTraits.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {persona.personalityTraits.slice(0, 3).map((t, i) => (
            <span
              key={i}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-n-border/80 text-n-faint"
            >
              {trunc(t, 24)}
            </span>
          ))}
        </div>
      )}
      {!discovered && (
        <p className="mt-2 text-[10px] font-mono text-cyan-600/80 dark:text-cyan-400/80 inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          tap to discover
        </p>
      )}
    </button>
  );
}
