"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, Menu, X } from "lucide-react";

const LINKS = [
  { href: "/",             label: "home" },
  { href: "/leaderboard",  label: "leaderboard" },
  { href: "/the-100",      label: "the 100" },
  { href: "/how-it-works", label: "how it works" },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [query,    setQuery]    = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(query);
    if (!isNaN(id) && id >= 0 && id <= 9999) {
      router.push(`/normie/${id}`);
      setQuery("");
      setMenuOpen(false);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 bg-n-bg/95 backdrop-blur-sm border-b border-n-border">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-4">

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

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-5 text-xs font-mono flex-1 justify-center">
            {LINKS.map((link) => (
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

          {/* Right side: search + hamburger */}
          <div className="flex items-center gap-2">
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
                  className="w-24 sm:w-28 pl-7 pr-2 py-1.5 bg-n-surface border border-n-border rounded text-xs font-mono text-n-text placeholder:text-n-faint focus:outline-none focus:border-n-muted transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity"
              >
                go
              </button>
            </form>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-1.5 border border-n-border rounded text-n-muted hover:text-n-text hover:border-n-text transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-n-text/10 backdrop-blur-sm" />
          <div
            className="absolute top-12 left-0 right-0 bg-n-bg border-b border-n-border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col py-2">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-5 py-3.5 text-sm font-mono transition-colors border-l-2 ${
                    pathname === link.href
                      ? "text-n-text border-n-text bg-n-surface"
                      : "text-n-muted border-transparent hover:text-n-text hover:bg-n-surface"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
