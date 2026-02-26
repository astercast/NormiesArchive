"use client";

import { useQuery } from "@tanstack/react-query";
import { buildCumulativeHeatmap, diffStrings, coordsToIndices, PIXEL_COUNT, GRID_SIZE } from "@/lib/pixelUtils";

const BASE = "https://api.normies.art";

// ─── API fetch helpers (all via HTTP, no viem in browser) ─────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function validatePixels(str: string, label: string): string {
  const t = str.trim();
  if (t.length !== 1600 || !/^[01]+$/.test(t))
    throw new Error(`Invalid pixel string for ${label}`);
  return t;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditEvent {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  changeCount: number;
  newPixelCount: number;
  transformer: string;
}

export interface BurnEvent {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  tokenId: number;
  totalActions: number;
  owner: string;
}

export interface NormieInfo {
  actionPoints: number;
  level: number;
  customized: boolean;
  delegate: string | null;
}

export interface NormieTraits {
  raw: string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
}

export interface NormieDiff {
  added: Array<{ x: number; y: number }>;
  removed: Array<{ x: number; y: number }>;
  addedCount: number;
  removedCount: number;
  netChange: number;
}

// ─── Frame builder ────────────────────────────────────────────────────────────

/**
 * Build animation frames using the actual transform layer.
 *
 * We have:
 *  - original: the base bitmap before any edits
 *  - transformLayer: the XOR overlay (1 = this pixel was flipped)
 *  - editHistory: list of edits with changeCount per edit
 *
 * The composited final state = original XOR transformLayer.
 *
 * For intermediate frames: each edit contributed some pixels to the transform
 * layer. We distribute the transform-layer pixels proportionally across edits
 * by their changeCount, using a deterministic shuffle so the same normie
 * always produces the same animation sequence.
 */
