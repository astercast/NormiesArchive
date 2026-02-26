"use client";

import { renderToCanvas, GRID_SIZE } from "./pixelUtils";

// Load GIF.js safely without causing removeChild errors
let gifJsPromise: Promise<any> | null = null;

function loadGifJs(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("SSR");
  if ((window as any).GIF) return Promise.resolve((window as any).GIF);

  if (gifJsPromise) return gifJsPromise;

  gifJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js";
    script.onload = () => {
      if ((window as any).GIF) {
        resolve((window as any).GIF);
      } else {
        reject(new Error("GIF constructor not found after load"));
      }
    };
    script.onerror = () => {
      gifJsPromise = null; // Allow retry
      reject(new Error("Failed to load GIF.js"));
    };
    // Use appendChild to avoid removeChild issues — never remove it
    document.head.appendChild(script);
  });

  return gifJsPromise;
}

export async function exportTimelineGif(
  frames: string[],
  tokenId: number,
  scale: number = 8,
  onProgress?: (progress: number) => void
): Promise<void> {
  const size = GRID_SIZE * scale;

  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext("2d")!;

  try {
    const GIF = await loadGifJs();

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: size,
      height: size,
      workerScript: "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js",
    });

    for (let i = 0; i < frames.length; i++) {
      renderToCanvas(ctx, frames[i], scale);

      // Watermark
      ctx.font = `bold ${Math.max(5, scale - 1)}px monospace`;
      ctx.fillStyle = "rgba(72,73,75,0.5)";
      ctx.textAlign = "right";
      ctx.fillText(`normies.art/eternal`, size - 2, size - 2);
      ctx.textAlign = "left";
      ctx.fillText(`#${tokenId}`, 2, scale + 1);

      const delay = i === 0 ? 1000 : i === frames.length - 1 ? 2000 : 120;
      gif.addFrame(ctx, { delay, copy: true });
      onProgress?.((i + 0.5) / frames.length);
    }

    gif.on("finished", (blob: Blob) => {
      downloadBlob(blob, `normie-${tokenId}-eternal.gif`);
      onProgress?.(1);
    });

    gif.render();
  } catch (err) {
    console.warn("GIF.js failed, exporting current frame as PNG:", err);
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

  ctx.font = `bold ${scale}px monospace`;
  ctx.fillStyle = "rgba(72,73,75,0.4)";
  const size = GRID_SIZE * scale;
  ctx.textAlign = "right";
  ctx.fillText(`normies.art/eternal`, size - 4, size - 4);

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
  // Delay cleanup to avoid removeChild timing issues
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
