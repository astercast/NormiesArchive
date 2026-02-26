"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getNormieOriginalPixels, getNormieCurrentPixels, getNormieDiff,
  getNormieInfo, getNormieTraits, normalizeId,
} from "@/lib/normiesApi";
import { getEditHistory, getBurnHistory } from "@/lib/eventIndexer";
import { buildSimulatedFrames, buildCumulativeHeatmap, coordsToIndices, PIXEL_COUNT } from "@/lib/pixelUtils";

export function useNormieHistory(tokenId: number) {
  const nid = normalizeId(tokenId);
  const enabled = tokenId >= 0 && tokenId <= 9999;

  const originalPixels = useQuery({
    queryKey: ["normie", nid, "original"],
    queryFn: () => getNormieOriginalPixels(nid),
    enabled,
    staleTime: Infinity,
    retry: 3,
  });

  const currentPixels = useQuery({
    queryKey: ["normie", nid, "current"],
    queryFn: () => getNormieCurrentPixels(nid),
    enabled,
    staleTime: 60_000,
    retry: 3,
  });

  const diff = useQuery({
    queryKey: ["normie", nid, "diff"],
    queryFn: () => getNormieDiff(nid),
    enabled,
    staleTime: 60_000,
    retry: 2,
  });

  const info = useQuery({
    queryKey: ["normie", nid, "info"],
    queryFn: () => getNormieInfo(nid),
    enabled,
    staleTime: 60_000,
    retry: 2,
  });

  const traits = useQuery({
    queryKey: ["normie", nid, "traits"],
    queryFn: () => getNormieTraits(nid),
    enabled,
    staleTime: Infinity,
    retry: 2,
  });

  const editHistory = useQuery({
    queryKey: ["normie", nid, "editHistory"],
    queryFn: () => getEditHistory(nid),
    enabled,
    staleTime: 300_000,
    retry: 2,
  });

  const burnHistory = useQuery({
    queryKey: ["normie", nid, "burnHistory"],
    queryFn: () => getBurnHistory(nid),
    enabled,
    staleTime: 300_000,
    retry: 2,
  });

  // Build animation frames once all pixel data + history is ready
  const frames = useQuery({
    queryKey: ["normie", nid, "frames"],
    queryFn: () => buildSimulatedFrames(
      originalPixels.data!,
      currentPixels.data!,
      editHistory.data!
    ),
    enabled: !!(originalPixels.data && currentPixels.data && editHistory.data),
    staleTime: Infinity,
  });

  // Build cumulative heatmap across all edit frames (shows every pixel ever touched)
  const heatmapData = useQuery({
    queryKey: ["normie", nid, "heatmap"],
    queryFn: () => {
      const f = frames.data!;
      if (f.length < 2) return new Float32Array(PIXEL_COUNT);
      return buildCumulativeHeatmap(f);
    },
    enabled: !!(frames.data && frames.data.length >= 2),
    staleTime: Infinity,
  });

  // Diff coords → flat indices for particle system
  const diffAsIndices = diff.data ? {
    added:   coordsToIndices(diff.data.added),
    removed: coordsToIndices(diff.data.removed),
  } : null;

  const isLoading = originalPixels.isLoading || currentPixels.isLoading || info.isLoading;
  const hasError  = originalPixels.isError || currentPixels.isError;

  // Derive type from traits
  const normieType = traits.data?.attributes.find(a => a.trait_type === "Type")?.value as string | undefined;

  const lifeStory = buildLifeStory(
    tokenId,
    normieType,
    editHistory.data ?? [],
    burnHistory.data ?? [],
    info.data?.level ?? 1
  );

  return {
    originalPixels: originalPixels.data,
    currentPixels:  currentPixels.data,
    diff:           diff.data,
    diffAsIndices,
    heatmapData:    heatmapData.data,
    info:           info.data,
    traits:         traits.data,
    editHistory:    editHistory.data ?? [],
    burnHistory:    burnHistory.data ?? [],
    frames:         frames.data ?? [],
    isLoading,
    hasError,
    lifeStory,
    normieType,
  };
}

function buildLifeStory(
  tokenId: number,
  normieType: string | undefined,
  edits: Array<{ timestamp: number; transformer: string; changeCount: number; newPixelCount: number }>,
  burns: Array<{ timestamp: number; owner: string; totalActions: number }>,
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
      text: `On ${formatDate(edits[0].timestamp)}, this ${typeLabel} received its first transformation from ${shortenAddr(edits[0].transformer)}, changing ${edits[0].changeCount} pixels forever.`,
    });
    for (const edit of edits.slice(1)) {
      events.push({
        timestamp: edit.timestamp,
        text: `${shortenAddr(edit.transformer)} reshaped ${edit.changeCount} pixel${edit.changeCount !== 1 ? "s" : ""} on ${formatDate(edit.timestamp)}. Running total: ${edit.newPixelCount}px.`,
      });
    }
  }

  for (const burn of burns) {
    events.push({
      timestamp: burn.timestamp,
      text: `${shortenAddr(burn.owner)} burned Normies on ${formatDate(burn.timestamp)}, granting ${burn.totalActions} action point${burn.totalActions !== 1 ? "s" : ""}.`,
    });
  }

  if (level >= 10) {
    events.push({
      timestamp: Date.now() / 1000,
      text: `Today, standing at Level ${level}, this Normie is a battle-scarred veteran of the eternal canvas.`,
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp).map(e => e.text);
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function shortenAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
