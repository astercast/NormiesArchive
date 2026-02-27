"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(query);
    if (!isNaN(id) && id >= 0 && id <= 9999) {
      router.push(`/normie/${id}`);
      setQuery("");
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-n-bg/95 backdrop-blur-sm border-b border-n-border">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
          <div className="grid grid-cols-4 gap-px w-5 h-5 flex-shrink-0">
            {[1,0,0,1, 0,1,1,0, 0,1,1,0, 1,0,0,1].map((on, i) => (
              <div key={i} className={`w-full h-full ${on ? "bg-n-text" : "bg-n-border"}`} />
            ))}
          </div>
          <span className="text-sm font-mono font-medium tracking-wide text-n-text group-hover:text-n-muted transition-colors">
            pixel archive
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-5 text-xs font-mono">
          {[
            { href: "/",            label: "home" },
            { href: "/leaderboard", label: "leaderboard" },
            { href: "/the-100",     label: "the 100" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors pb-px ${
                pathname === link.href
                  ? "text-n-text border-b border-n-text"
                  : "text-n-muted hover:text-n-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-n-faint" />
            <input
              type="number"
              min="0"
              max="9999"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="0–9999"
              className="w-28 pl-7 pr-2 py-1.5 bg-n-surface border border-n-border rounded text-xs font-mono text-n-text placeholder:text-n-faint focus:outline-none focus:border-n-muted transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity"
          >
            go
          </button>
        </form>
      </div>
    </nav>
  );
}
