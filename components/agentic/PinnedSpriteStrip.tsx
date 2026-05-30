"use client";

import { useEffect, useRef } from "react";
import { SPRITES_API, WALK_FRAME_MS, BASE_SPEED } from "@/lib/agentic/constants";

/** Smaller sprites in the fixed-height preview strip (container stays h-24 / h-28). */
const PREVIEW_SCALE = 1;
const SPR_W = 40 * PREVIEW_SCALE;
const SPR_H = 80 * PREVIEW_SCALE;
const ANC_X = 20 * PREVIEW_SCALE;
const ANC_Y = 60 * PREVIEW_SCALE;
const FOOT_BELOW = SPR_H - ANC_Y;
const FRAME_PX = SPR_W;
const SPRITE_HIT_PAD = 4;
const MIN_SEP = SPR_W * 0.72;

interface Body {
  fx: number;
  fy: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  wanderTx: number;
  wanderTy: number;
  wanderUntil: number;
}

interface Props {
  tokenIds: number[];
  dark?: boolean;
  onSelect?: (tokenId: number) => void;
}

function pickTarget(minFx: number, maxFx: number, minFy: number, maxFy: number) {
  return {
    tx: minFx + Math.random() * Math.max(1, maxFx - minFx),
    ty: minFy + Math.random() * Math.max(1, maxFy - minFy),
    until: performance.now() + 1800 + Math.random() * 2400,
  };
}

function mkBody(cw: number, sh: number, index: number, total: number): Body {
  const minFx = ANC_X + 4;
  const maxFx = cw - (SPR_W - ANC_X) - 4;
  const minFy = ANC_Y + 2;
  const maxFy = sh - FOOT_BELOW - 6;
  const slot = total > 1 ? index / (total - 1) : 0.5;
  const fx = minFx + slot * Math.max(1, maxFx - minFx) + (Math.random() - 0.5) * 16;
  const fy = minFy + Math.random() * Math.max(1, maxFy - minFy);
  const speed = (0.5 + Math.random() * 0.5) * BASE_SPEED * 0.85;
  const w = pickTarget(minFx, maxFx, minFy, maxFy);
  return {
    fx,
    fy,
    vx: Math.random() < 0.5 ? speed : -speed,
    vy: (Math.random() - 0.5) * 0.3,
    facing: Math.random() < 0.5 ? 1 : -1,
    wanderTx: w.tx,
    wanderTy: w.ty,
    wanderUntil: w.until,
  };
}

