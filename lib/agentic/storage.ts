import { LS_DISCOVERED, LS_PINNED, LS_WITNESS, WITNESS_MAX } from "./constants";
import type { WitnessEntry } from "./types";

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

export function loadWitnessLog(): WitnessEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_WITNESS);
    if (!raw) return [];
    return JSON.parse(raw) as WitnessEntry[];
  } catch {
    return [];
  }
}

export function saveWitnessLog(entries: WitnessEntry[]) {
  localStorage.setItem(LS_WITNESS, JSON.stringify(entries.slice(0, WITNESS_MAX)));
}

export { LS_DISCOVERED, LS_PINNED };
