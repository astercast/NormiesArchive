"use client";

import { useQuery } from "@tanstack/react-query";
import { diffStrings, coordsToIndices, PIXEL_COUNT, GRID_SIZE, buildTransformFrames } from "@/lib/pixelUtils";

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
  version?:      number; // Ponder version index (0-indexed chronological); absent in blob fallback
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
    queryKey:   ["normie", tokenId, "history"],
    queryFn:    () => fetchJson<{ edits: EditEvent[]; burns: BurnEvent[] }>(`/api/normie/${tokenId}/history`),
    enabled,
    staleTime:  300_000,
    gcTime:     Infinity,  // keep in cache across page visits
    retry:      3,
    retryDelay: attempt => Math.min(1500 * 2 ** attempt, 10_000),
  });

  // Fetch actual composited pixel state at each version from api.normies.art.
  // Uses the version number from the Ponder API (v.version) when available,
  // falling back to array position for blob-sourced history.
  const editCount = history.data?.edits.length ?? 0;
  const versionPixels = useQuery({
    queryKey: ["normie", tokenId, "version-pixels", editCount],
    queryFn:  async () => {
      const edits = history.data!.edits;
      if (edits.length === 0) return [];
      const results: string[] = new Array(edits.length).fill("");
      const BATCH = 5; // stay comfortably under 60 req/min rate limit
      for (let i = 0; i < edits.length; i += BATCH) {
        const end = Math.min(i + BATCH, edits.length);
        const fetches = await Promise.allSettled(
          Array.from({ length: end - i }, (_, j) => {
            // Use actual Ponder version number if present, else positional index
            const vNum = edits[i + j].version ?? (i + j);
            return fetchText(`${BASE}/history/normie/${tokenId}/version/${vNum}/pixels`).then(validatePixels);
          })
        );
        for (let j = 0; j < fetches.length; j++) {
          const r = fetches[j];
          if (r.status === "fulfilled") results[i + j] = r.value;
        }
        if (end < edits.length) await new Promise(r => setTimeout(r, 220));
      }
      return results;
    },
    enabled:   !!history.data,
    staleTime: Infinity,
    gcTime:    Infinity,
    retry:     1,
  });

  // True historical frames: [origin, actual pixels after version 0, after version 1, ...]
  // Falls back to the seeded-shuffle simulation per frame only if a version fetch fails.
  // Key includes editCount so old simulated-frame cache is never served here.
  const frames = useQuery({
    queryKey: ["normie", tokenId, "frames", editCount],
    queryFn:  () => {
      const orig  = originalPixels.data!;
      const edits = history.data!.edits;
      const vp    = versionPixels.data!;

      if (edits.length === 0 || vp.length === 0) return [orig];

      // Simulated frames as per-step fallback when a version pixel fetch failed.
      // Requires transformLayer (single fast fetch) — always available by this point
      // since versionPixels takes much longer (multiple batched fetches).
      const simulated = transformLayer.data
        ? buildTransformFrames(orig, transformLayer.data, edits)
        : null;

      const frameList: string[] = [orig];
      for (let i = 0; i < edits.length; i++) {
        const actual = vp[i];
        // Use actual pixel state; fall back to simulation; last resort: keep previous frame
        frameList.push(
          (actual && actual.length === 1600)
            ? actual
            : (simulated?.[i + 1] ?? frameList[frameList.length - 1])
        );
      }
      return frameList;
    },
    enabled:   !!(originalPixels.data && versionPixels.isSuccess && history.data),
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
    historyLoading: history.isLoading || versionPixels.isFetching,
    historyError:   history.isError,
    historyRefetch: history.refetch,
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