export default function PinnedSpriteStrip({ tokenIds, dark, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const spriteRefs = useRef<Map<number, HTMLElement>>(new Map());
  const bodies = useRef<Map<number, Body>>(new Map());
  const walkFrames = useRef<Map<number, number>>(new Map());
  const rafRef = useRef(0);
  const prevNow = useRef(0);
  const idsRef = useRef(tokenIds);
  const darkRef = useRef(dark);

  useEffect(() => {
    idsRef.current = tokenIds;
  }, [tokenIds]);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  useEffect(() => {
    const cw = stageRef.current?.clientWidth ?? 360;
    const sh = stageRef.current?.clientHeight ?? 96;
    bodies.current.clear();
    tokenIds.forEach((id, i) => {
      bodies.current.set(id, mkBody(cw, sh, i, tokenIds.length));
      walkFrames.current.set(id, Math.floor(Math.random() * 4));
    });
  }, [tokenIds]);

  useEffect(() => {
    const t = setInterval(() => {
      for (const id of idsRef.current) {
        const el = spriteRefs.current.get(id);
        if (!el) continue;
        const nf = ((walkFrames.current.get(id) ?? 0) + 1) % 4;
        walkFrames.current.set(id, nf);
        el.style.backgroundPosition = `${-nf * FRAME_PX + SPRITE_HIT_PAD}px ${SPRITE_HIT_PAD}px`;
      }
    }, WALK_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(now - prevNow.current, 50);
      prevNow.current = now;
      const stage = stageRef.current;
      const cw = stage?.clientWidth ?? 360;
      const sh = stage?.clientHeight ?? 96;
      const ids = idsRef.current;
      const minFx = ANC_X + 4;
      const maxFx = cw - (SPR_W - ANC_X) - 4;
      const minFy = ANC_Y + 2;
      const maxFy = sh - FOOT_BELOW - 6;

      for (const id of ids) {
        const b = bodies.current.get(id);
        if (!b) continue;

        if (now >= b.wanderUntil) {
          const w = pickTarget(minFx, maxFx, minFy, maxFy);
          b.wanderTx = w.tx;
          b.wanderTy = w.ty;
          b.wanderUntil = w.until;
        }

        const dx = b.wanderTx - b.fx;
        const dy = b.wanderTy - b.fy;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          b.vx += (dx / dist) * 0.04 * dt;
          b.vy += (dy / dist) * 0.04 * dt;
        }

        b.fx += b.vx * (dt / 16);
        b.fy += b.vy * (dt / 16);
        b.vx *= 0.92;
        b.vy *= 0.92;

        if (b.fx < minFx) { b.fx = minFx; b.vx = Math.abs(b.vx); b.facing = 1; }
        if (b.fx > maxFx) { b.fx = maxFx; b.vx = -Math.abs(b.vx); b.facing = -1; }
        if (b.fy < minFy) { b.fy = minFy; b.vy = Math.abs(b.vy); }
        if (b.fy > maxFy) { b.fy = maxFy; b.vy = -Math.abs(b.vy); }

        if (Math.abs(b.vx) > 0.15) b.facing = b.vx > 0 ? 1 : -1;

        const el = spriteRefs.current.get(id);
        if (el) {
          const lx = b.fx - ANC_X;
          const ly = b.fy - ANC_Y;
          el.style.left = `${lx - SPRITE_HIT_PAD}px`;
          el.style.top = `${ly - SPRITE_HIT_PAD}px`;
          el.style.transform = b.facing === -1 ? "scaleX(-1)" : "scaleX(1)";
        }
      }

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = bodies.current.get(ids[i]);
          const b = bodies.current.get(ids[j]);
          if (!a || !b) continue;
          const dx = b.fx - a.fx;
          const dy = b.fy - a.fy;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d < MIN_SEP) {
            const push = (MIN_SEP - d) * 0.55;
            const nx = dx / d;
            const ny = dy / d;
            a.fx -= nx * push;
            a.fy -= ny * push;
            b.fx += nx * push;
            b.fy += ny * push;
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (tokenIds.length === 0) return null;

  const sheetW = 7 * SPR_W + SPRITE_HIT_PAD * 2;

  return (
    <div
      ref={stageRef}
      className="relative w-full h-24 sm:h-28 rounded-xl border border-n-border bg-n-surface/60 overflow-hidden"
      aria-label="Pinned agents walking"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: dark
            ? "linear-gradient(180deg, rgba(6,182,212,0.08), transparent)"
            : "linear-gradient(180deg, rgba(6,182,212,0.06), transparent)",
        }}
      />
      {tokenIds.map(id => (
        <button
          key={id}
          type="button"
          ref={el => {
            if (el) spriteRefs.current.set(id, el);
            else spriteRefs.current.delete(id);
          }}
          onClick={() => onSelect?.(id)}
          className="normie-sprite-hit absolute border-0 bg-transparent cursor-pointer touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 rounded"
          style={{
            width: SPR_W + SPRITE_HIT_PAD * 2,
            height: SPR_H + SPRITE_HIT_PAD * 2,
            padding: SPRITE_HIT_PAD,
            backgroundImage: `url(${SPRITES_API}/normies/${id}/sheet.png)`,
            backgroundSize: `${sheetW}px auto`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `${SPRITE_HIT_PAD}px ${SPRITE_HIT_PAD}px`,
            imageRendering: "pixelated",
            filter: dark ? "invert(1)" : "none",
          }}
          aria-label={`Open agent ${id}`}
        />
      ))}
    </div>
  );
}
