"use client";

import { useEffect, useRef, memo } from "react";
import { renderToCanvas, GRID_SIZE } from "@/lib/pixelUtils";

interface NormieGridProps {
  pixelsStr: string;
  scale?: number;
  className?: string;
  // Optional highlight sets for current-step diff overlay
  addedIndices?: number[];
  removedIndices?: number[];
}

const NormieGrid = memo(function NormieGrid({
  pixelsStr,
  scale = 10,
  className = "",
  addedIndices,
  removedIndices,
}: NormieGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = GRID_SIZE * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelsStr) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const addedSet   = addedIndices   ? new Set(addedIndices)   : undefined;
    const removedSet = removedIndices ? new Set(removedIndices) : undefined;

    renderToCanvas(ctx, pixelsStr, scale, addedSet, removedSet);
  }, [pixelsStr, scale, addedIndices, removedIndices]);

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
