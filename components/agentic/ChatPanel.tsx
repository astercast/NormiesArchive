"use client";

import { BookOpen, Sparkles } from "lucide-react";
import type { ChatEntry, WitnessEntry } from "@/lib/agentic/types";
import { timeAgo, trunc } from "@/lib/agentic/utils";

interface Props {
  chatLog: ChatEntry[];
  witnessLog: WitnessEntry[];
  tab: "live" | "witness";
  onTabChange: (tab: "live" | "witness") => void;
  onSummonPair?: (aId: number, bId: number) => void;
  empty?: boolean;
}

function ConvoBlock({
  entry,
  onSummon,
}: {
  entry: ChatEntry;
  onSummon?: () => void;
}) {
  return (
    <article className="px-4 py-3.5 space-y-2.5 border-b border-n-border last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-mono font-medium text-n-text">
          <span className="text-cyan-600 dark:text-cyan-400">{trunc(entry.aName, 18)}</span>
          <span className="text-n-faint mx-1.5">↔</span>
          <span className="text-n-muted">{trunc(entry.bName, 18)}</span>
        </p>
        <time className="text-[10px] font-mono text-n-faint shrink-0">{timeAgo(entry.ts)}</time>
      </div>
      <ul className="space-y-2">
        {entry.lines.map((ln, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <span className="font-mono text-[10px] text-n-faint block mb-0.5">
              {trunc(ln.who, 16)}
            </span>
            <span className="text-n-text">{ln.text}</span>
          </li>
        ))}
      </ul>
      {onSummon && (
        <button
          type="button"
          onClick={onSummon}
          className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline touch-manipulation min-h-[36px]"
        >
          summon both to floor
        </button>
      )}
    </article>
  );
}

export default function ChatPanel({
  chatLog,
  witnessLog,
  tab,
  onTabChange,
  onSummonPair,
  empty,
}: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl border border-n-border bg-[var(--white)] overflow-hidden">
      <div className="flex border-b border-n-border shrink-0">
        {(
          [
            { id: "live" as const, label: "Live", icon: Sparkles },
            { id: "witness" as const, label: "Your log", icon: BookOpen },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[48px] text-xs font-mono uppercase tracking-wide touch-manipulation transition-colors ${
              tab === id
                ? "text-n-text bg-n-surface border-b-2 border-cyan-500 -mb-px"
                : "text-n-faint hover:text-n-muted"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {id === "live" && chatLog.length > 0 && (
              <span className="text-[9px] tabular-nums text-n-faint">({chatLog.length})</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        {tab === "live" && (
          <>
            {chatLog.length === 0 && !empty && (
              <p className="text-sm font-mono text-n-faint p-4 leading-relaxed">
                Watch the floor — when two agents meet, their full exchange appears here turn by turn.
              </p>
            )}
            {chatLog.map(entry => (
              <ConvoBlock key={entry.id} entry={entry} />
            ))}
          </>
        )}
        {tab === "witness" && (
          <>
            {witnessLog.length === 0 && (
              <p className="text-sm font-mono text-n-faint p-4 leading-relaxed">
                Conversations you witness end-to-end are saved here — your personal archive of agent dialogue.
              </p>
            )}
            {witnessLog.map(entry => (
              <ConvoBlock
                key={entry.id}
                entry={entry}
                onSummon={
                  onSummonPair
                    ? () => onSummonPair(entry.aId, entry.bId)
                    : undefined
                }
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
