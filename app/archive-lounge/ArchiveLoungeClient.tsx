"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Bot, Wifi, Lock } from "lucide-react";

/* ─── API base URLs ──────────────────────────────────────────────────────── */
const AGENTS_API  = "https://api.normies.art";
const SPRITES_API = "https://fullnormies.vercel.app/api/v1"; // CORS open

/* ─── Sprite geometry (verified via /full-meta.json) ────────────────────── */
// Native sprite: 40×80 px, anchor at (20, 64) = foot bottom-center
// Sheet: 280×80 px, 7 frames × 40 px wide
//   walk=[0,1,2,3]  stand=[4]  sit=[5]  sleep=[6]
const NATIVE_W    = 40;
const NATIVE_H    = 80;
const SCALE       = 2;                    // display at 2× native
const SPR_W       = NATIVE_W * SCALE;     // 80  px on canvas
const SPR_H       = NATIVE_H * SCALE;     // 160 px on canvas
const ANC_X       = 20 * SCALE;           // 40  — foot from left of sprite
const ANC_Y       = 64 * SCALE;           // 128 — foot from top of sprite
const FOOT_BELOW  = SPR_H - ANC_Y;        // 32  — sprite pixels below foot
const SHEET_FW    = NATIVE_W;             // 40 px per frame in source sheet

