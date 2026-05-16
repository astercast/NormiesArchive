"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Bot, Wifi } from "lucide-react";

/* ─── External APIs ─────────────────────────────────────────────────────── */
const AGENTS_API  = "https://api.normies.art";
const SPRITES_API = "https://fullnormies.vercel.app/api/v1";

/* ─── Sprite constants (from fullnormies docs) ──────────────────────────── */
// Native: 40×80 px sprite, anchor at (20, 76) = foot bottom-center
// Sheet:  280×80 px, 7 frames × 40 px wide
//         [0,1,2,3] = walk, [4] = stand, [5] = sit, [6] = sleep
const NATIVE_W  = 40;
const NATIVE_H  = 80;
const SCALE     = 3;            // 40×80 → 120×240 px on canvas
const SPR_W     = NATIVE_W * SCALE;   // 120
const SPR_H     = NATIVE_H * SCALE;   // 240
const ANC_X     = 20 * SCALE;         // 60  — foot anchor from sprite left
const ANC_Y     = 76 * SCALE;         // 228 — foot anchor from sprite top
const SHEET_FW  = NATIVE_W;           // each sheet frame: 40 wide, 80 tall

/* ─── Lounge constants ──────────────────────────────────────────────────── */
const CANVAS_H      = 580;
const WALK_FRAME_MS = 160;      // ms per walk frame (4 frames = ~640 ms/cycle)
const BASE_SPEED    = 0.9;      // px/frame at 60 fps  ≈  54 px/s
const TALK_DIST     = SPR_W * 1.4;   // pixels anchor-to-anchor to trigger chat
const TALK_MS       = 6000;     // conversation duration
const CONV_COOL_MS  = 3500;     // min gap between new conversation starts
const MAX_TALKS     = 4;        // max concurrent conversations
const MAX_NORMIES   = 60;       // cap for perf
const IDLE_CHANCE   = 0.0004;   // per-frame probability of going idle
const IDLE_MS_MIN   = 800;
const IDLE_MS_MAX   = 2200;
const BATCH_SIZE    = 5;        // agent-info fetch batch

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface AgentItem {
  agentId: string; tokenId: string; name: string; type: string;
}
interface AgentInfo {
  tokenId: string; name: string; type: string;
  tagline?: string; greeting?: string;
  personalityTraits?: string[]; quirks?: string[];
  communicationStyle?: string;
}
interface Normie {
  tokenId: number; name: string; type: string; info?: AgentInfo;
}
interface Body {
  fx: number; fy: number;
  vx: number; vy: number;
  facing: 1 | -1;
  walkFrame: number;  walkTimer: number;
  state: "walk" | "talk" | "idle";
  stateUntil: number;   // performance.now() timestamp for when state ends
  partnerId: number | null;
}
interface Bubble {
  id: string; tokenId: number; name: string;
  text: string; x: number; y: number;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function randV(): number {
  const s = (0.4 + Math.random() * 0.9) * BASE_SPEED;
  return Math.random() < 0.5 ? s : -s;
}

function pickText(info?: AgentInfo): string {
  if (!info) return "...";
  const pool: string[] = [];
  if (info.greeting)              pool.push(info.greeting);
  if (info.tagline)               pool.push(info.tagline);
  if (info.communicationStyle)    pool.push(info.communicationStyle);
  info.personalityTraits?.slice(0, 3).forEach(t => pool.push(t));
  info.quirks?.slice(0, 2).forEach(t => pool.push(t));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "...";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function ArchiveLoungeClient() {
  const [normies,  setNormies]  = useState<Normie[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [dark,     setDark]     = useState(false);
  const [bubbles,  setBubbles]  = useState<Bubble[]>([]);
  const [infoLoaded, setInfoLoaded] = useState(0); // count of normies with full info

  /* refs — avoid stale closures in rAF loop */
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const prevNowRef   = useRef<number>(0);
  const darkRef      = useRef(false);
  const normiesRef   = useRef<Normie[]>([]);
  const bodies       = useRef<Map<number, Body>>(new Map());
  const sheets       = useRef<Map<number, HTMLImageElement>>(new Map());
  const lastConvRef  = useRef<number>(0);   // perf.now() of last conv start
  const lastCheckRef = useRef<number>(0);   // perf.now() of last proximity scan

  /* keep refs in sync */
  useEffect(() => { normiesRef.current = normies; },    [normies]);
  useEffect(() => { darkRef.current    = dark;    },    [dark]);

  /* ─── Dark-mode observer ──────────────────────────────────────────────── */
  useEffect(() => {
    const check = () => {
      const d = document.documentElement.classList.contains("dark");
      setDark(d); darkRef.current = d;
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* ─── Physics initialiser for one normie ─────────────────────────────── */
  const initBody = useCallback((tokenId: number) => {
    if (bodies.current.has(tokenId)) return;
    const cw = canvasRef.current?.width ?? 1000;
    const minFx = ANC_X + 12,  maxFx = cw  - (SPR_W - ANC_X) - 12;
    const minFy = ANC_Y + 12,  maxFy = CANVAS_H - (SPR_H - ANC_Y) - 12;
    bodies.current.set(tokenId, {
      fx: minFx + Math.random() * Math.max(0, maxFx - minFx),
      fy: minFy + Math.random() * Math.max(0, maxFy - minFy),
      vx: randV(), vy: randV() * 0.4,
      facing: Math.random() < 0.5 ? 1 : -1,
      walkFrame: Math.floor(Math.random() * 4),
      walkTimer: 0,
      state: "walk",
      stateUntil: 0,
      partnerId: null,
    });
  }, []);

  /* ─── Sprite-sheet loader ─────────────────────────────────────────────── */
  const loadSheet = useCallback((tokenId: number) => {
    if (sheets.current.has(tokenId)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `${SPRITES_API}/normies/${tokenId}/sheet.png`;
    sheets.current.set(tokenId, img);
  }, []);

  /* ─── Data fetch ──────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        /* 1. Total count */
        const cntRes = await fetch(`${AGENTS_API}/agents/count`);
        if (!cancelled && cntRes.ok) {
          const { count } = await cntRes.json();
          setTotal(count ?? 0);
        }

        /* 2. Paginate agents/list until we have MAX_NORMIES */
        let cursor: string | null = null;
        let hasMore = true;
        const collected: AgentItem[] = [];

        while (hasMore && collected.length < MAX_NORMIES) {
          const url = new URL(`${AGENTS_API}/agents/list`);
          url.searchParams.set("limit", "100");
          url.searchParams.set("sort", "newest");
          if (cursor) url.searchParams.set("cursor", cursor);

          const r = await fetch(url.toString());
          if (!r.ok) break;
          const d = await r.json();
          const items: AgentItem[] = d.items ?? [];
          hasMore = d.hasMore ?? false;
          if (!items.length) break;
          cursor = items[items.length - 1].agentId;
          for (const it of items) {
            if (collected.length >= MAX_NORMIES) break;
            collected.push(it);
          }
        }

        if (cancelled) return;

        /* 3. Add all normies to lounge immediately (without persona) */
        const base: Normie[] = collected.map(a => ({
          tokenId: Number(a.tokenId), name: a.name, type: a.type,
        }));
        setNormies(base);
        setLoading(false);
        base.forEach(n => { initBody(n.tokenId); loadSheet(n.tokenId); });

        /* 4. Load full persona in batches, enrich normies progressively */
        for (let i = 0; i < collected.length; i += BATCH_SIZE) {
          if (cancelled) break;
          const batch = collected.slice(i, i + BATCH_SIZE);
          const infos = await Promise.all(batch.map(async item => {
            try {
              const r = await fetch(`${AGENTS_API}/agents/info/${item.tokenId}`);
              return r.ok ? (await r.json() as AgentInfo) : null;
            } catch { return null; }
          }));
          if (cancelled) break;
          setNormies(prev => {
            const next = [...prev];
            infos.forEach((info, j) => {
              if (!info) return;
              const idx = next.findIndex(n => n.tokenId === Number(batch[j].tokenId));
              if (idx >= 0) next[idx] = { ...next[idx], info };
            });
            return next;
          });
          setInfoLoaded(i + BATCH_SIZE);
          /* small pause between batches — respects API rate limits */
          await new Promise(res => setTimeout(res, 250));
        }
      } catch (err) {
        console.error("[ArchiveLounge] fetch error:", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [initBody, loadSheet]);

  /* ─── Main animation / physics loop ──────────────────────────────────── */
  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(now - prevNowRef.current, 50); // cap at 50 ms
      prevNowRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx)    { rafRef.current = requestAnimationFrame(loop); return; }

      const cw     = canvas.width;
      const isDark = darkRef.current;
      const norms  = normiesRef.current;
      const bods   = bodies.current;

      const minFx = ANC_X + 12;
      const maxFx = cw - (SPR_W - ANC_X) - 12;
      const minFy = ANC_Y + 12;
      const maxFy = CANVAS_H - (SPR_H - ANC_Y) - 12;

      /* ── Physics update ─────────────────────────────────────────────── */
      for (const n of norms) {
        const b = bods.get(n.tokenId);
        if (!b) continue;

        if (b.state === "talk" || b.state === "idle") {
          if (now > b.stateUntil) {
            b.state = "walk";
            b.partnerId = null;
            /* give a fresh random velocity */
            b.vx = randV();
            b.vy = randV() * 0.4;
          }
          /* still update walk frame so sprite animates subtly while standing */
          if (b.state === "idle") {
            b.walkTimer += dt;
            if (b.walkTimer >= WALK_FRAME_MS * 2) b.walkTimer = 0; // slow bob
          }
          continue;
        }

        /* walking: random chance to go idle */
        if (Math.random() < IDLE_CHANCE * (dt / 16)) {
          b.state    = "idle";
          b.stateUntil = now + IDLE_MS_MIN + Math.random() * (IDLE_MS_MAX - IDLE_MS_MIN);
          continue;
        }

        /* move */
        const step = dt / 16;
        b.fx += b.vx * step;
        b.fy += b.vy * step;

        /* bounce */
        if (b.fx < minFx) { b.fx = minFx; b.vx =  Math.abs(b.vx); }
        if (b.fx > maxFx) { b.fx = maxFx; b.vx = -Math.abs(b.vx); }
        if (b.fy < minFy) { b.fy = minFy; b.vy =  Math.abs(b.vy); }
        if (b.fy > maxFy) { b.fy = maxFy; b.vy = -Math.abs(b.vy); }

        /* facing direction follows horizontal motion */
        if (Math.abs(b.vx) > 0.08) b.facing = b.vx > 0 ? 1 : -1;

        /* advance walk animation */
        b.walkTimer += dt;
        if (b.walkTimer >= WALK_FRAME_MS) {
          b.walkTimer = 0;
          b.walkFrame = (b.walkFrame + 1) % 4;
        }
      }

      /* ── Conversation proximity scan (10×/s) ─────────────────────── */
      if (now - lastCheckRef.current > 100) {
        lastCheckRef.current = now;

        const talking = [...bods.values()].filter(b => b.state === "talk").length / 2;

        if (talking < MAX_TALKS && now - lastConvRef.current > CONV_COOL_MS) {
          outer: for (let i = 0; i < norms.length; i++) {
            const bA = bods.get(norms[i].tokenId);
            if (!bA || bA.state !== "walk") continue;

            for (let j = i + 1; j < norms.length; j++) {
              const bB = bods.get(norms[j].tokenId);
              if (!bB || bB.state !== "walk") continue;

              const d = Math.hypot(bA.fx - bB.fx, bA.fy - bB.fy);
              if (d < TALK_DIST) {
                /* start conversation */
                const endTime = now + TALK_MS;
                bA.state = "talk"; bA.stateUntil = endTime; bA.partnerId = norms[j].tokenId;
                bB.state = "talk"; bB.stateUntil = endTime; bB.partnerId = norms[i].tokenId;
                lastConvRef.current = now;

                /* face each other */
                bA.facing = bA.fx < bB.fx ? 1 : -1;
                bB.facing = bB.fx < bA.fx ? 1 : -1;

                const uid = String(now | 0);
                const bubbleA: Bubble = {
                  id:   `${norms[i].tokenId}-${uid}`,
                  tokenId: norms[i].tokenId,
                  name: norms[i].name,
                  text: pickText(norms[i].info),
                  x:    bA.fx, y: bA.fy - ANC_Y,
                };
                const bubbleB: Bubble = {
                  id:   `${norms[j].tokenId}-${uid}`,
                  tokenId: norms[j].tokenId,
                  name: norms[j].name,
                  text: pickText(norms[j].info),
                  x:    bB.fx, y: bB.fy - ANC_Y,
                };

                setBubbles(prev => [
                  ...prev.filter(bu =>
                    bu.tokenId !== norms[i].tokenId &&
                    bu.tokenId !== norms[j].tokenId
                  ),
                  bubbleA, bubbleB,
                ]);

                const idA = bubbleA.id, idB = bubbleB.id;
                setTimeout(() => {
                  setBubbles(prev => prev.filter(bu => bu.id !== idA && bu.id !== idB));
                }, TALK_MS + 400);

                break outer;
              }
            }
          }
        }
      }

      /* ── Render ─────────────────────────────────────────────────────── */
      ctx.clearRect(0, 0, cw, CANVAS_H);

      /* ── Dot grid ── */
      ctx.fillStyle = isDark
        ? "rgba(255,255,255,0.028)"
        : "rgba(0,0,0,0.045)";
      const gs = 22;
      for (let gx = gs; gx < cw;       gx += gs)
      for (let gy = gs; gy < CANVAS_H; gy += gs)
        ctx.fillRect(gx - 0.5, gy - 0.5, 1.5, 1.5);

      /* ── Floor ── */
      const floorY = CANVAS_H - 8;
      const flGrad = ctx.createLinearGradient(0, floorY - 60, 0, CANVAS_H);
      if (isDark) {
        flGrad.addColorStop(0, "rgba(6,182,212,0)");
        flGrad.addColorStop(1, "rgba(6,182,212,0.14)");
      } else {
        flGrad.addColorStop(0, "rgba(72,73,75,0)");
        flGrad.addColorStop(1, "rgba(72,73,75,0.09)");
      }
      ctx.fillStyle = flGrad;
      ctx.fillRect(0, floorY - 60, cw, CANVAS_H - (floorY - 60));

      ctx.fillStyle = isDark ? "rgba(6,182,212,0.5)" : "rgba(72,73,75,0.18)";
      ctx.fillRect(0, floorY, cw, 1);

      /* ── Sort normies by Y (pseudo-depth) ── */
      const sorted = [...norms].sort(
        (a, b) => (bods.get(a.tokenId)?.fy ?? 0) - (bods.get(b.tokenId)?.fy ?? 0)
      );

      /* ── Draw sprites ── */
      for (const n of sorted) {
        const body  = bods.get(n.tokenId);
        const sheet = sheets.current.get(n.tokenId);
        if (!body) continue;

        const frameIdx =
          body.state === "talk" ? 4 :    // stand frame
          body.state === "idle" ? 4 :    // stand frame
          body.walkFrame;                 // walk frames 0-3
        const srcX = frameIdx * SHEET_FW;

        const drawX = Math.round(body.fx - ANC_X);
        const drawY = Math.round(body.fy - ANC_Y);

        ctx.save();

        /* dark-mode: invert pixel colours (transparent bg stays transparent) */
        if (isDark) ctx.filter = "invert(1)";

        if (body.facing === -1) {
          /* flip sprite horizontally to face left */
          ctx.translate(drawX + SPR_W, drawY);
          ctx.scale(-1, 1);
          if (sheet?.complete && sheet.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sheet, srcX, 0, SHEET_FW, NATIVE_H, 0, 0, SPR_W, SPR_H);
          } else {
            /* placeholder while loading */
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
            ctx.fillRect(0, 0, SPR_W, SPR_H);
          }
        } else {
          if (sheet?.complete && sheet.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sheet, srcX, 0, SHEET_FW, NATIVE_H, drawX, drawY, SPR_W, SPR_H);
          } else {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
            ctx.fillRect(drawX, drawY, SPR_W, SPR_H);
          }
        }

        ctx.filter = "none";

        /* ── Conversation link line between talking pairs ── */
        if (body.state === "talk" && body.partnerId !== null) {
          const partner = bods.get(body.partnerId);
          if (partner && partner.fx > body.fx) { // only draw once (lower tokenId)
            ctx.beginPath();
            ctx.moveTo(body.fx, body.fy - ANC_Y / 2);
            ctx.lineTo(partner.fx, partner.fy - ANC_Y / 2);
            ctx.setLineDash([3, 5]);
            ctx.strokeStyle = isDark
              ? "rgba(6,182,212,0.25)"
              : "rgba(72,73,75,0.12)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        /* ── Name tag ── */
        const nameY = body.fy + (SPR_H - ANC_Y) + 7;
        ctx.font = `600 8px "IBM Plex Mono",monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = isDark ? "rgba(212,213,211,0.5)" : "rgba(72,73,75,0.5)";
        ctx.fillText(truncate(n.name, 15), body.fx, nameY);

        /* state dot (talking = cyan, idle = muted) */
        if (body.state !== "walk") {
          const dotColor = body.state === "talk"
            ? (isDark ? "#22d3ee" : "#0891b2")
            : (isDark ? "rgba(212,213,211,0.4)" : "rgba(72,73,75,0.3)");
          ctx.beginPath();
          ctx.arc(body.fx, nameY + 8, 2, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }

        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    prevNowRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // deps intentionally empty — all mutable state is in refs

  /* ─── Canvas resize ───────────────────────────────────────────────────── */
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      const ct = containerRef.current;
      if (!c || !ct) return;
      c.width  = ct.clientWidth;
      c.height = CANVAS_H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ─── Render ──────────────────────────────────────────────────────────── */
  const hasNormies = normies.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-cyan-500 flex-shrink-0" />
            <h1 className="font-mono text-2xl font-medium text-n-text">archive lounge</h1>
            {total > 0 && (
              <span className="text-[10px] font-mono px-2 py-px border border-cyan-400/40 rounded-sm text-cyan-600 dark:text-cyan-400 tracking-wide">
                {total} agents online
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-n-faint pl-7">
            agentic normies hanging out · erc-8004 · full-body sprites
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-n-faint">
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />
              scanning agents…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-cyan-500" />
              {normies.length} in lounge
              {infoLoaded < normies.length && (
                <span className="text-n-faint">
                  &nbsp;· loading personas ({infoLoaded}/{normies.length})
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Lounge canvas ── */}
      <div
        ref={containerRef}
        className="relative w-full border border-n-border rounded overflow-hidden bg-n-bg"
        style={{ height: CANVAS_H }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full"
          style={{ height: CANVAS_H, display: "block" }}
        />

        {/* ── Speech bubbles (DOM overlay, not canvas) ── */}
        <AnimatePresence>
          {bubbles.map(bubble => {
            const cw = containerRef.current?.clientWidth ?? 900;
            /* clamp to stay inside the lounge container */
            const bubbleW = 168;
            const left = Math.max(8, Math.min(bubble.x - bubbleW / 2, cw - bubbleW - 8));
            const top  = Math.max(8, bubble.y - 78);

            return (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 0, y: 10, scale: 0.88 }}
                animate={{ opacity: 1, y: 0,  scale: 1    }}
                exit   ={{ opacity: 0, y: -6,  scale: 0.94 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute pointer-events-none"
                style={{ left, top, width: bubbleW, zIndex: 10 }}
              >
                <div className="relative bg-n-white border border-n-border rounded shadow-sm px-3 py-2.5">
                  {/* speaker name */}
                  <div className="text-[8px] font-mono font-bold text-cyan-600 dark:text-cyan-400 mb-1 uppercase tracking-widest">
                    {truncate(bubble.name, 14)}
                  </div>
                  {/* speech text */}
                  <p className="text-[9px] font-mono text-n-text leading-relaxed">
                    {truncate(bubble.text, 100)}
                  </p>
                  {/* bubble tail */}
                  <div
                    className="absolute w-2.5 h-2.5 rotate-45 bg-n-white border-r border-b border-n-border"
                    style={{ bottom: -6, left: 14 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ── Loading overlay ── */}
        {loading && !hasNormies && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-9 h-14 border border-n-border rounded bg-n-surface"
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 1.2, delay: i * 0.12, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-xs font-mono text-n-muted">
              summoning agentic normies…
            </p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !hasNormies && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs font-mono text-n-faint">no agentic normies registered yet</p>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] font-mono text-n-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-500/80" />
          talking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-n-border" />
          idle
        </span>
        <span className="ml-auto">
          sprites ·{" "}
          <a
            href="https://fullnormies.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-n-muted transition-colors"
          >
            fullnormies.vercel.app
          </a>
          {" · "}
          personas ·{" "}
          <a
            href="https://api.normies.art"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-n-muted transition-colors"
          >
            api.normies.art
          </a>
          {" · "}
          ERC-8004
        </span>
      </div>
    </div>
  );
}
