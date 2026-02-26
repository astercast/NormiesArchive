"use client";

import { useEffect, useRef, memo } from "react";
import { renderToCanvas, renderHeatmap, diffToHeatmapData, GRID_SIZE } from "@/lib/pixelUtils";

interface NormieGridProps {
  pixelsStr: string;
  scale?: number;
  showHeatmap?: boolean;
  addedIndices?: number[];
  removedIndices?: number[];
  className?: string;
}

const NormieGrid = memo(function NormieGrid({
  pixelsStr,
  scale = 10,
  showHeatmap = false,
  addedIndices,
  removedIndices,
  className = "",
}: NormieGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = GRID_SIZE * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelsStr) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const addedSet = addedIndices ? new Set(addedIndices) : undefined;
    const removedSet = removedIndices ? new Set(removedIndices) : undefined;

    renderToCanvas(ctx, pixelsStr, scale, addedSet, removedSet);

    if (showHeatmap && (addedIndices?.length || removedIndices?.length)) {
      // Convert flat indices back to {x,y} for heatmap
      const toCoords = (arr: number[]) => arr.map(i => ({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) }));
      const heatData = diffToHeatmapData(
        toCoords(addedIndices || []),
        toCoords(removedIndices || [])
      );
      renderHeatmap(ctx, heatData, scale);
    }
  }, [pixelsStr, scale, showHeatmap, addedIndices, removedIndices]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pixelated block ${className}`}
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
});

export default NormieGrid;
