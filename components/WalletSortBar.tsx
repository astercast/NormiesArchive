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
            onClick={() => onChange(opt.key)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono border transition-colors touch-manipulation ${
              active
                ? "border-n-text bg-n-text text-n-bg"
                : "border-n-border text-n-muted hover:border-n-muted hover:text-n-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
