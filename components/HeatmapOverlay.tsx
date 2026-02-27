"use client";

import { useEffect, useRef } from "react";
import { renderHeatmap, GRID_SIZE, PIXEL_COUNT } from "@/lib/pixelUtils";

interface HeatmapOverlayProps {
  /** Float32Array[1600] — cumulative heat values per pixel */
  heatData: Float32Array;
  scale?: number;
  className?: string;
}

export default function HeatmapOverlay({
  heatData,
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
    if (heatData && heatData.length === PIXEL_COUNT) {
      renderHeatmap(ctx, heatData, scale, 0.72);
    }
  }, [heatData, scale, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`absolute inset-0 pointer-events-none pixelated ${className}`}
      style={{
        imageRendering: "pixelated",
        width: size,
        height: size,
        // "screen" lightens — works on light normies bg, shows hot pixels brightly
        mixBlendMode: "multiply",
        opacity: 0.85,
      }}
    />
  );
}
