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

  async function resolveEntry(entry: string): Promise<string | null> {
    if (ETH_ADDRESS_RE.test(entry)) return entry.toLowerCase();
    if (ENS_RE.test(entry)) {
      const res = await fetch(`/api/resolve-ens/${encodeURIComponent(entry)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.address as string).toLowerCase();
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError("");

    // Multi-wallet: comma-separated addresses or ENS names
    if (q.includes(",")) {
      const parts = q.split(",").map(s => s.trim()).filter(Boolean);
      const invalid = parts.filter(p => !ETH_ADDRESS_RE.test(p) && !ENS_RE.test(p));
      if (invalid.length > 0) {
        setError(`Invalid: ${invalid.join(", ")}`);
        return;
      }
      setLoading(true);
      try {
        const resolved = await Promise.all(parts.map(resolveEntry));
        const failed = parts.filter((_, i) => resolved[i] === null);
        if (failed.length > 0) {
          setError(`Could not resolve: ${failed.join(", ")}`);
          return;
        }
        const unique = [...new Set(resolved as string[])];
        router.push(`/addresses?q=${unique.join(",")}`);
      } catch {
        setError("Could not resolve one or more names. Try again.");
      } finally {
        setLoading(false);
      }
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
      <h1 className="text-3xl font-mono font-semibold text-n-text mb-2">wallet search</h1>
      <p className="text-n-muted font-mono text-sm mb-4">
        enter an ethereum address or ens name to see owned normies.
      </p>
      <p className="text-n-faint font-mono text-xs mb-8 text-center">
        tip: paste multiple addresses or ens names separated by commas for a combined view
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
            placeholder="0x… or name.eth"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 rounded border border-n-border bg-n-surface text-n-text placeholder-n-faint px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-n-text/30"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 rounded border border-n-border bg-n-text text-n-bg text-sm font-mono font-semibold disabled:opacity-40 hover:opacity-80 transition-opacity"
          >
            {loading ? "…" : "search"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 font-mono text-xs text-center">{error}</p>
        )}
      </form>
    </main>
  );
}