/* ─── Lounge constants ───────────────────────────────────────────────────── */
const CANVAS_H      = 560;
const NAMETAG_H     = 18;           // space reserved for name below sprite
const WALK_FRAME_MS = 160;          // ms per walk frame
const BASE_SPEED    = 0.85;         // px per frame at 60 fps
const TALK_DIST     = SPR_W * 1.6;  // px anchor-to-anchor to start chat
const TALK_MS       = 6000;
const CONV_COOL_MS  = 3800;         // min gap between conversation starts
const MAX_TALKS     = 4;
const MAX_NORMIES   = 50;
const IDLE_CHANCE   = 0.0005;       // per-frame idle probability
const IDLE_MS_MIN   = 1000;
const IDLE_MS_MAX   = 2500;
const BATCH_SIZE    = 5;
const PASSCODE      = "4356";
const LS_KEY        = "nl_unlocked";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface AgentItem { agentId: string; tokenId: string; name: string; type: string }
interface AgentInfo {
  tokenId: string; name: string; type: string;
  tagline?: string; greeting?: string;
  personalityTraits?: string[]; quirks?: string[];
  communicationStyle?: string;
}
interface Normie    { tokenId: number; name: string; type: string; info?: AgentInfo }
interface Body {
  fx: number; fy: number; vx: number; vy: number;
  facing: 1 | -1;
  walkFrame: number; walkTimer: number;
  state: "walk" | "talk" | "idle";
  stateUntil: number;     // performance.now() deadline
  partnerId: number | null;
}
interface Bubble    { id: string; tokenId: number; name: string; text: string; x: number; y: number }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function randV(): number {
  const s = (0.35 + Math.random() * 0.85) * BASE_SPEED;
  return Math.random() < 0.5 ? s : -s;
}
function pickText(info?: AgentInfo): string {
  if (!info) return "…";
  const pool: string[] = [];
  if (info.greeting)           pool.push(info.greeting);
  if (info.tagline)            pool.push(info.tagline);
  if (info.communicationStyle) pool.push(info.communicationStyle);
  info.personalityTraits?.slice(0, 3).forEach(t => pool.push(t));
  info.quirks?.slice(0, 2).forEach(t => pool.push(t));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "…";
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function makeBody(cw: number): Body {
  const minFx = ANC_X + 12;
  const maxFx = cw - (SPR_W - ANC_X) - 12;
  const minFy = ANC_Y + 12;
  const maxFy = CANVAS_H - FOOT_BELOW - NAMETAG_H - 12;
  return {
    fx: minFx + Math.random() * Math.max(0, maxFx - minFx),
    fy: minFy + Math.random() * Math.max(0, maxFy - minFy),
    vx: randV(), vy: randV() * 0.35,
    facing: Math.random() < 0.5 ? 1 : -1,
    walkFrame: Math.floor(Math.random() * 4),
    walkTimer: Math.random() * WALK_FRAME_MS,
    state: "walk", stateUntil: 0, partnerId: null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCK SCREEN
══════════════════════════════════════════════════════════════════════════ */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits]   = useState<string[]>([]);
  const [shake, setShake]     = useState(false);
  const [success, setSuccess] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => { hiddenRef.current?.focus(); }, []);

  const push = useCallback((d: string) => {
    if (shake) return;
    setDigits(prev => {
      if (prev.length >= 4) return prev;
      const next = [...prev, d];
      if (next.length === 4) {
        if (next.join("") === PASSCODE) {
          setSuccess(true);
          setTimeout(onUnlock, 500);
        } else {
          setShake(true);
          setTimeout(() => { setShake(false); setDigits([]); }, 600);
          return next; // briefly show filled before clear
        }
      }
      return next;
    });
  }, [shake, onUnlock]);

  const pop = useCallback(() => { if (!shake) setDigits(prev => prev.slice(0, -1)); }, [shake]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^\d$/.test(e.key)) push(e.key);
    else if (e.key === "Backspace") pop();
  }, [push, pop]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-8 select-none"
      onClick={() => hiddenRef.current?.focus()}
    >
      {/* Hidden real input for keyboard */}
      <input
        ref={hiddenRef}
        className="sr-only"
        onKeyDown={handleKey}
        readOnly
        value=""
        inputMode="numeric"
      />

      {/* Icon */}
      <motion.div
        animate={success ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : {}}
        className="flex flex-col items-center gap-3"
      >
        <Lock className={`w-8 h-8 ${success ? "text-cyan-500" : "text-n-muted"} transition-colors`} />
        <p className="text-xs font-mono text-n-faint uppercase tracking-widest">archive lounge</p>
      </motion.div>

      {/* 4-digit display */}
      <motion.div
        animate={shake ? { x: [-8, 8, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-3"
      >
        {[0, 1, 2, 3].map(i => {
          const filled = i < digits.length;
          const active = i === digits.length;
          return (
            <div
              key={i}
              className={`w-11 h-13 border rounded flex items-center justify-center transition-all duration-150 ${
                success
                  ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30"
                  : shake
                    ? "border-red-400 bg-red-50 dark:bg-red-900/20"
                    : filled
                      ? "border-n-text bg-n-surface"
                      : active
                        ? "border-n-muted bg-n-surface"
                        : "border-n-border bg-n-bg"
              }`}
              style={{ width: 44, height: 52 }}
            >
              <span className={`font-mono text-lg ${
                success ? "text-cyan-600 dark:text-cyan-400" :
                shake    ? "text-red-500" : "text-n-text"
              }`}>
                {filled ? "●" : active ? <span className="animate-blink">_</span> : ""}
              </span>
            </div>
          );
        })}
      </motion.div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2">
        {["1","2","3","4","5","6","7","8","9","←","0",""].map((k, i) => (
          <button
            key={i}
            onClick={() => { if (k === "←") pop(); else if (k) push(k); }}
            disabled={!k || shake}
            className={`w-12 h-12 font-mono text-sm border rounded transition-colors ${
              k
                ? "border-n-border text-n-muted hover:border-n-text hover:text-n-text hover:bg-n-surface active:bg-n-surface"
                : "invisible"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <p className="text-[10px] font-mono text-n-faint">enter passcode to enter</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LOUNGE ROOM
══════════════════════════════════════════════════════════════════════════ */
function LoungeRoom() {
  const [normies,     setNormies]     = useState<Normie[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [infoLoaded,  setInfoLoaded]  = useState(0);
  const [dark,        setDark]        = useState(false);
  const [bubbles,     setBubbles]     = useState<Bubble[]>([]);

  /* refs — mutable, live inside rAF loop without stale closures */
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const prevNow      = useRef<number>(0);
  const darkRef      = useRef(false);
  const normiesRef   = useRef<Normie[]>([]);
  const bodies       = useRef<Map<number, Body>>(new Map());
  /* sheets[tokenId] = 280×80 sprite sheet HTMLImageElement */
  const sheets       = useRef<Map<number, HTMLImageElement>>(new Map());
  const lastConv     = useRef<number>(-CONV_COOL_MS);
  const lastCheck    = useRef<number>(0);
  const convCount    = useRef<number>(0);

  useEffect(() => { normiesRef.current = normies; }, [normies]);
  useEffect(() => { darkRef.current = dark; },      [dark]);

  /* ── Dark mode observer ─────────────────────────────────────────────── */
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

  /* ── Load sprite sheet ──────────────────────────────────────────────── */
  const loadSheet = useCallback((tokenId: number) => {
    if (sheets.current.has(tokenId)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `${SPRITES_API}/normies/${tokenId}/sheet.png`;
    sheets.current.set(tokenId, img);
  }, []);

  /* ── Data fetch ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cntData = await fetch(`${AGENTS_API}/agents/count`).then(r => r.json()).catch(() => null);
        if (!cancelled && cntData) setTotal(cntData.count ?? 0);

        /* paginate agents/list */
        let cursor: string | null = null;
        let hasMore = true;
        const collected: AgentItem[] = [];
        while (hasMore && collected.length < MAX_NORMIES) {
          const url = new URL(`${AGENTS_API}/agents/list`);
          url.searchParams.set("limit", "100");
          url.searchParams.set("sort", "newest");
          if (cursor) url.searchParams.set("cursor", cursor);
          const d = await fetch(url.toString()).then(r => r.json()).catch(() => ({ items: [], hasMore: false }));
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

        /* seed normies without persona — start walking immediately */
        const base: Normie[] = collected.map(a => ({
          tokenId: Number(a.tokenId), name: a.name, type: a.type,
        }));
        setNormies(base);
        setLoading(false);
        base.forEach(n => loadSheet(n.tokenId));

        /* enrich with persona in batches */
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
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (err) {
        console.error("[LoungeRoom] fetch error:", err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadSheet]);

  /* ── Main rAF loop ──────────────────────────────────────────────────── */
  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(now - prevNow.current, 50);
      prevNow.current = now;

      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx)    { rafRef.current = requestAnimationFrame(loop); return; }

      const cw     = canvas.width;
      const isDark = darkRef.current;
      const norms  = normiesRef.current;
      const bods   = bodies.current;

      /* wall bounds (in foot-anchor coords) */
      const minFx = ANC_X + 12;
      const maxFx = cw - (SPR_W - ANC_X) - 12;
      const minFy = ANC_Y + 12;
      const maxFy = CANVAS_H - FOOT_BELOW - NAMETAG_H - 12;

      /* ── Physics ───────────────────────────────────────────────────── */
      for (const n of norms) {
        /* lazy-init body using current canvas width */
        if (!bods.has(n.tokenId)) bods.set(n.tokenId, makeBody(cw));
        const b = bods.get(n.tokenId)!;

        if (b.state === "talk" || b.state === "idle") {
          const wasT = b.state === "talk";
          if (now > b.stateUntil) {
            if (wasT) convCount.current = Math.max(0, convCount.current - 1);
            b.state = "walk"; b.partnerId = null;
            b.vx = randV(); b.vy = randV() * 0.35;
          }
          /* walk frame ticks slowly while idle (gentle bob) */
          if (b.state === "idle") {
            b.walkTimer += dt;
            if (b.walkTimer > WALK_FRAME_MS * 3) b.walkTimer = 0;
          }
          continue;
        }

        /* random idle chance */
        if (Math.random() < IDLE_CHANCE * (dt / 16)) {
          b.state = "idle";
          b.stateUntil = now + IDLE_MS_MIN + Math.random() * (IDLE_MS_MAX - IDLE_MS_MIN);
          continue;
        }

        /* move */
        const step = dt / 16;
        b.fx += b.vx * step;
        b.fy += b.vy * step;

        /* bounce off walls */
        if (b.fx < minFx) { b.fx = minFx; b.vx =  Math.abs(b.vx); }
        if (b.fx > maxFx) { b.fx = maxFx; b.vx = -Math.abs(b.vx); }
        if (b.fy < minFy) { b.fy = minFy; b.vy =  Math.abs(b.vy); }
        if (b.fy > maxFy) { b.fy = maxFy; b.vy = -Math.abs(b.vy); }

        if (Math.abs(b.vx) > 0.06) b.facing = b.vx > 0 ? 1 : -1;

        b.walkTimer += dt;
        if (b.walkTimer >= WALK_FRAME_MS) {
          b.walkTimer = 0;
          b.walkFrame = (b.walkFrame + 1) % 4;
        }
      }

      /* ── Conversation proximity scan (10×/s) ──────────────────────── */
      if (now - lastCheck.current > 100) {
        lastCheck.current = now;
        if (convCount.current < MAX_TALKS && now - lastConv.current > CONV_COOL_MS) {
          outer: for (let i = 0; i < norms.length; i++) {
            const bA = bods.get(norms[i].tokenId);
            if (!bA || bA.state !== "walk") continue;
            for (let j = i + 1; j < norms.length; j++) {
              const bB = bods.get(norms[j].tokenId);
              if (!bB || bB.state !== "walk") continue;
              const d = Math.hypot(bA.fx - bB.fx, bA.fy - bB.fy);
              if (d < TALK_DIST) {
                const endTime = now + TALK_MS;
                bA.state = "talk"; bA.stateUntil = endTime; bA.partnerId = norms[j].tokenId;
                bB.state = "talk"; bB.stateUntil = endTime; bB.partnerId = norms[i].tokenId;
                bA.facing = bA.fx < bB.fx ? 1 : -1;
                bB.facing = bB.fx < bA.fx ? 1 : -1;
                lastConv.current = now;
                convCount.current++;

                const uid = `${now | 0}`;
                const bblA: Bubble = { id: `${norms[i].tokenId}-${uid}`, tokenId: norms[i].tokenId, name: norms[i].name, text: pickText(norms[i].info), x: bA.fx, y: bA.fy - ANC_Y };
                const bblB: Bubble = { id: `${norms[j].tokenId}-${uid}`, tokenId: norms[j].tokenId, name: norms[j].name, text: pickText(norms[j].info), x: bB.fx, y: bB.fy - ANC_Y };

                setBubbles(prev => [
                  ...prev.filter(b => b.tokenId !== norms[i].tokenId && b.tokenId !== norms[j].tokenId),
                  bblA, bblB,
                ]);
                const aId = bblA.id, bId = bblB.id;
                setTimeout(() => setBubbles(p => p.filter(b => b.id !== aId && b.id !== bId)), TALK_MS + 600);
                break outer;
              }
            }
          }
        }
      }

      /* ── Render ────────────────────────────────────────────────────── */
      ctx.clearRect(0, 0, cw, CANVAS_H);

      /* dot grid */
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.028)" : "rgba(0,0,0,0.042)";
      for (let gx = 20; gx < cw;       gx += 20)
      for (let gy = 20; gy < CANVAS_H; gy += 20)
        ctx.fillRect(gx - 0.5, gy - 0.5, 1.5, 1.5);

      /* floor glow */
      const flY = CANVAS_H - 6;
      const flG = ctx.createLinearGradient(0, flY - 50, 0, CANVAS_H);
      flG.addColorStop(0, isDark ? "rgba(6,182,212,0)"    : "rgba(72,73,75,0)");
      flG.addColorStop(1, isDark ? "rgba(6,182,212,0.13)" : "rgba(72,73,75,0.08)");
      ctx.fillStyle = flG;
      ctx.fillRect(0, flY - 50, cw, CANVAS_H - (flY - 50));
      ctx.fillStyle = isDark ? "rgba(6,182,212,0.45)" : "rgba(72,73,75,0.16)";
      ctx.fillRect(0, flY, cw, 1);

      /* sort sprites back-to-front by Y (pseudo depth) */
      const sorted = [...norms].sort(
        (a, b) => (bods.get(a.tokenId)?.fy ?? 0) - (bods.get(b.tokenId)?.fy ?? 0)
      );

      /* ── Draw each normie ── */
      for (const n of sorted) {
        const body  = bods.get(n.tokenId);
        const sheet = sheets.current.get(n.tokenId);
        if (!body) continue;

        /* which sheet frame to show */
        const frameIdx =
          body.state === "talk" ? 4 :         // stand
          body.state === "idle" ? 4 :          // stand
          body.walkFrame;                      // 0-3 walk

        const srcX  = frameIdx * SHEET_FW;    // source x in sheet (multiples of 40)
        const dstX  = Math.round(body.fx - ANC_X);
        const dstY  = Math.round(body.fy - ANC_Y);

        const canDraw = sheet?.complete && (sheet.naturalWidth > 0);

        ctx.save();

        /* invert sprite colours for dark mode:
           - transparent pixels stay transparent (alpha not inverted)
           - #e3e5e4 (off-pixel) → #1c1a1b  (nearly invisible on dark bg)
           - #48494b (on-pixel)  → #b6b6b4  (light, visible on dark bg)   */
        if (isDark) ctx.filter = "invert(1)";

        if (body.facing === -1) {
          /* flip horizontally around the sprite's centre */
          ctx.translate(dstX + SPR_W, dstY);
          ctx.scale(-1, 1);
          if (canDraw) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sheet!, srcX, 0, SHEET_FW, NATIVE_H, 0, 0, SPR_W, SPR_H);
          } else {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
            ctx.fillRect(0, 0, SPR_W, SPR_H);
          }
        } else {
          if (canDraw) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sheet!, srcX, 0, SHEET_FW, NATIVE_H, dstX, dstY, SPR_W, SPR_H);
          } else {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
            ctx.fillRect(dstX, dstY, SPR_W, SPR_H);
          }
        }

        ctx.filter = "none";

        /* dashed conversation link line (drawn once per pair from lower tokenId) */
        if (body.state === "talk" && body.partnerId !== null && body.partnerId > n.tokenId) {
          const pb = bods.get(body.partnerId);
          if (pb) {
            ctx.setLineDash([3, 6]);
            ctx.strokeStyle = isDark ? "rgba(6,182,212,0.3)" : "rgba(72,73,75,0.15)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(body.fx, body.fy - ANC_Y * 0.35);
            ctx.lineTo(pb.fx,   pb.fy   - ANC_Y * 0.35);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        /* name tag */
        const tagY = body.fy + FOOT_BELOW + 9;
        ctx.font = `500 7px "IBM Plex Mono",monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = isDark ? "rgba(212,213,211,0.45)" : "rgba(72,73,75,0.45)";
        ctx.fillText(trunc(n.name, 16), body.fx, tagY);

        /* small state dot */
        if (body.state !== "walk") {
          ctx.beginPath();
          ctx.arc(body.fx, tagY + 7, 2, 0, Math.PI * 2);
          ctx.fillStyle = body.state === "talk"
            ? (isDark ? "#22d3ee" : "#0891b2")
            : (isDark ? "rgba(212,213,211,0.3)" : "rgba(72,73,75,0.3)");
          ctx.fill();
        }

        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    prevNow.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // intentionally no deps — all mutable state via refs

  /* ── Canvas resize ──────────────────────────────────────────────────── */
  useEffect(() => {
    const resize = () => {
      const c  = canvasRef.current;
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

  /* ── Render ─────────────────────────────────────────────────────────── */
  const hasNormies = normies.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-cyan-500 flex-shrink-0" />
            <h1 className="font-mono text-2xl font-medium text-n-text">archive lounge</h1>
            {total > 0 && (
              <span className="text-[10px] font-mono px-2 py-px border border-cyan-400/40 rounded-sm text-cyan-600 dark:text-cyan-400 tracking-wide">
                {total} agents
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-n-faint pl-7">
            agentic normies · erc-8004 · full-body sprites via fullnormies.vercel.app
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-n-faint">
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-500" /> scanning…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-cyan-500" />
              {normies.length} in lounge
              {infoLoaded < normies.length && (
                <span className="text-n-faint"> · loading personas ({Math.min(infoLoaded, normies.length)}/{normies.length})</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative w-full border border-n-border rounded overflow-hidden bg-n-bg"
        style={{ height: CANVAS_H }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: CANVAS_H }}
        />

        {/* Speech bubbles — DOM overlay */}
        <AnimatePresence>
          {bubbles.map(bubble => {
            const cw  = containerRef.current?.clientWidth ?? 900;
            const bW  = 162;
            const left = Math.max(8, Math.min(bubble.x - bW / 2, cw - bW - 8));
            const top  = Math.max(8, bubble.y - 82);
            return (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit   ={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute pointer-events-none"
                style={{ left, top, width: bW, zIndex: 10 }}
              >
                <div className="relative bg-n-white border border-n-border rounded shadow-sm px-2.5 py-2">
                  <div className="text-[8px] font-mono font-bold text-cyan-600 dark:text-cyan-400 mb-1 uppercase tracking-widest leading-none">
                    {trunc(bubble.name, 15)}
                  </div>
                  <p className="text-[9px] font-mono text-n-text leading-relaxed break-words">
                    {trunc(bubble.text, 110)}
                  </p>
                  <div
                    className="absolute w-2.5 h-2.5 rotate-45 bg-n-white border-r border-b border-n-border"
                    style={{ bottom: -6, left: 12 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Loading state */}
        {loading && !hasNormies && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-8 h-14 border border-n-border rounded bg-n-surface"
                  animate={{ opacity: [0.25, 0.7, 0.25] }}
                  transition={{ duration: 1.4, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="text-xs font-mono text-n-muted">summoning agentic normies…</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !hasNormies && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs font-mono text-n-faint">no agentic normies registered yet</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] font-mono text-n-faint">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-500/80 inline-block" /> talking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-n-border inline-block" /> idle
        </span>
        <span className="ml-auto">
          sprites ·{" "}
          <a href="https://fullnormies.vercel.app" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2 hover:text-n-muted transition-colors">
            fullnormies.vercel.app
          </a>
          {" · "}personas ·{" "}
          <a href="https://api.normies.art" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2 hover:text-n-muted transition-colors">
            api.normies.art
          </a>
          {" · "}erc-8004
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT EXPORT — handles passcode gate
══════════════════════════════════════════════════════════════════════════ */
export default function ArchiveLoungeClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked,  setChecked]  = useState(false);

  /* read localStorage only on client */
  useEffect(() => {
    setUnlocked(localStorage.getItem(LS_KEY) === "1");
    setChecked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    setUnlocked(true);
  }, []);

  if (!checked) return null; // avoid SSR/hydration mismatch

  if (!unlocked) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-10">
        <LockScreen onUnlock={handleUnlock} />
      </div>
    );
  }

  return <LoungeRoom />;
}
