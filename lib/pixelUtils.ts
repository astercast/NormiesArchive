// Normie pixel utilities — 40x40 = 1600 pixels, stored as "0"/"1" string
// Per llms.txt: 1 = pixel on (#48494b dark gray), 0 = pixel off (#e3e5e4 light gray)

export const GRID_SIZE = 40;
export const PIXEL_COUNT = GRID_SIZE * GRID_SIZE; // 1600

// Normies.art official palette
export const COLOR_ON = "#48494b";   // dark gray — pixel ON
export const COLOR_OFF = "#e3e5e4";  // light gray — background

export interface Pixel {
  x: number;
  y: number;
  index: number;
}

export function coordToIndex(x: number, y: number): number {
  return y * GRID_SIZE + x;
}

export function indexToCoord(index: number): { x: number; y: number } {
  return { x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) };
}

/** Convert {x,y} objects (from API diff) to flat indices */
export function coordsToIndices(coords: Array<{ x: number; y: number }>): number[] {
  return coords.map(({ x, y }) => coordToIndex(x, y));
}

/** Convert 1600-char "0"/"1" string to array of active pixel coords */
export function string1600ToCoords(str: string): Pixel[] {
  const pixels: Pixel[] = [];
  for (let i = 0; i < Math.min(str.length, PIXEL_COUNT); i++) {
    if (str[i] === "1") {
      pixels.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE), index: i });
    }
  }
  return pixels;
}

/** Render a Normie pixel string to canvas context using official palette */
export function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  pixelsStr: string,
  scale: number = 10,
  highlightAdded?: Set<number>,
  highlightRemoved?: Set<number>
) {
  const w = GRID_SIZE * scale;
  const h = GRID_SIZE * scale;

  // Background (off pixels)
  ctx.fillStyle = COLOR_OFF;
  ctx.fillRect(0, 0, w, h);

  ctx.shadowBlur = 0;

  for (let i = 0; i < Math.min(pixelsStr.length, PIXEL_COUNT); i++) {
    const x = i % GRID_SIZE;
    const y = Math.floor(i / GRID_SIZE);
    const px = x * scale;
    const py = y * scale;

    if (pixelsStr[i] === "1") {
      if (highlightAdded?.has(i)) {
        ctx.fillStyle = "#2a7a4a"; // added: darker green tint
      } else if (highlightRemoved?.has(i)) {
        ctx.fillStyle = "#8a3030"; // removed: darker red tint
      } else {
        ctx.fillStyle = COLOR_ON;
      }
      ctx.fillRect(px, py, scale, scale);
    } else if (highlightRemoved?.has(i)) {
      // Show where pixels were removed (ghost)
      ctx.fillStyle = "rgba(180,60,60,0.3)";
      ctx.fillRect(px, py, scale, scale);
    }
  }
}

/** Generate heatmap data from {x,y} coord arrays */
export function diffToHeatmapData(
  added: Array<{ x: number; y: number }>,
  removed: Array<{ x: number; y: number }>
): Float32Array {
  const heat = new Float32Array(PIXEL_COUNT);
  for (const { x, y } of added) heat[coordToIndex(x, y)] += 1;
  for (const { x, y } of removed) heat[coordToIndex(x, y)] += 0.6;
  return heat;
}

/** Render heatmap overlay on top of an existing canvas */
export function renderHeatmap(
  ctx: CanvasRenderingContext2D,
  heatData: Float32Array,
  scale: number = 10,
  alpha: number = 0.7
) {
  const maxVal = Math.max(...Array.from(heatData), 1);

  for (let i = 0; i < PIXEL_COUNT; i++) {
    if (heatData[i] > 0) {
      const x = i % GRID_SIZE;
      const y = Math.floor(i / GRID_SIZE);
      const intensity = heatData[i] / maxVal;
      // Warm palette: low = blue, high = red
      const r = Math.round(255 * Math.min(1, intensity * 2));
      const g = Math.round(255 * (1 - Math.abs(intensity - 0.5) * 2));
      const b = Math.round(255 * Math.max(0, 1 - intensity * 2));

      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * intensity})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

/** Compare two pixel strings, return added/removed as index arrays */
export function diffStrings(
  before: string,
  after: string
): { added: number[]; removed: number[] } {
  const added: number[] = [];
  const removed: number[] = [];
  for (let i = 0; i < PIXEL_COUNT; i++) {
    const b = before[i] ?? "0";
    const a = after[i] ?? "0";
    if (b === "0" && a === "1") added.push(i);
    else if (b === "1" && a === "0") removed.push(i);
  }
  return { added, removed };
}

/**
 * Simulate evolution frames by distributing changed pixels across historical edits.
 * Since only the current transform is stored on-chain, we proportionally assign
 * the net diff across all edit events to create a cinematic playback.
 */
export function buildSimulatedFrames(
  originalStr: string,
  finalStr: string,
  editHistory: Array<{ changeCount: number }>
): string[] {
  if (editHistory.length === 0) return [originalStr, finalStr];

  const { added, removed } = diffStrings(originalStr, finalStr);

  // Deterministic shuffle via seeded sort
  const seed = added.length * 31 + removed.length * 17;
  const shuffledAdded = [...added].sort((a, b) => Math.sin(seed + a) - Math.sin(seed + b));
  const shuffledRemoved = [...removed].sort((a, b) => Math.sin(seed + b) - Math.sin(seed + a));

  const totalChanges = added.length + removed.length;
  if (totalChanges === 0) return editHistory.map(() => originalStr).concat([finalStr]);

  const totalHistorical = editHistory.reduce((s, e) => s + e.changeCount, 0) || editHistory.length;

  const frames: string[] = [originalStr];
  let currentArr = originalStr.split("");
  let addIdx = 0;
  let removeIdx = 0;

  for (const edit of editHistory) {
    const proportion = edit.changeCount / totalHistorical;
    const numAdded = Math.round(added.length * proportion);
    const numRemoved = Math.round(removed.length * proportion);

    for (let i = 0; i < numAdded && addIdx < shuffledAdded.length; i++, addIdx++) {
      currentArr[shuffledAdded[addIdx]] = "1";
    }
    for (let i = 0; i < numRemoved && removeIdx < shuffledRemoved.length; i++, removeIdx++) {
      currentArr[shuffledRemoved[removeIdx]] = "0";
    }

    frames.push(currentArr.join(""));
  }

  frames.push(finalStr);
  return frames;
}

// Eye / feature zones for special queries (0-indexed pixel indices)
export const ZONES = {
  leftEye:  [245, 246, 247, 285, 286, 287, 325, 326, 327],
  rightEye: [252, 253, 254, 292, 293, 294, 332, 333, 334],
  mouth:    [481, 482, 483, 484, 485, 521, 522, 523, 524, 525],
  topHead:  Array.from({ length: 40 }, (_, i) => i),
  leftEar:  [80, 81, 120, 121, 160, 161],
  rightEar: [98, 99, 138, 139, 178, 179],
} as const;

export function pixelSetOverlapsZone(
  pixels: number[],
  zone: keyof typeof ZONES
): boolean {
  const zoneSet = new Set(ZONES[zone]);
  return pixels.some((p) => zoneSet.has(p));
}
