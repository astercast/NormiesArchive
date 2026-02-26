"use client";

let audioCtx: AudioContext | null = null;
let enabled = false; // off by default; user must explicitly enable

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

/** Ensure the context is running, resuming if needed. Returns false if unavailable. */
async function ensureRunning(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

function scheduleBeeps(
  ctx: AudioContext,
  count: number,
  type: OscillatorType,
  baseFreqFn: () => number,
  freqEndMult: number,
  gainStart: number,
  duration: number
): void {
  const numBeeps = Math.min(count, 5);
  for (let i = 0; i < numBeeps; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    const baseFreq = baseFreqFn();
    const t = ctx.currentTime + i * 0.025;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * freqEndMult, t + duration * 0.8);

    gain.gain.setValueAtTime(gainStart, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.start(t);
    osc.stop(t + duration + 0.01);
  }
}

export function playPixelBirth(count = 1): void {
  if (!enabled) return;
  ensureRunning().then((ctx) => {
    if (!ctx) return;
    scheduleBeeps(
      ctx, count, "square",
      () => 800 + Math.random() * 400,
      2.0, 0.04, 0.1
    );
  });
}

export function playPixelDeath(count = 1): void {
  if (!enabled) return;
  ensureRunning().then((ctx) => {
    if (!ctx) return;
    scheduleBeeps(
      ctx, count, "sawtooth",
      () => 400 + Math.random() * 200,
      0.4, 0.03, 0.12
    );
  });
}

export function playLevelUp(): void {
  if (!enabled) return;
  ensureRunning().then((ctx) => {
    if (!ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      const t = ctx.currentTime + i * 0.1;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  });
}

export function playScrubTick(): void {
  if (!enabled) return;
  ensureRunning().then((ctx) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  });
}

export function setSoundEnabled(val: boolean): void {
  enabled = val;
  // Pre-warm the audio context on enable (requires user gesture to have happened)
  if (val) ensureRunning().catch(() => {});
}

export function isSoundEnabled(): boolean {
  return enabled;
}
