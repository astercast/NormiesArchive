"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, ChevronDown, ChevronUp, Bot } from "lucide-react";

export interface AgentInfo {
  tokenId: string;
  agentId: string;
  chainId: number;
  name: string;
  type: string;
  tagline: string;
  backstory: string;
  greeting: string;
  personalityTraits: string[];
  communicationStyle: string;
  quirks: string[];
  systemPrompt: string;
  traits: {
    name: string;
    attributes: Record<string, string>;
  };
  canvas: {
    level: number;
    actionPoints: number;
    customized: boolean;
    diff: { addedCount: number; removedCount: number; netChange: number };
  };
  registeredBy: string;
  registeredAt: string;
  txHash: string;
  interactions: { status: string };
  mcp: { status: string };
}

interface Props {
  info: AgentInfo;
  tokenId: number;
}

const BASE = "https://api.normies.art";

export default function AgentSection({ info, tokenId }: Props) {
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);

  const registeredDate = info.registeredAt
    ? new Date(info.registeredAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border-t border-n-border pt-8 space-y-6"
    >
      {/* Section header */}
      <div className="flex items-center gap-3">
        <Bot className="w-4 h-4 text-cyan-500" />
        <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">agent identity</h2>
        <span className="text-[10px] font-mono px-1.5 py-px border border-cyan-400/60 text-cyan-600 rounded bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400">
          ERC-8004
        </span>
        <span className="text-xs font-mono text-n-faint ml-auto">agent #{info.agentId}</span>
      </div>

      {/* Name + tagline */}
      <div className="space-y-1">
        <h3 className="font-mono text-xl font-medium text-n-text">{info.name}</h3>
        {info.tagline && (
          <p className="text-xs font-mono text-n-muted italic">&ldquo;{info.tagline}&rdquo;</p>
        )}
      </div>

      {/* Two-column info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Persona text */}
        <div className="space-y-4">

          {/* Greeting */}
          {info.greeting && (
            <div className="border border-n-border rounded p-4 bg-n-surface space-y-1">
              <div className="text-[10px] font-mono text-n-faint uppercase tracking-wider mb-2">greeting</div>
              <p className="text-xs font-mono text-n-text leading-relaxed">{info.greeting}</p>
            </div>
          )}

          {/* Backstory */}
          {info.backstory && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-n-faint uppercase tracking-wider">backstory</div>
              <p className="text-xs font-mono text-n-muted leading-relaxed">{info.backstory}</p>
            </div>
          )}

          {/* Communication style */}
          {info.communicationStyle && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-n-faint uppercase tracking-wider">communication style</div>
              <p className="text-xs font-mono text-n-muted leading-relaxed">{info.communicationStyle}</p>
            </div>
          )}
        </div>

        {/* Right: Traits + quirks + registration */}
        <div className="space-y-4">

          {/* Personality traits */}
          {info.personalityTraits?.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-n-faint uppercase tracking-wider">personality</div>
              <div className="flex flex-wrap gap-1.5">
                {info.personalityTraits.map((trait, i) => (
                  <span key={i} className="text-[10px] font-mono px-2 py-0.5 border border-n-border rounded bg-n-surface text-n-muted">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quirks */}
          {info.quirks?.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-n-faint uppercase tracking-wider">quirks</div>
              <ul className="space-y-1">
                {info.quirks.map((quirk, i) => (
                  <li key={i} className="text-xs font-mono text-n-muted flex items-start gap-1.5">
                    <span className="text-n-faint mt-px">·</span>
                    <span className="leading-relaxed">{quirk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Registration facts */}
          <div className="border border-n-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-n-border bg-n-surface">
              <span className="text-[10px] font-mono text-n-faint uppercase tracking-wider">registration</span>
            </div>
            <div className="divide-y divide-n-border">
              {registeredDate && (
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-n-faint">registered</span>
                  <span className="text-xs font-mono text-n-text">{registeredDate}</span>
                </div>
              )}
              {info.registeredBy && (
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-n-faint flex-shrink-0">registered by</span>
                  <a
                    href={`https://etherscan.io/address/${info.registeredBy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-n-text hover:underline flex items-center gap-1 truncate"
                  >
                    {info.registeredBy.slice(0, 6)}…{info.registeredBy.slice(-4)}
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                  </a>
                </div>
              )}
              {info.txHash && (
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-n-faint flex-shrink-0">tx</span>
                  <a
                    href={`https://etherscan.io/tx/${info.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-n-text hover:underline flex items-center gap-1 truncate"
                  >
                    {info.txHash.slice(0, 10)}…{info.txHash.slice(-6)}
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                  </a>
                </div>
              )}
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-mono text-n-faint">chain</span>
                <span className="text-xs font-mono text-n-text">Ethereum mainnet</span>
              </div>
            </div>
          </div>

          {/* Agent links */}
          <div className="flex flex-wrap gap-1.5">
            <a
              href={`${BASE}/agents/info/${tokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-n-border rounded text-[10px] font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" /> persona JSON
            </a>
            <a
              href={`${BASE}/agents/agent-card/${tokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-n-border rounded text-[10px] font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" /> A2A agent card
            </a>
            <a
              href={`${BASE}/agents/metadata/${tokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-n-border rounded text-[10px] font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" /> ERC-8004 metadata
            </a>
          </div>
        </div>
      </div>

      {/* System prompt — collapsible */}
      {info.systemPrompt && (
        <div className="border border-n-border rounded overflow-hidden">
          <button
            onClick={() => setSystemPromptOpen(v => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-n-surface transition-colors"
          >
            <span className="text-[10px] font-mono text-n-faint uppercase tracking-wider">system prompt</span>
            {systemPromptOpen
              ? <ChevronUp className="w-3 h-3 text-n-faint" />
              : <ChevronDown className="w-3 h-3 text-n-faint" />}
          </button>
          {systemPromptOpen && (
            <div className="px-4 pb-4 border-t border-n-border bg-n-surface">
              <pre className="text-[10px] font-mono text-n-muted leading-relaxed whitespace-pre-wrap mt-3">
                {info.systemPrompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
