"use client";

import { WALLET_SORT_OPTIONS, type WalletSortKey } from "@/lib/walletSort";

interface Props {
  value: WalletSortKey;
  onChange: (key: WalletSortKey) => void;
}

export default function WalletSortBar({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-mono text-n-faint uppercase tracking-wider mr-1">
        sort by
      </span>
      {WALLET_SORT_OPTIONS.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono border transition-all touch-manipulation ${
              active
                ? "border-amber-400 bg-amber-400 text-black font-semibold shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_0_12px_rgba(251,191,36,0.35)] ring-2 ring-amber-400/40 ring-offset-1 ring-offset-n-bg"
                : "border-n-border text-n-muted hover:border-n-muted hover:text-n-text hover:bg-n-surface/50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
