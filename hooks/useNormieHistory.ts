"use client";

import { useQuery } from "@tanstack/react-query";
import { diffStrings, coordsToIndices, PIXEL_COUNT, GRID_SIZE } from "@/lib/pixelUtils";

const BASE = "https://api.normies.art";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

function validatePixels(str: string): string {
  const t = str.trim();
  if (t.length !== 1600 || !/^[01]+$/.test(t)) throw new Error("invalid pixel string");
  return t;
}

export interface EditEvent {
  blockNumber:   number;
  timestamp:     number;
  txHash:        string;
  changeCount:   number;
  newPixelCount: number;
  transformer:   string;
}

export interface BurnEvent {
  blockNumber:  number;
  timestamp:    number;
  txHash:       string;
  tokenId:      number;
  totalActions: number;
  owner:        string;
}

export interface NormieInfo {
  actionPoints: number;
  level:        number;
  customized:   boolean;
  delegate:     string | null;
}

export interface NormieTraits {
  raw:        string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
}

export interface NormieDiff {
  added:        Array<{ x: number; y: number }>;
  removed:      Array<{ x: number; y: number }>;
  addedCount:   number;
  removedCount: number;
  netChange:    number;
}

// Build animation frames from original pixels + XOR transform layer + edit history.
// Distributes flipped pixels proportionally across edits using their changeCount.
function buildFrames(original: string, transformLayer: string, edits: EditEvent[]): string[] {
  const frames: string[] = [original];

  // Collect all pixel indices the transform layer flipped
  const flipped: number[] = [];
  for (let i = 0; i < 1600; i++) {
    if (transformLayer[i] === "1") flipped.push(i);
  }

  if (flipped.length === 0) return [original, original];
  if (edits.length === 0) {
    // Apply all flips at once (shouldn't happen but guard)
    const arr = original.split("");
    for (const i of flipped) arr[i] = arr[i] === "1" ? "0" : "1";
    frames.push(arr.join(""));
    return frames;
  }

  // Deterministic shuffle keyed on this normie's transform
  const seed = flipped.length * 31337 + edits.length * 7919;
  const shuffled = seededShuffle(flipped, seed);

  const totalChanges = edits.reduce((s, e) => s + e.changeCount, 0) || 1;
  const current = original.split("");
  let applied = 0;

  for (let i = 0; i < edits.length; i++) {
    const cumulative = edits.slice(0, i + 1).reduce((s, e) => s + e.changeCount, 0);
    const target = Math.min(Math.round((cumulative / totalChanges) * shuffled.length), shuffled.length);
    while (applied < target) {
      const idx = shuffled[applied++];
      current[idx] = current[idx] === "1" ? "0" : "1";
    }
    frames.push(current.join(""));
  }

  // Ensure last frame applies any remaining pixels
  while (applied < shuffled.length) {
    const idx = shuffled[applied++];
    current[idx] = current[idx] === "1" ? "0" : "1";
  }
  frames.push(current.join(""));
  return frames;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function useNormieHistory(tokenId: number) {
  const enabled = tokenId >= 0 && tokenId <= 9999;

  const currentPixels = useQuery({
    queryKey: ["normie", tokenId, "pixels"],
    queryFn:  () => fetchText(`${BASE}/normie/${tokenId}/pixels`).then(validatePixels),
    enabled, staleTime: 60_000, retry: 3,
  });

  const originalPixels = useQuery({
    queryKey: ["normie", tokenId, "original"],
    queryFn:  () => fetchText(`${BASE}/normie/${tokenId}/original/pixels`).then(validatePixels),
    enabled, staleTime: Infinity, retry: 3,
  });

  const transformLayer = useQuery({
    queryKey: ["normie", tokenId, "canvas-pixels"],
    queryFn:  () => fetchText(`${BASE}/normie/${tokenId}/canvas/pixels`).then(validatePixels),
    enabled, staleTime: 60_000, retry: 2,
  });

  const info = useQuery({
    queryKey: ["normie", tokenId, "info"],
    queryFn:  () => fetchJson<NormieInfo>(`${BASE}/normie/${tokenId}/canvas/info`),
    enabled, staleTime: 60_000, retry: 2,
  });

  const traits = useQuery({
    queryKey: ["normie", tokenId, "traits"],
    queryFn:  () => fetchJson<NormieTraits>(`${BASE}/normie/${tokenId}/traits`),
    enabled, staleTime: Infinity, retry: 2,
  });

  const diff = useQuery({
    queryKey: ["normie", tokenId, "diff"],
    queryFn:  () => fetchJson<NormieDiff>(`${BASE}/normie/${tokenId}/canvas/diff`),
    enabled: enabled && (info.data?.customized ?? true),
    staleTime: 60_000, retry: 2,
  });

  // History served from server-side indexer cache — fast after first global scan
  const history = useQuery({
    queryKey: ["normie", tokenId, "history"],
    queryFn:  () => fetchJson<{ edits: EditEvent[]; burns: BurnEvent[] }>(`/api/normie/${tokenId}/history`),
    enabled, staleTime: 300_000, retry: 2,
  });

  // Build frames once we have the pixel data — don't wait for history
  // Shows current state immediately; timeline activates once history arrives
  const frames = useQuery({
    queryKey: ["normie", tokenId, "frames", history.data?.edits.length ?? 0],
    queryFn:  () => buildFrames(originalPixels.data!, transformLayer.data!, history.data?.edits ?? []),
    enabled:  !!(originalPixels.data && transformLayer.data),
    staleTime: Infinity,
    gcTime:    Infinity,
  });

  // Diff overlay: 2=added (green), 1=removed (red), 0=untouched
  // Built from canvas/diff — shows exactly which pixels were added vs removed vs original
  const heatmapData = useQuery({
    queryKey: ["normie", tokenId, "heatmap"],
    queryFn:  () => {
      const d = diff.data!;
      const heat = new Float32Array(PIXEL_COUNT);
      for (const { x, y } of d.added)   heat[y * GRID_SIZE + x] = 2; // green
      for (const { x, y } of d.removed) heat[y * GRID_SIZE + x] = 1; // red
      return heat;
    },
    enabled:   !!diff.data,
    staleTime: Infinity,
  });

  const editHistory = history.data?.edits ?? [];
  const burnHistory = history.data?.burns ?? [];

  const diffAsIndices = diff.data ? {
    added:   coordsToIndices(diff.data.added),
    removed: coordsToIndices(diff.data.removed),
  } : null;

  const isLoading = currentPixels.isLoading || originalPixels.isLoading || info.isLoading;
  const hasError  = (currentPixels.isError || originalPixels.isError) && !currentPixels.data;
  const normieType = traits.data?.attributes.find(a => a.trait_type === "Type")?.value as string | undefined;

  return {
    currentPixels:  currentPixels.data,
    originalPixels: originalPixels.data,
    transformLayer: transformLayer.data,
    diff:           diff.data,
    diffAsIndices,
    heatmapData:    heatmapData.data,
    info:           info.data,
    traits:         traits.data,
    editHistory,
    burnHistory,
    frames:         frames.data ?? [],
    isLoading,
    hasError,
    historyLoading: history.isLoading,
    normieType,
    lifeStory:      buildLifeStory(tokenId, normieType, editHistory, burnHistory, info.data?.level ?? 1),
  };
}

function buildLifeStory(
  tokenId: number,
  type: string | undefined,
  edits: EditEvent[],
  burns: BurnEvent[],
  level: number
): string[] {
  if (edits.length === 0 && burns.length === 0) return [];
  const label = type ? `${type} Normie` : "Normie";
  const events: Array<{ ts: number; text: string }> = [];

  if (edits.length > 0) {
    events.push({ ts: edits[0].timestamp, text: `On ${fmtDate(edits[0].timestamp)}, this ${label} received its first transformation from ${short(edits[0].transformer)}, changing ${edits[0].changeCount} pixels.` });
    for (const e of edits.slice(1)) {
      events.push({ ts: e.timestamp, text: `${short(e.transformer)} reshaped ${e.changeCount} pixel${e.changeCount !== 1 ? "s" : ""} on ${fmtDate(e.timestamp)}. Running total: ${e.newPixelCount}px.` });
    }
  }
  for (const b of burns) {
    events.push({ ts: b.timestamp, text: `${short(b.owner)} burned Normies on ${fmtDate(b.timestamp)}, granting +${b.totalActions} AP.` });
  }
  if (level >= 10) {
    events.push({ ts: Date.now() / 1000, text: `Standing at Level ${level}, this Normie is a veteran of the pixel canvas.` });
  }
  return events.sort((a, b) => a.ts - b.ts).map(e => e.text);
}

const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const short = (addr: string) => addr?.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
