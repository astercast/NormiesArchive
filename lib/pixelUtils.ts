// Normie pixel utilities — 40x40 = 1600 pixels, stored as "0"/"1" string
// Per llms.txt: 1 = pixel on (#48494b dark gray), 0 = pixel off (#e3e5e4 light gray)

export const GRID_SIZE = 40;
export const PIXEL_COUNT = GRID_SIZE * GRID_SIZE; // 1600

// Official Normies.art palette
export const COLOR_ON  = "#48494b";  // dark gray — pixel ON
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

export function coordsToIndices(coords: Array<{ x: number; y: number }>): number[] {
  return coords.map(({ x, y }) => coordToIndex(x, y));
}

export function string1600ToCoords(str: string): Pixel[] {
  const pixels: Pixel[] = [];
  for (let i = 0; i < Math.min(str.length, PIXEL_COUNT); i++) {
    if (str[i] === "1") {
      pixels.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE), index: i });
    }
  }
  return pixels;
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

/**
 * Render a normie pixel string to a canvas.
 * Optionally highlights added (green) / removed (red) pixels.
 */
export function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  pixelsStr: string,
  scale: number = 10,
  highlightAdded?: Set<number>,
  highlightRemoved?: Set<number>
) {
  const w = GRID_SIZE * scale;
  const h = GRID_SIZE * scale;

  // Fill entire background with off-color
  ctx.fillStyle = COLOR_OFF;
  ctx.fillRect(0, 0, w, h);
  ctx.shadowBlur = 0;

  for (let i = 0; i < Math.min(pixelsStr.length, PIXEL_COUNT); i++) {
    const on = pixelsStr[i] === "1";
    const isAdded   = highlightAdded?.has(i);
    const isRemoved = highlightRemoved?.has(i);

    if (!on && !isRemoved) continue; // off-color already painted

    const x = i % GRID_SIZE;
    const y = Math.floor(i / GRID_SIZE);

    if (isAdded && on) {
      ctx.fillStyle = "#1a7a4a"; // green — newly added pixel
    } else if (isRemoved && !on) {
      ctx.fillStyle = "rgba(180,50,50,0.35)"; // ghost red — removed pixel
    } else if (isRemoved && on) {
      ctx.fillStyle = "#c03030"; // red-shifted — still on but flagged as removed
    } else {
      ctx.fillStyle = COLOR_ON;
    }
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

/**
 * Build a heatmap Float32Array from coord arrays.
 * Can accumulate across multiple edit events for a multi-edit heatmap.
 */
export function diffToHeatmapData(
  added: Array<{ x: number; y: number }>,
  removed: Array<{ x: number; y: number }>
): Float32Array {
  const heat = new Float32Array(PIXEL_COUNT);
  for (const { x, y } of added)   heat[coordToIndex(x, y)] += 1.0;
  for (const { x, y } of removed) heat[coordToIndex(x, y)] += 0.7;
  return heat;
}

/**
 * Build a cumulative heatmap across all edits by diffing consecutive frames.
 */
export function buildCumulativeHeatmap(frames: string[]): Float32Array {
  const heat = new Float32Array(PIXEL_COUNT);
  for (let f = 1; f < frames.length; f++) {
    const prev = frames[f - 1];
    const curr = frames[f];
    for (let i = 0; i < PIXEL_COUNT; i++) {
      if (prev[i] !== curr[i]) heat[i] += 1;
    }
  }
  return heat;
}

/**
 * Render a heatmap overlay onto an existing canvas.
 * Uses a warm palette: low = blue/cyan, high = red/orange.
 */
export function renderHeatmap(
  ctx: CanvasRenderingContext2D,
  heatData: Float32Array,
  scale: number = 10,
  alpha: number = 0.75
) {
  let maxVal = 0;
  for (let i = 0; i < heatData.length; i++) {
    if (heatData[i] > maxVal) maxVal = heatData[i];
  }
  if (maxVal === 0) return;

  for (let i = 0; i < PIXEL_COUNT; i++) {
    if (heatData[i] <= 0) continue;
    const x = i % GRID_SIZE;
    const y = Math.floor(i / GRID_SIZE);
    const t = heatData[i] / maxVal; // 0..1

    // Warm palette: 0 = cool blue, 0.5 = yellow, 1 = hot red
    const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
    const g = Math.round(t < 0.5 ? 200 * t * 2 : 200 * (1 - (t - 0.5) * 2));
    const b = Math.round(t < 0.5 ? 255 * (1 - t * 2) : 0);
    const a = alpha * (0.3 + 0.7 * t); // subtle at low intensity, strong at high

    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
}

// ─── Diff utilities ───────────────────────────────────────────────────────────

export function diffStrings(
  before: string,
  after: string
): { added: number[]; removed: number[] } {
  const added: number[] = [];
  const removed: number[] = [];
  const len = Math.min(before.length, after.length, PIXEL_COUNT);
  for (let i = 0; i < len; i++) {
    if (before[i] === "0" && after[i] === "1") added.push(i);
    else if (before[i] === "1" && after[i] === "0") removed.push(i);
  }
  return { added, removed };
}

// ─── Frame simulation ─────────────────────────────────────────────────────────

/**
 * Deterministic shuffle using a simple LCG seeded by the array length.
 * Avoids Math.sin() NaN edge cases and produces a uniform distribution.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    // LCG: next = (a * s + c) % m
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Simulate pixel evolution across edit events.
 *
 * Strategy: we know the original, the final, and per-edit changeCount values.
 * Distribute the net changed pixels proportionally across edits, using a
 * deterministic shuffle so the same normie always produces the same animation.
 */
export function buildSimulatedFrames(
  originalStr: string,
  finalStr: string,
  editHistory: Array<{ changeCount: number }>
): string[] {
  // Always include origin + final
  if (editHistory.length === 0) return [originalStr, finalStr];

  const { added, removed } = diffStrings(originalStr, finalStr);

  // If nothing changed, just repeat the frame for each edit
  if (added.length === 0 && removed.length === 0) {
    return [originalStr, ...editHistory.map(() => originalStr), finalStr];
  }

  // Deterministic shuffle keyed on normie identity
  const seed = added.length * 31337 + removed.length * 7919;
  const shuffledAdded   = seededShuffle(added, seed);
  const shuffledRemoved = seededShuffle(removed, seed ^ 0xdeadbeef);

  const totalHistorical = editHistory.reduce((s, e) => s + e.changeCount, 0) || 1;

  const frames: string[] = [originalStr];
  const current = originalStr.split("");
  let addIdx = 0;
  let removeIdx = 0;

  for (let ei = 0; ei < editHistory.length; ei++) {
    const edit = editHistory[ei];
    const proportion = edit.changeCount / totalHistorical;

    // How many of our total changed pixels to reveal this frame
    // Use cumulative to avoid rounding drift
    const targetAddTotal = Math.round(added.length * ((ei + 1) * edit.changeCount / totalHistorical));
    const targetRemTotal = Math.round(removed.length * ((ei + 1) * edit.changeCount / totalHistorical));

    // Clamp cumulative targets
    const targetAdd = Math.min(Math.round(added.length * proportion) + addIdx, shuffledAdded.length);
    const targetRem = Math.min(Math.round(removed.length * proportion) + removeIdx, shuffledRemoved.length);

    while (addIdx < targetAdd) {
      current[shuffledAdded[addIdx]] = "1";
      addIdx++;
    }
    while (removeIdx < targetRem) {
      current[shuffledRemoved[removeIdx]] = "0";
      removeIdx++;
    }

    frames.push(current.join(""));
  }

  // Final frame is always exactly the real current state
  frames.push(finalStr);
  return frames;
}
