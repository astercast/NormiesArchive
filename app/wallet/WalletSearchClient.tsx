"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ENS_RE = /^[^\s]+\.eth$/i;

export default function WalletSearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError("");

    // Multi-wallet: comma-separated 0x addresses
    if (q.includes(",")) {
      const parts = q.split(",").map(s => s.trim()).filter(Boolean);
      const invalid = parts.filter(p => !ETH_ADDRESS_RE.test(p));
      if (invalid.length > 0) {
        setError(`Invalid: ${invalid.join(", ")} — multi-wallet only supports 0x addresses`);
        return;
      }
      const unique = [...new Set(parts.map(p => p.toLowerCase()))];
      router.push(`/addresses?q=${unique.join(",")}`);
      return;
    }

    if (ETH_ADDRESS_RE.test(q)) {
      router.push(`/address/${q}`);
      return;
    }

    if (ENS_RE.test(q)) {
      setLoading(true);
      try {
        const res = await fetch(`/api/resolve-ens/${encodeURIComponent(q)}`);
        if (res.status === 404) {
          setError(`ENS name "${q}" not found`);
          return;
        }
        if (!res.ok) throw new Error("Resolution failed");
        const data = await res.json();
        router.push(`/address/${data.address}`);
      } catch {
        setError("Could not resolve ENS name. Try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    setError("Enter a 0x address, ENS name, or comma-separated 0x addresses");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 pb-24">
      <h1 className="text-3xl font-bold text-white mb-2">Wallet Search</h1>
      <p className="text-zinc-400 text-sm mb-4">
        Enter an Ethereum address or ENS name to see owned Normies.
      </p>
      <p className="text-zinc-500 text-xs mb-8 text-center">
        tip: paste multiple <span className="text-zinc-400 font-mono">0x…</span> addresses separated by commas to see a combined view
      </p>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md flex flex-col gap-3"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError("");
            }}
            placeholder="0x… or name.eth, or 0x…, 0x… for multiple"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 hover:bg-zinc-200 transition-colors"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}
      </form>
    </main>
  );
}
