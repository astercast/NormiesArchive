"use client";

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
  onFloor: boolean;
  pinDisabled: boolean;
  onClose: () => void;
  onSummon: () => void;
  onTogglePin: () => void;
}

export default function AgentDetailSheet({
  tokenId,
  agent,
  bundle,
  loading,
  dark,
  pinned,
  onFloor,
  pinDisabled,
  onClose,
  onSummon,
  onTogglePin,
}: Props) {
  const info = bundle?.info;
  const persona = bundle?.persona;
  const card = bundle?.card;
  const metadata = bundle?.metadata;
  const listing = bundle?.listing;
  const name = info?.name ?? persona?.name ?? agent?.name ?? `#${tokenId}`;
  const type = info?.type ?? persona?.type ?? agent?.type ?? "Human";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-n-border bg-[var(--white)] shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 sm:p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${AGENTS_API}/agents/image/${tokenId}`}
                alt=""
                width={72}
                height={72}
                className="w-[72px] h-[72px] shrink-0 rounded-xl border border-n-border bg-n-surface object-contain pixelated"
                style={{ filter: dark ? "invert(1)" : "none" }}
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-mono text-lg font-medium text-n-text">{name}</h2>
                <p className="text-xs font-mono text-n-faint mt-0.5">
                  #{tokenId} · {type.toLowerCase()}
                  {info?.agentId ? ` · agent #${info.agentId}` : ""}
                  {info?.canvas ? ` · lv${info.canvas.level}` : ""}
                </p>
                {(persona?.tagline || info?.tagline) && (
                  <p className="text-sm text-n-muted italic mt-2 leading-snug">
                    &ldquo;{persona?.tagline || info?.tagline}&rdquo;
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-1 text-n-faint hover:text-n-text touch-manipulation"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-xs font-mono text-n-muted py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading full persona from API…
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSummon}
                className="flex-1 min-h-[48px] px-4 text-sm font-mono rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors touch-manipulation"
              >
                {onFloor ? "On floor" : "Summon to floor"}
              </button>
              <button
                type="button"
                onClick={onTogglePin}
                disabled={pinDisabled}
                className={`min-h-[48px] px-4 text-sm font-mono rounded-lg border transition-colors touch-manipulation disabled:opacity-40 ${
                  pinned
                    ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300"
                    : "border-n-border text-n-muted hover:border-n-text"
                }`}
              >
                <Star className={`w-4 h-4 inline mr-1 ${pinned ? "fill-cyan-500 text-cyan-500" : ""}`} />
                {pinned ? "Pinned" : "Pin"}
              </button>
            </div>

            {/* OpenSea listing */}
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

            {/* Greeting */}
            {(persona?.greeting || info?.greeting) && (
              <section className="rounded-lg border border-n-border bg-n-surface px-3 py-3">
                <p className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-1.5">
                  greeting
                </p>
                <p className="text-sm text-n-text leading-relaxed">
                  &ldquo;{persona?.greeting || info?.greeting}&rdquo;
                </p>
              </section>
            )}

            {/* A2A Skills from agent-card */}
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
                      {skill.examples?.[0] && (
                        <p className="text-[11px] text-n-faint italic mt-1.5">
                          e.g. &ldquo;{trunc(skill.examples[0], 80)}&rdquo;
                        </p>
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

            {/* ERC-8004 services */}
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

            {/* Backstory */}
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

            {/* Traits & quirks */}
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

            {/* Links */}
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
