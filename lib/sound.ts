"use client";

let audioCtx: AudioContext | null = null;
let enabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Play a chiptune blip for pixel birth (high-pitched, ascending)
 */
export function playPixelBirth(count: number = 1): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    return;
  }

  const numBeeps = Math.min(count, 5);
  for (let i = 0; i < numBeeps; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "square";
    const baseFreq = 800 + Math.random() * 400;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime + i * 0.02);
    osc.frequency.exponentialRampToValueAtTime(
      baseFreq * 2,
      ctx.currentTime + 0.08 + i * 0.02
    );

    gain.gain.setValueAtTime(0.04, ctx.currentTime + i * 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1 + i * 0.02);

    osc.start(ctx.currentTime + i * 0.02);
    osc.stop(ctx.currentTime + 0.12 + i * 0.02);
  }
}

/**
 * Play a chiptune blip for pixel death (low-pitched, descending)
 */
export function playPixelDeath(count: number = 1): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    return;
  }

  const numBeeps = Math.min(count, 5);
  for (let i = 0; i < numBeeps; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sawtooth";
    const baseFreq = 400 + Math.random() * 200;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime + i * 0.02);
    osc.frequency.exponentialRampToValueAtTime(
      baseFreq * 0.4,
      ctx.currentTime + 0.1 + i * 0.02
    );

    gain.gain.setValueAtTime(0.03, ctx.currentTime + i * 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12 + i * 0.02);

    osc.start(ctx.currentTime + i * 0.02);
    osc.stop(ctx.currentTime + 0.14 + i * 0.02);
  }
}

/**
 * Play a level-up fanfare (for max level Normies)
 */
export function playLevelUp(): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    return;
  }

  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);

    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.25);
  });
}

/**
 * Play on timeline scrub
 */
export function playScrubTick(): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(220, ctx.currentTime);

  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

export function setSoundEnabled(val: boolean): void {
  enabled = val;
}

export function isSoundEnabled(): boolean {
  return enabled;
}
