"use client";

import { useEffect, useRef } from "react";
import { renderHeatmap, diffToHeatmapData, GRID_SIZE } from "@/lib/pixelUtils";

interface HeatmapOverlayProps {
  // accepts flat indices (converted from {x,y} by parent)
  addedIndices: number[];
  removedIndices: number[];
  scale?: number;
  className?: string;
}

export default function HeatmapOverlay({
  addedIndices,
  removedIndices,
  scale = 10,
  className = "",
}: HeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = GRID_SIZE * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    const toCoords = (arr: number[]) =>
      arr.map((i) => ({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) }));

    const heatData = diffToHeatmapData(toCoords(addedIndices), toCoords(removedIndices));
    renderHeatmap(ctx, heatData, scale, 0.8);
  }, [addedIndices, removedIndices, scale, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`absolute inset-0 pointer-events-none pixelated ${className}`}
      style={{ imageRendering: "pixelated", width: size, height: size, mixBlendMode: "multiply" }}
    />
  );
}
