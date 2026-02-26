"use client";

import { renderToCanvas, GRID_SIZE } from "./pixelUtils";

// Load GIF.js from CDN
let gifJsPromise: Promise<any> | null = null;

function loadGifJs(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("SSR");
  if ((window as any).GIF) return Promise.resolve((window as any).GIF);
  if (gifJsPromise) return gifJsPromise;

  gifJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js";
    script.onload = () => {
      if ((window as any).GIF) resolve((window as any).GIF);
      else reject(new Error("GIF constructor not found after load"));
    };
    script.onerror = () => {
      gifJsPromise = null;
      reject(new Error("Failed to load GIF.js"));
    };
    document.head.appendChild(script);
  });

  return gifJsPromise;
}

/**
 * Fetch the gif.worker.js source and turn it into a blob URL so it works
 * as a Web Worker even when served from a CDN (avoids cross-origin restrictions).
 */
async function getWorkerBlobUrl(): Promise<string> {
  const cacheKey = "__gif_worker_blob__";
  if ((window as any)[cacheKey]) return (window as any)[cacheKey];

  const res = await fetch(
    "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js"
  );
  const text = await res.text();
  const blob = new Blob([text], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  (window as any)[cacheKey] = url;
  return url;
}

export async function exportTimelineGif(
  frames: string[],
  tokenId: number,
  scale: number = 8,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (!frames.length) return;

  const size = GRID_SIZE * scale;
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext("2d")!;

  try {
    const [GIF, workerScript] = await Promise.all([loadGifJs(), getWorkerBlobUrl()]);

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: size,
      height: size,
      workerScript, // blob URL — avoids cross-origin worker errors
    });

    for (let i = 0; i < frames.length; i++) {
      renderToCanvas(ctx, frames[i], scale);

      // Watermark
      ctx.font = `bold ${Math.max(5, scale - 1)}px monospace`;
      ctx.fillStyle = "rgba(72,73,75,0.5)";
      ctx.textAlign = "right";
      ctx.fillText("normies-pixel-archive.vercel.app", size - 2, size - 2);
      ctx.textAlign = "left";
      ctx.fillText(`#${tokenId}`, 2, scale + 1);

      const delay = i === 0 ? 1000 : i === frames.length - 1 ? 2000 : 120;
      gif.addFrame(ctx, { delay, copy: true });
      onProgress?.((i + 0.5) / frames.length);
    }

    await new Promise<void>((resolve, reject) => {
      gif.on("finished", (blob: Blob) => {
        downloadBlob(blob, `normie-${tokenId}-history.gif`);
        onProgress?.(1);
        resolve();
      });
      gif.on("error", reject);
      gif.render();
    });
  } catch (err) {
    console.warn("GIF export failed, falling back to PNG:", err);
    await exportCurrentFrameAsPng(
      frames[frames.length - 1] || frames[0],
      tokenId,
      scale,
      ctx,
      offscreen
    );
    onProgress?.(1);
  }
}

async function exportCurrentFrameAsPng(
  pixelStr: string,
  tokenId: number,
  scale: number,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): Promise<void> {
  renderToCanvas(ctx, pixelStr, scale);
  const size = GRID_SIZE * scale;
  ctx.font = `bold ${scale}px monospace`;
  ctx.fillStyle = "rgba(72,73,75,0.4)";
  ctx.textAlign = "right";
  ctx.fillText("normies-pixel-archive.vercel.app", size - 4, size - 4);

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `normie-${tokenId}-current.png`);
      resolve();
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
