"use client";

import { LayoutGrid, Compass, Orbit, Archive } from "lucide-react";
import type { MobileTab } from "@/lib/agentic/types";

const TABS: { id: MobileTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "hive", label: "Hive", icon: LayoutGrid },
  { id: "deck", label: "Deck", icon: Compass },
  { id: "map", label: "Map", icon: Orbit },
  { id: "archive", label: "Archive", icon: Archive },
];

interface Props {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  liveBadge?: boolean;
  undiscovered?: number;
}

export default function HiveNav({ active, onChange, liveBadge, undiscovered = 0 }: Props) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-n-border bg-[var(--white)]/95 dark:bg-[var(--bg)]/95 backdrop-blur-md safe-area-pb"
      aria-label="Hive navigation"
    >
      <div className="grid grid-cols-4 max-w-lg mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 min-h-[56px] touch-manipulation transition-colors ${
                on ? "text-cyan-600 dark:text-cyan-400" : "text-n-faint hover:text-n-muted"
              }`}
            >
              <Icon className={`w-5 h-5 ${on ? "stroke-[2.5px]" : ""}`} />
              <span className="text-[10px] font-mono uppercase tracking-wide">{label}</span>
              {id === "hive" && liveBadge && (
                <span className="absolute top-1.5 right-[calc(50%-20px)] w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              )}
              {id === "deck" && undiscovered > 0 && (
                <span className="absolute top-1 right-[calc(50%-24px)] min-w-[16px] h-4 px-1 rounded-full bg-violet-500 text-white text-[9px] font-mono flex items-center justify-center">
                  {undiscovered > 99 ? "99+" : undiscovered}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
