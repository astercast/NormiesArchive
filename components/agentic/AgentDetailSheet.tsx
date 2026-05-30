"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Bot,
  ExternalLink,
  Loader2,
  Star,
  X,
  Zap,
  Globe,
  ShoppingBag,
} from "lucide-react";
import type { AgentBundle, AgentListItem } from "@/lib/agentic/types";
import { AGENTS_API } from "@/lib/agentic/constants";
import { formatEth, trunc } from "@/lib/agentic/utils";

interface Props {
  tokenId: number;
  agent?: AgentListItem | null;
  bundle: AgentBundle | null;
  loading: boolean;
  dark?: boolean;
  pinned: boolean;
  pinDisabled: boolean;
  onClose: () => void;
  onTogglePin: () => void;
}

export default function AgentDetailSheet({
  tokenId,
  agent,
  bundle,
  loading,
  dark,
  pinned,
  pinDisabled,
  onClose,
  onTogglePin,
}: Props) {
  const info = bundle?.info;
  const persona = bundle?.persona;
  const card = bundle?.card;
  const metadata = bundle?.metadata;
  const listing = bundle?.listing;
  const name = info?.name ?? persona?.name ?? agent?.name ?? `#${tokenId}`;
  const type = info?.type ?? persona?.type ?? agent?.type ?? "Human";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="w-full sm:max-w-lg flex flex-col max-h-[100dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl border border-n-border bg-[var(--white)] shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-n-border bg-[var(--white)] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${AGENTS_API}/agents/image/${tokenId}`}
              alt=""
              width={48}
              height={48}
              className="w-12 h-12 shrink-0 rounded-lg border border-n-border bg-n-surface object-contain pixelated"
              style={{ filter: dark ? "invert(1)" : "none" }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-mono text-base font-medium text-n-text truncate">{name}</h2>
              <p className="text-[11px] font-mono text-n-faint truncate">
                #{tokenId} · {type.toLowerCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-n-border text-n-muted hover:text-n-text hover:border-n-muted touch-manipulation"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 sm:p-5 space-y-4">
            {(persona?.tagline || info?.tagline) && (
              <p className="text-sm text-n-muted italic leading-snug">
                &ldquo;{persona?.tagline || info?.tagline}&rdquo;
              </p>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-xs font-mono text-n-muted py-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading persona from API…
              </div>
            )}

            <button
              type="button"
              onClick={onTogglePin}
              disabled={pinDisabled}
              className={`w-full min-h-[48px] px-4 text-sm font-mono rounded-lg border transition-colors touch-manipulation disabled:opacity-40 ${
                pinned
                  ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300"
                  : "border-n-border text-n-muted hover:border-n-text"
              }`}
            >
              <Star className={`w-4 h-4 inline mr-1 ${pinned ? "fill-cyan-500 text-cyan-500" : ""}`} />
              {pinned ? "Pinned" : "Pin to lounge"}
            </button>

            {listing?.listed && listing.price != null && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5">
                <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[10px] font-mono text-emerald-800/70 dark:text-emerald-300/70 uppercase tracking-wide">
                    listed on OpenSea
                  </p>
                  <p className="text-sm font-mono font-medium text-emerald-800 dark:text-emerald-300">
                    {formatEth(listing.price, listing.currency)}
                  </p>
                </div>
                <a
                  href={`https://opensea.io/assets/ethereum/0x64951d92e345C50381267380e2975f66810E869c/${tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[11px] font-mono text-emerald-700 dark:text-emerald-400 underline"
                >
                  view ↗
                </a>
              </div>
            )}

            {card?.skills && card.skills.length > 0 && (
              <section>
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> A2A skills
                </p>
                <div className="space-y-2">
                  {card.skills.map(skill => (
                    <div
                      key={skill.id}
                      className="rounded-lg border border-n-border px-3 py-2.5 bg-n-surface/50"
                    >
                      <p className="text-sm font-mono font-medium text-n-text">{skill.name}</p>
                      <p className="text-xs text-n-muted mt-0.5 leading-snug">{skill.description}</p>
                      {skill.examples && skill.examples.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {skill.examples.map((example, i) => (
                            <p
                              key={i}
                              className="text-xs text-n-text leading-relaxed rounded-md border border-n-border/80 bg-[var(--white)] px-2.5 py-2 whitespace-pre-wrap"
                            >
                              {example}
                            </p>
                          ))}
                        </div>
                      )}
                      {skill.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.tags.map(t => (
                            <span
                              key={t}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-n-border text-n-faint"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {metadata?.services && metadata.services.length > 0 && (
              <section>
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Globe className="w-3 h-3" /> registered services
                </p>
                <div className="space-y-1.5">
                  {metadata.services.map((svc, i) => (
                    <a
                      key={i}
                      href={svc.endpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-lg border border-n-border px-3 py-2 hover:border-n-muted transition-colors touch-manipulation"
                    >
                      <span className="text-xs font-mono text-n-text">{svc.name}</span>
                      <ExternalLink className="w-3 h-3 text-n-faint shrink-0" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {(persona?.backstory || info?.backstory) && (
              <section>
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-1.5">
                  backstory
                </p>
                <p className="text-sm text-n-muted leading-relaxed">
                  {persona?.backstory || info?.backstory}
                </p>
              </section>
            )}

            {(persona?.personalityTraits ?? info?.personalityTraits)?.length ? (
              <section>
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-2">
                  personality
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(persona?.personalityTraits ?? info!.personalityTraits!).map((t, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-mono px-2 py-1 rounded-full border border-n-border text-n-muted bg-n-surface"
                    >
                      {trunc(t, 40)}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {(persona?.quirks ?? info?.quirks)?.length ? (
              <section>
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-1.5">
                  quirks
                </p>
                <ul className="space-y-1.5">
                  {(persona?.quirks ?? info!.quirks!).map((q, i) => (
                    <li key={i} className="text-sm text-n-muted flex gap-2 leading-snug">
                      <span className="text-n-faint">·</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1 pb-2">
              <Link
                href={`/normie/${tokenId}`}
                className="min-h-[44px] inline-flex items-center px-4 text-xs font-mono rounded-lg border border-n-border text-n-text hover:border-n-text touch-manipulation"
              >
                normie page
              </Link>
              <a
                href={`${AGENTS_API}/agents/info/${tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center gap-1 px-4 text-xs font-mono rounded-lg border border-n-border text-n-muted hover:border-n-text touch-manipulation"
              >
                <Bot className="w-3 h-3" /> persona JSON
              </a>
              <a
                href={`${AGENTS_API}/agents/agent-card/${tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center gap-1 px-4 text-xs font-mono rounded-lg border border-n-border text-n-muted hover:border-n-text touch-manipulation"
              >
                <ExternalLink className="w-3 h-3" /> agent card
              </a>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
