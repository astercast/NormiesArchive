export function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function computeStageCap(innerWidth: number): number {
  if (innerWidth < 420) return 6;
  if (innerWidth < 640) return 8;
  if (innerWidth < 900) return 10;
  if (innerWidth < 1200) return 12;
  return 14;
}

export function formatEth(price?: number, currency = "ETH") {
  if (price == null) return null;
  const sym = currency === "ETH" ? "Ξ" : currency;
  return `${price < 0.01 ? price.toFixed(4) : price.toFixed(3)} ${sym}`;
}