function buildFrames(
  originalStr: string,
  transformLayerStr: string,
  editHistory: EditEvent[]
): string[] {
  // Frame 0 is always the original
  const frames: string[] = [originalStr];

  // Find all pixel indices that were flipped (transform layer = 1)
  const flippedIndices: number[] = [];
  for (let i = 0; i < PIXEL_COUNT; i++) {
    if (transformLayerStr[i] === "1") flippedIndices.push(i);
  }

  // No transforms at all — just original (and possibly same final)
  if (flippedIndices.length === 0 || editHistory.length === 0) {
    // Compute final from XOR anyway
    const finalArr = originalStr.split("");
    for (const idx of flippedIndices) {
      finalArr[idx] = finalArr[idx] === "1" ? "0" : "1";
    }
    frames.push(finalArr.join(""));
    return frames;
  }

  // Deterministic shuffle — same normie = same animation every time
  const seed = flippedIndices.length * 31337 + editHistory.length * 7919;
  const shuffled = seededShuffle(flippedIndices, seed);

  // Distribute flipped pixels proportionally across edits by changeCount
  const totalChangeCount = editHistory.reduce((s, e) => s + e.changeCount, 0) || 1;
  const current = originalStr.split("");
  let pixelsApplied = 0;

  for (let ei = 0; ei < editHistory.length; ei++) {
    // How many of the flipped pixels belong to this edit
    const cumulative = editHistory.slice(0, ei + 1).reduce((s, e) => s + e.changeCount, 0);
    const targetApplied = Math.round((cumulative / totalChangeCount) * shuffled.length);
    const clampedTarget = Math.min(targetApplied, shuffled.length);

    while (pixelsApplied < clampedTarget) {
      const idx = shuffled[pixelsApplied];
      current[idx] = current[idx] === "1" ? "0" : "1";
      pixelsApplied++;
    }
    frames.push(current.join(""));
  }

  // Final frame: apply any remaining pixels (rounding safety)
  while (pixelsApplied < shuffled.length) {
    const idx = shuffled[pixelsApplied];
    current[idx] = current[idx] === "1" ? "0" : "1";
    pixelsApplied++;
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

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useNormieHistory(tokenId: number) {
  const enabled = tokenId >= 0 && tokenId <= 9999;
  const id = tokenId;

  // Current (composited) pixels — always reflects canvas edits
  const currentPixels = useQuery({
    queryKey: ["normie", id, "pixels"],
    queryFn: () => fetchText(`${BASE}/normie/${id}/pixels`).then(t => validatePixels(t, `#${id} current`)),
    enabled,
    staleTime: 60_000,
    retry: 3,
  });

  // Original pixels (pre-transform)
  const originalPixels = useQuery({
    queryKey: ["normie", id, "original"],
    queryFn: () => fetchText(`${BASE}/normie/${id}/original/pixels`).then(t => validatePixels(t, `#${id} original`)),
    enabled,
    staleTime: Infinity,
    retry: 3,
  });

  // Canvas transform layer (XOR overlay — 1 = pixel was flipped)
  const transformLayer = useQuery({
    queryKey: ["normie", id, "canvas-pixels"],
    queryFn: () => fetchText(`${BASE}/normie/${id}/canvas/pixels`).then(t => validatePixels(t, `#${id} canvas`)),
    enabled,
    staleTime: 60_000,
    retry: 2,
  });

  // Canvas info (level, actionPoints, customized)
  const info = useQuery({
    queryKey: ["normie", id, "info"],
    queryFn: () => fetchJson<NormieInfo>(`${BASE}/normie/${id}/canvas/info`),
    enabled,
    staleTime: 60_000,
    retry: 2,
  });

  // Traits
  const traits = useQuery({
    queryKey: ["normie", id, "traits"],
    queryFn: () => fetchJson<NormieTraits>(`${BASE}/normie/${id}/traits`),
    enabled,
    staleTime: Infinity,
    retry: 2,
  });

  // Canvas diff (added/removed pixel coords)
  const diff = useQuery({
    queryKey: ["normie", id, "diff"],
    queryFn: () => fetchJson<NormieDiff>(`${BASE}/normie/${id}/canvas/diff`),
    enabled,
    staleTime: 60_000,
    retry: 2,
  });

  // Edit + burn history — fetched via our server-side API route (uses viem/RPC)
  const history = useQuery({
    queryKey: ["normie", id, "history"],
    queryFn: () => fetchJson<{ edits: EditEvent[]; burns: BurnEvent[] }>(`/api/normie/${id}/history`),
    enabled,
    staleTime: 300_000,
    retry: 2,
  });

  // Build animation frames once we have original + transform layer + edit history
  const frames = useQuery({
    queryKey: ["normie", id, "frames"],
    queryFn: () => {
      const orig  = originalPixels.data!;
      const xor   = transformLayer.data!;
      const edits = history.data?.edits ?? [];
      return buildFrames(orig, xor, edits);
    },
    enabled: !!(originalPixels.data && transformLayer.data && history.data),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Cumulative heatmap
  const heatmapData = useQuery({
    queryKey: ["normie", id, "heatmap"],
    queryFn: () => {
      const f = frames.data!;
      if (f.length < 2) return new Float32Array(PIXEL_COUNT);
      return buildCumulativeHeatmap(f);
    },
    enabled: !!(frames.data && frames.data.length >= 2),
    staleTime: Infinity,
  });

  const editHistory = history.data?.edits ?? [];
  const burnHistory = history.data?.burns ?? [];

  // Pixel diff as flat indices for particle system
  const diffAsIndices = diff.data ? {
    added:   coordsToIndices(diff.data.added),
    removed: coordsToIndices(diff.data.removed),
  } : null;

  const isLoading = currentPixels.isLoading || originalPixels.isLoading || info.isLoading;
  const hasError  = (currentPixels.isError || originalPixels.isError) && !currentPixels.data;

  const normieType = traits.data?.attributes.find(a => a.trait_type === "Type")?.value as string | undefined;

  const lifeStory = buildLifeStory(tokenId, normieType, editHistory, burnHistory, info.data?.level ?? 1);

  return {
    originalPixels:   originalPixels.data,
    currentPixels:    currentPixels.data,
    transformLayer:   transformLayer.data,
    diff:             diff.data,
    diffAsIndices,
    heatmapData:      heatmapData.data,
    info:             info.data,
    traits:           traits.data,
    editHistory,
    burnHistory,
    frames:           frames.data ?? [],
    isLoading,
    hasError,
    lifeStory,
    normieType,
  };
}

// ─── Life story generator ─────────────────────────────────────────────────────

function buildLifeStory(
  tokenId: number,
  normieType: string | undefined,
  edits: EditEvent[],
  burns: BurnEvent[],
  level: number
): string[] {
  const typeLabel = normieType ? `${normieType} Normie` : "Normie";

  if (edits.length === 0 && burns.length === 0) {
    return [`Normie #${tokenId} has never been touched. An untouched original, pristine from the mint.`];
  }

  const events: Array<{ timestamp: number; text: string }> = [];

  if (edits.length > 0) {
    events.push({
      timestamp: edits[0].timestamp,
      text: `On ${fmtDate(edits[0].timestamp)}, this ${typeLabel} received its first transformation from ${short(edits[0].transformer)}, changing ${edits[0].changeCount} pixels forever.`,
    });
    for (const edit of edits.slice(1)) {
      events.push({
        timestamp: edit.timestamp,
        text: `${short(edit.transformer)} reshaped ${edit.changeCount} pixel${edit.changeCount !== 1 ? "s" : ""} on ${fmtDate(edit.timestamp)}. Running total: ${edit.newPixelCount}px.`,
      });
    }
  }

  for (const burn of burns) {
    events.push({
      timestamp: burn.timestamp,
      text: `${short(burn.owner)} burned Normies on ${fmtDate(burn.timestamp)}, granting ${burn.totalActions} action point${burn.totalActions !== 1 ? "s" : ""}.`,
    });
  }

  if (level >= 10) {
    events.push({
      timestamp: Date.now() / 1000,
      text: `Today, standing at Level ${level}, this Normie is a battle-scarred veteran of the pixel canvas.`,
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp).map(e => e.text);
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function short(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
