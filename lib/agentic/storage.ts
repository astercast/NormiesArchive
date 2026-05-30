import { LS_DISCOVERED, LS_PINNED } from "./constants";

export function loadNumSet(key: string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr.filter(n => Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

export function saveNumSet(key: string, set: Set<number>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export { LS_DISCOVERED, LS_PINNED };
