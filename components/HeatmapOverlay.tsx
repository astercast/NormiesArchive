"use client";

import { useEffect, useRef } from "react";
import { GRID_SIZE, PIXEL_COUNT } from "@/lib/pixelUtils";

interface Props {
  /** Float32Array[1600] — values: 2=added, 1=removed, 0=untouched */
  heatData: Float32Array;
  scale?: number;
}

export default function HeatmapOverlay({ heatData, scale = 10 }: Props) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const size = GRID_SIZE * scale;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    if (!heatData || heatData.length !== PIXEL_COUNT) return;

    for (let i = 0; i < PIXEL_COUNT; i++) {
      const v = heatData[i];
      if (v === 0) continue;
      const x = (i % GRID_SIZE) * scale;
      const y = Math.floor(i / GRID_SIZE) * scale;
      // 2 = added (pixel turned ON) → green
      // 1 = removed (pixel turned OFF) → red
      ctx.fillStyle = v === 2
        ? "rgba(34,197,94,0.55)"   // green-500
        : "rgba(239,68,68,0.55)";  // red-500
      ctx.fillRect(x, y, scale, scale);
    }
  }, [heatData, scale, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="absolute inset-0 pointer-events-none"
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}
