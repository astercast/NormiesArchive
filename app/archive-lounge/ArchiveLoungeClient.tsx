"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Bot, Wifi, Lock, MessageSquare, Users } from "lucide-react";
import Link from "next/link";

/* ── APIs ─────────────────────────────────────────────────────────────────── */
const AGENTS_API  = "https://api.normies.art";
const SPRITES_API = "https://fullnormies.vercel.app/api/v1";

/* ── Sprite geometry (verified via /full-meta.json — anchor y=60) ──────────
   Sheet: 280×80 native, 7 frames × 40px wide.
   frames: walk=[0,1,2,3]  stand=[4]  sit=[5]  sleep=[6]
   At SCALE=2: sheet renders as 560×160, each frame 80px wide.
   Anchor: foot is at (20,60) native → (40,120) at 2×.
   Sprites render right-facing; flip with CSS scaleX(-1) for left.           */
const SCALE      = 2;
const SPR_W      = 40 * SCALE;   // 80
const SPR_H      = 80 * SCALE;   // 160
const ANC_X      = 20 * SCALE;   // 40 — foot from sprite left
const ANC_Y      = 60 * SCALE;   // 120 — foot from sprite top
const FOOT_BELOW = SPR_H - ANC_Y;           // 40 — pixels below foot
const SHEET_CSS_W = 7 * SPR_W;              // 560px — displayed sheet width
const FRAME_PX    = SPR_W;                  // 80px — one frame in displayed sheet

/* ── Lounge layout ─────────────────────────────────────────────────────── */
const STAGE_H       = 510;
const STAGE_CAP     = 12;     // visible at once
const ROTATE_MS     = 18000;  // swap 2 every 18 s
const WALK_FRAME_MS = 160;    // 4 frames → 640 ms/cycle
const STAND_FRAME   = 4;      // sheet column for stand pose
const SIT_FRAME     = 5;      // sheet column for sit pose

/* ── Physics ────────────────────────────────────────────────────────────── */
const BASE_SPEED  = 0.9;
const TALK_DIST   = SPR_W * 2.0;
const TALK_MS     = 6200;
const CONV_COOL   = 4500;
const MAX_TALKS   = 3;
const IDLE_CHANCE = 0.00035;
const IDLE_MIN    = 900;
const IDLE_MAX    = 2600;

/* ── Misc ────────────────────────────────────────────────────────────────── */
const PASSCODE        = "4356";
const LS_KEY          = "nl_unlocked_v3";
const BATCH_SZ        = 5;
const MAX_FETCH       = 400;
const CHAT_MAX        = 45;
const REGISTRY_PAGE   = 60; // faces shown per "page" in registry

/* ── Types ───────────────────────────────────────────────────────────────── */
interface AgentItem { agentId: string; tokenId: string; name: string; type: string }
interface AgentInfo {
  tokenId: string; name: string; type: string;
  tagline?: string; greeting?: string;
  personalityTraits?: string[]; quirks?: string[];
  communicationStyle?: string;
  canvas?: { level: number; actionPoints: number };
}
interface Normie  { tokenId: number; name: string; type: string; info?: AgentInfo }
interface Body {
  fx: number; fy: number; vx: number; vy: number;
  facing: 1 | -1;
  walkFrame: number; walkTimer: number;
  state: "walk" | "talk" | "idle";
  stateUntil: number;
  partnerId: number | null;
}
interface Bubble   { id: string; tokenId: number; name: string; text: string; x: number; y: number }
interface ChatEntry { id: string; aName: string; aType: string; bName: string; bType: string; text: string; ts: number }

/* ── Type speed multipliers & colors ────────────────────────────────────── */
const TYPE_SPEED: Record<string, number> = { Agent: 0.75, Alien: 0.6, Cat: 1.55, Human: 1.0 };
const TYPE_COLOR: Record<string, string> = {
  Agent: "#8b5cf6", Alien: "#10b981", Cat: "#f97316", Human: "",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function rv(type?: string): number {
  const m = TYPE_SPEED[type ?? "Human"] ?? 1;
  const s = (0.3 + Math.random() * 0.9) * BASE_SPEED * m;
  return Math.random() < 0.5 ? s : -s;
}
function pickText(info?: AgentInfo): string {
  if (!info) return "…";
  const p: string[] = [];
  if (info.greeting)           p.push(info.greeting);
  if (info.tagline)            p.push(info.tagline);
  if (info.communicationStyle) p.push(info.communicationStyle);
  info.personalityTraits?.slice(0, 3).forEach(t => p.push(t));
  info.quirks?.slice(0, 2).forEach(t => p.push(t));
  return p.length ? p[Math.floor(Math.random() * p.length)] : "…";
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10)  return "just now";
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function mkBody(cw: number, type?: string, edge?: boolean): Body {
  const minFx = ANC_X + 10, maxFx = cw  - (SPR_W - ANC_X) - 10;
  const minFy = ANC_Y + 10, maxFy = STAGE_H - FOOT_BELOW - 20;
  const m = TYPE_SPEED[type ?? "Human"] ?? 1;
  const speed = (0.4 + Math.random() * 0.7) * BASE_SPEED * m;
  const fy = minFy + Math.random() * Math.max(0, maxFy - minFy);

  if (edge) {
    // spawn at left or right edge, walk inward
    const left = Math.random() < 0.5;
    return {
      fx: left ? minFx : maxFx, fy,
      vx: left ? speed : -speed, vy: (Math.random() - 0.5) * 0.3,
      facing: left ? 1 : -1,
      walkFrame: 0, walkTimer: 0,
      state: "walk", stateUntil: 0, partnerId: null,
    };
  }
  return {
    fx: minFx + Math.random() * Math.max(0, maxFx - minFx), fy,
    vx: rv(type), vy: rv(type) * 0.32,
    facing: Math.random() < 0.5 ? 1 : -1,
    walkFrame: Math.floor(Math.random() * 4), walkTimer: 0,
    state: "walk", stateUntil: 0, partnerId: null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCK SCREEN
══════════════════════════════════════════════════════════════════════════ */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits,  setDigits]  = useState<string[]>([]);
  const [shake,   setShake]   = useState(false);
  const [success, setSuccess] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => { hiddenRef.current?.focus(); }, []);

  const push = useCallback((d: string) => {
    if (shake || success) return;
    setDigits(prev => {
      if (prev.length >= 4) return prev;
      const next = [...prev, d];
      if (next.length === 4) {
        if (next.join("") === PASSCODE) {
          setSuccess(true);
          setTimeout(onUnlock, 450);
        } else {
          setShake(true);
          setTimeout(() => { setShake(false); setDigits([]); }, 600);
        }
      }
      return next;
    });
  }, [shake, success, onUnlock]);

  const pop = useCallback(() => {
    if (!shake && !success) setDigits(p => p.slice(0, -1));
  }, [shake, success]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-8 select-none"
      onClick={() => hiddenRef.current?.focus()}
    >
      <input ref={hiddenRef} className="sr-only" readOnly value=""
        onKeyDown={e => { if (/^\d$/.test(e.key)) push(e.key); else if (e.key === "Backspace") pop(); }} />

      <motion.div className="flex flex-col items-center gap-2"
        animate={success ? { scale: [1, 1.15, 1] } : {}}>
        <Lock className={`w-7 h-7 transition-colors ${success ? "text-cyan-500" : "text-n-muted"}`} />
        <p className="text-[10px] font-mono text-n-faint uppercase tracking-widest">archive lounge</p>
      </motion.div>

      <motion.div className="flex gap-2.5"
        animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ width: 44, height: 52 }}
            className={`border rounded flex items-center justify-center transition-all text-lg font-mono ${
              success ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
              : shake ? "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-500"
              : i < digits.length ? "border-n-text bg-n-surface text-n-text"
              : i === digits.length ? "border-n-muted bg-n-surface text-n-text"
              : "border-n-border bg-n-bg text-n-faint"
            }`}
          >
            {i < digits.length ? "●" : i === digits.length ? <span className="animate-blink">_</span> : ""}
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-2">
        {["1","2","3","4","5","6","7","8","9","←","0",""].map((k, i) => (
          <button key={i} onClick={() => k === "←" ? pop() : k ? push(k) : undefined}
            disabled={!k || shake}
            className={`w-12 h-12 font-mono text-sm border rounded transition-colors ${
              k ? "border-n-border text-n-muted hover:border-n-text hover:text-n-text hover:bg-n-surface"
                : "invisible"}`}
          >{k}</button>
        ))}
      </div>
      <p className="text-[10px] font-mono text-n-faint">enter passcode</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LOUNGE ROOM
══════════════════════════════════════════════════════════════════════════ */
function LoungeRoom() {
  /* ── React state (causes re-renders) ── */
  const [allAgents,    setAllAgents]    = useState<AgentItem[]>([]);
  const [infoMap,      setInfoMap]      = useState<Map<number, AgentInfo>>(new Map());
  const [loungeIds,    setLoungeIds]    = useState<number[]>([]);
  const [bubbles,      setBubbles]      = useState<Bubble[]>([]);
  const [chatLog,      setChatLog]      = useState<ChatEntry[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [dark,         setDark]         = useState(false);
  const [regPage,      setRegPage]      = useState(1);
  const [infoProgress, setInfoProgress] = useState(0);

  /* ── Refs — mutated in rAF, never trigger renders ── */
  const stageRef     = useRef<HTMLDivElement>(null);
  const bgCanvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const prevNow      = useRef(0);
  const darkRef      = useRef(false);
  const loungeRef    = useRef<number[]>([]);     // mirror of loungeIds for rAF
  const allRef       = useRef<AgentItem[]>([]);  // mirror of allAgents
  const infoRef      = useRef<Map<number, AgentInfo>>(new Map());
  const bodies       = useRef<Map<number, Body>>(new Map());
  const spriteRefs   = useRef<Map<number, HTMLDivElement>>(new Map());
  const nameRefs     = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastConv     = useRef(-CONV_COOL);
  const lastCheck    = useRef(0);
  const convCount    = useRef(0);
  const walkFrames   = useRef<Map<number, number>>(new Map());

  /* keep refs in sync */
  useEffect(() => { loungeRef.current = loungeIds; }, [loungeIds]);
  useEffect(() => { allRef.current    = allAgents;  }, [allAgents]);
  useEffect(() => { darkRef.current   = dark;        }, [dark]);
  useEffect(() => { infoRef.current   = infoMap;     }, [infoMap]);

  /* ── Dark mode observer ─────────────────────────────────────────────── */
  useEffect(() => {
    const chk = () => { const d = document.documentElement.classList.contains("dark"); setDark(d); darkRef.current = d; };
    chk();
    const mo = new MutationObserver(chk);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* ── Bring a normie onto the stage ─────────────────────────────────── */
  const bringToStage = useCallback((tokenId: number, type?: string, fromEdge = true) => {
    setLoungeIds(prev => {
      if (prev.includes(tokenId)) return prev;
      const cw = stageRef.current?.clientWidth ?? 960;
      bodies.current.set(tokenId, mkBody(cw, type, fromEdge));
      walkFrames.current.set(tokenId, 0);
      if (prev.length < STAGE_CAP) return [...prev, tokenId];
      const removable = prev.filter(id => bodies.current.get(id)?.state !== "talk");
      if (!removable.length) return prev;
      const rm = removable[Math.floor(Math.random() * removable.length)];
      return [...prev.filter(id => id !== rm), tokenId];
    });
  }, []);

  /* ── Data fetch ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        /* total count */
        const cntData = await fetch(`${AGENTS_API}/agents/count`).then(r => r.json()).catch(() => null);
        if (!cancelled && cntData) setTotal(cntData.count ?? 0);

        /* paginate all agents */
        let cursor: string | null = null, hasMore = true;
        const collected: AgentItem[] = [];
        while (hasMore && collected.length < MAX_FETCH) {
          const url = new URL(`${AGENTS_API}/agents/list`);
          url.searchParams.set("limit", "100");
          url.searchParams.set("sort", "newest");
          if (cursor) url.searchParams.set("cursor", cursor);
          const d = await fetch(url.toString()).then(r => r.json()).catch(() => ({ items: [], hasMore: false }));
          const items: AgentItem[] = d.items ?? [];
          hasMore = d.hasMore ?? false;
          if (!items.length) break;
          cursor = items[items.length - 1].agentId;
          items.slice(0, MAX_FETCH - collected.length).forEach(it => collected.push(it));
        }
        if (cancelled) return;

        setAllAgents(collected);
        setLoading(false);

        /* seed initial stage */
        const seed = [...collected].sort(() => Math.random() - 0.5).slice(0, STAGE_CAP);
        const cw = stageRef.current?.clientWidth ?? 960;
        seed.forEach(a => {
          const tid = Number(a.tokenId);
          bodies.current.set(tid, mkBody(cw, a.type, false));
          walkFrames.current.set(tid, Math.floor(Math.random() * 4));
        });
        setLoungeIds(seed.map(a => Number(a.tokenId)));

        /* load personas in batches */
        for (let i = 0; i < collected.length; i += BATCH_SZ) {
          if (cancelled) break;
          const batch = collected.slice(i, i + BATCH_SZ);
          const infos = await Promise.all(batch.map(async item => {
            try {
              const r = await fetch(`${AGENTS_API}/agents/info/${item.tokenId}`);
              return r.ok ? (await r.json() as AgentInfo) : null;
            } catch { return null; }
          }));
          if (cancelled) break;
          setInfoMap(prev => {
            const next = new Map(prev);
            infos.forEach((info, j) => { if (info) next.set(Number(batch[j].tokenId), info); });
            return next;
          });
          setInfoProgress(Math.min(i + BATCH_SZ, collected.length));
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (e) {
        console.error("[Lounge]", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Rotation timer ─────────────────────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => {
      const all = allRef.current;
      if (!all.length) return;
      setLoungeIds(prev => {
        const cw = stageRef.current?.clientWidth ?? 960;
        const removable = prev.filter(id => bodies.current.get(id)?.state !== "talk");
        const numSwap = Math.min(2, removable.length);
        if (!numSwap) return prev;
        const toRemove = [...removable].sort(() => Math.random() - 0.5).slice(0, numSwap);
        const next = prev.filter(id => !toRemove.includes(id));
        const pool = all.filter(a => !next.includes(Number(a.tokenId)));
        for (let i = 0; i < numSwap && i < pool.length; i++) {
          const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 40))];
          const tid = Number(pick.tokenId);
          if (!next.includes(tid)) {
            bodies.current.set(tid, mkBody(cw, pick.type, true));
            walkFrames.current.set(tid, 0);
            next.push(tid);
          }
        }
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  /* ── Walk frame ticker (updates DOM directly — no React re-render) ───── */
  useEffect(() => {
    const t = setInterval(() => {
      for (const id of loungeRef.current) {
        const b    = bodies.current.get(id);
        const el   = spriteRefs.current.get(id);
        if (!el || !b) continue;
        if (b.state === "walk") {
          const next = ((walkFrames.current.get(id) ?? 0) + 1) % 4;
          walkFrames.current.set(id, next);
          el.style.backgroundPositionX = `${-next * FRAME_PX}px`;
        } else {
          const frame = b.state === "idle" ? SIT_FRAME : STAND_FRAME;
          el.style.backgroundPositionX = `${-frame * FRAME_PX}px`;
        }
      }
    }, WALK_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  /* ── Main rAF — physics + position DOM updates + bg canvas ──────────── */
  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(now - prevNow.current, 50);
      prevNow.current = now;

      const stage  = stageRef.current;
      const canvas = bgCanvasRef.current;
      const cw     = stage?.clientWidth ?? 960;
      const isDark = darkRef.current;
      const ids    = loungeRef.current;
      const bods   = bodies.current;

      const minFx = ANC_X + 10, maxFx = cw  - (SPR_W - ANC_X) - 10;
      const minFy = ANC_Y + 10, maxFy = STAGE_H - FOOT_BELOW - 20;

      /* ── Physics ── */
      for (const id of ids) {
        if (!bods.has(id)) bods.set(id, mkBody(cw, undefined, false));
        const b = bods.get(id)!;

        if (b.state === "talk" || b.state === "idle") {
          if (now > b.stateUntil) {
            const wasTalk = b.state === "talk";
            b.state = "walk"; b.partnerId = null;
            b.vx = rv(); b.vy = rv() * 0.32;
            if (wasTalk) convCount.current = Math.max(0, convCount.current - 1);
          }
          continue;
        }

        if (Math.random() < IDLE_CHANCE * (dt / 16)) {
          b.state = "idle";
          b.stateUntil = now + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
          continue;
        }

        const step = dt / 16;
        b.fx += b.vx * step;
        b.fy += b.vy * step;
        if (b.fx < minFx) { b.fx = minFx; b.vx =  Math.abs(b.vx); }
        if (b.fx > maxFx) { b.fx = maxFx; b.vx = -Math.abs(b.vx); }
        if (b.fy < minFy) { b.fy = minFy; b.vy =  Math.abs(b.vy); }
        if (b.fy > maxFy) { b.fy = maxFy; b.vy = -Math.abs(b.vy); }
        if (Math.abs(b.vx) > 0.06) b.facing = b.vx > 0 ? 1 : -1;
      }

      /* ── Conversation scan (10×/s) ── */
      if (now - lastCheck.current > 100) {
        lastCheck.current = now;
        if (convCount.current < MAX_TALKS && now - lastConv.current > CONV_COOL) {
          const norms = ids.map(id => ({ id, b: bods.get(id) })).filter(x => x.b?.state === "walk");
          outer: for (let i = 0; i < norms.length; i++) {
            for (let j = i + 1; j < norms.length; j++) {
              const { id: idA, b: bA } = norms[i];
              const { id: idB, b: bB } = norms[j];
              if (!bA || !bB) continue;
              const d = Math.hypot(bA.fx - bB.fx, bA.fy - bB.fy);
              if (d < TALK_DIST) {
                const end = now + TALK_MS;
                bA.state = "talk"; bA.stateUntil = end; bA.partnerId = idB;
                bB.state = "talk"; bB.stateUntil = end; bB.partnerId = idA;
                bA.facing = bA.fx < bB.fx ? 1 : -1;
                bB.facing = bB.fx < bA.fx ? 1 : -1;
                lastConv.current = now; convCount.current++;

                const infoA = infoRef.current.get(idA);
                const infoB = infoRef.current.get(idB);
                const textA = pickText(infoA);
                const textB = pickText(infoB);
                const uid   = String(now | 0);
                const bblA: Bubble = { id: `${idA}-${uid}`, tokenId: idA, name: infoA?.name ?? `#${idA}`, text: textA, x: bA.fx, y: bA.fy - ANC_Y };
                const bblB: Bubble = { id: `${idB}-${uid}`, tokenId: idB, name: infoB?.name ?? `#${idB}`, text: textB, x: bB.fx, y: bB.fy - ANC_Y };
                setBubbles(p => [...p.filter(b => b.tokenId !== idA && b.tokenId !== idB), bblA, bblB]);
                const chat: ChatEntry = {
                  id: uid, ts: Date.now(),
                  aName: infoA?.name ?? `#${idA}`, aType: infoA?.type ?? "",
                  bName: infoB?.name ?? `#${idB}`, bType: infoB?.type ?? "",
                  text: textA,
                };
                setChatLog(p => [chat, ...p].slice(0, CHAT_MAX));
                const [aId, bId] = [bblA.id, bblB.id];
                setTimeout(() => setBubbles(p => p.filter(b => b.id !== aId && b.id !== bId)), TALK_MS + 500);
                break outer;
              }
            }
          }
        }
      }

      /* ── Update sprite DOM positions (no React re-render) ── */
      for (const id of ids) {
        const b   = bods.get(id);
        const sel = spriteRefs.current.get(id);
        const nel = nameRefs.current.get(id);
        if (!b) continue;
        const lx = Math.round(b.fx - ANC_X);
        const ly = Math.round(b.fy - ANC_Y);
        if (sel) {
          sel.style.left      = `${lx}px`;
          sel.style.top       = `${ly}px`;
          sel.style.transform = b.facing === -1 ? "scaleX(-1)" : "";
          sel.style.filter    = isDark ? "invert(1)" : "none";
          sel.style.zIndex    = String(Math.round(b.fy));
        }
        if (nel) {
          nel.style.left = `${lx}px`;
          nel.style.top  = `${ly + SPR_H + 2}px`;
          nel.style.zIndex = String(Math.round(b.fy));
        }
      }

      /* ── Background canvas (dot grid + floor + conversation lines) ── */
      if (canvas && stage) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width  = cw;
          canvas.height = STAGE_H;
          ctx.clearRect(0, 0, cw, STAGE_H);

          /* dot grid */
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
          for (let gx = 20; gx < cw;      gx += 20)
          for (let gy = 20; gy < STAGE_H; gy += 20)
            ctx.fillRect(gx - 0.5, gy - 0.5, 1.5, 1.5);

          /* floor glow */
          const flY = STAGE_H - 8;
          const flG = ctx.createLinearGradient(0, flY - 40, 0, STAGE_H);
          flG.addColorStop(0, isDark ? "rgba(6,182,212,0)" : "rgba(72,73,75,0)");
          flG.addColorStop(1, isDark ? "rgba(6,182,212,0.12)" : "rgba(72,73,75,0.07)");
          ctx.fillStyle = flG;
          ctx.fillRect(0, flY - 40, cw, STAGE_H - (flY - 40));
          ctx.fillStyle = isDark ? "rgba(6,182,212,0.4)" : "rgba(72,73,75,0.14)";
          ctx.fillRect(0, flY, cw, 1);

          /* conversation link lines */
          ctx.setLineDash([3, 7]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = isDark ? "rgba(6,182,212,0.22)" : "rgba(72,73,75,0.13)";
          for (const id of ids) {
            const b = bods.get(id);
            if (b?.state !== "talk" || !b.partnerId || b.partnerId < id) continue;
            const pb = bods.get(b.partnerId);
            if (!pb) continue;
            ctx.beginPath();
            ctx.moveTo(b.fx,  b.fy  - ANC_Y * 0.3);
            ctx.lineTo(pb.fx, pb.fy - ANC_Y * 0.3);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    prevNow.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // intentionally empty — everything via refs

  /* ── Derive which normies are in lounge ──────────────────────────────── */
  const loungeNormies = loungeIds.map(id => {
    const a = allAgents.find(x => Number(x.tokenId) === id);
    return { tokenId: id, name: a?.name ?? `#${id}`, type: a?.type ?? "Human", info: infoMap.get(id) };
  }).filter(Boolean) as Normie[];

  /* ── Registry: paginate allAgents ───────────────────────────────────── */
  const regTotal    = allAgents.length;
  const regShown    = Math.min(regPage * REGISTRY_PAGE, regTotal);
  const regAgents   = allAgents.slice(0, regShown);

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-5">

      {/* CSS walk-frame keyframes for the sprite sheet animation */}
      <style>{`
        .normie-sprite {
          position: absolute;
          width: ${SPR_W}px;
          height: ${SPR_H}px;
          background-size: ${SHEET_CSS_W}px ${SPR_H}px;
          background-repeat: no-repeat;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Bot className="w-4 h-4 text-cyan-500" />
        <h1 className="font-mono text-xl font-medium text-n-text">archive lounge</h1>
        {total > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-px border border-cyan-400/40 rounded text-cyan-600 dark:text-cyan-400">
            {total} agents
          </span>
        )}
        <span className="text-[10px] font-mono text-n-faint ml-auto">
          {loading
            ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> loading agents…</span>
            : <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-cyan-500" />{loungeIds.length} on stage · rotating every {ROTATE_MS/1000}s</span>
          }
        </span>
      </div>

      {/* ── Main row: stage + chat feed ── */}
      <div className="flex gap-3 items-start">

        {/* Stage */}
        <div
          ref={stageRef}
          className="relative flex-1 border border-n-border rounded overflow-hidden bg-n-bg"
          style={{ height: STAGE_H }}
        >
          {/* background canvas */}
          <canvas ref={bgCanvasRef} className="absolute inset-0 pointer-events-none" />

          {/* Sprites — DOM elements, positions set via ref in rAF */}
          {loungeNormies.map(n => (
            <div
              key={`sprite-${n.tokenId}`}
              ref={el => { if (el) spriteRefs.current.set(n.tokenId, el); else spriteRefs.current.delete(n.tokenId); }}
              className="normie-sprite cursor-pointer"
              style={{
                backgroundImage: `url(${SPRITES_API}/normies/${n.tokenId}/sheet.png)`,
                /* backgroundPositionX is updated via ref in the walk timer */
              }}
              title={n.info?.tagline ?? n.name}
            />
          ))}

          {/* Name tags — separate elements so facing-flip doesn't mirror text */}
          {loungeNormies.map(n => {
            const typeCol = TYPE_COLOR[n.type] || "";
            const info    = n.info;
            return (
              <div
                key={`name-${n.tokenId}`}
                ref={el => { if (el) nameRefs.current.set(n.tokenId, el); else nameRefs.current.delete(n.tokenId); }}
                className="absolute pointer-events-none text-center"
                style={{ width: SPR_W }}
              >
                <div
                  className="text-[7px] font-mono font-medium leading-tight"
                  style={{ color: typeCol || "rgba(72,73,75,0.55)" }}
                >
                  {trunc(n.name, 14)}
                </div>
                {info?.canvas && (
                  <div className="text-[6px] font-mono" style={{ color: "rgba(72,73,75,0.35)" }}>
                    lv{info.canvas.level} · {info.canvas.actionPoints}ap
                  </div>
                )}
              </div>
            );
          })}

          {/* Speech bubbles */}
          <AnimatePresence>
            {bubbles.map(b => {
              const cw  = stageRef.current?.clientWidth ?? 900;
              const bW  = 160;
              const left = Math.max(6, Math.min(b.x - bW / 2, cw - bW - 6));
              const top  = Math.max(6, b.y - 78);
              return (
                <motion.div key={b.id}
                  initial={{ opacity: 0, y: 8, scale: 0.88 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit   ={{ opacity: 0, y: -5, scale: 0.93 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute pointer-events-none"
                  style={{ left, top, width: bW, zIndex: 9999 }}
                >
                  <div className="bg-n-white border border-n-border rounded shadow-sm px-2.5 py-2 relative">
                    <div className="text-[7px] font-mono font-bold text-cyan-600 dark:text-cyan-400 mb-1 uppercase tracking-widest leading-none">
                      {trunc(b.name, 14)}
                    </div>
                    <p className="text-[8.5px] font-mono text-n-text leading-relaxed break-words">
                      {trunc(b.text, 100)}
                    </p>
                    <div className="absolute w-2.5 h-2.5 rotate-45 bg-n-white border-r border-b border-n-border" style={{ bottom: -6, left: 12 }} />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Loading overlay */}
          {loading && !loungeIds.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div key={i} className="w-8 h-12 border border-n-border rounded bg-n-surface"
                    animate={{ opacity: [0.2, 0.7, 0.2] }}
                    transition={{ duration: 1.4, delay: i * 0.1, repeat: Infinity }} />
                ))}
              </div>
              <p className="text-xs font-mono text-n-muted">summoning agentic normies…</p>
            </div>
          )}
        </div>

        {/* Chat feed sidebar */}
        <div className="w-56 flex-shrink-0 border border-n-border rounded bg-n-bg overflow-hidden flex flex-col" style={{ height: STAGE_H }}>
          <div className="px-3 py-2 border-b border-n-border flex items-center gap-1.5 flex-shrink-0">
            <MessageSquare className="w-3 h-3 text-n-muted" />
            <span className="text-[10px] font-mono text-n-muted uppercase tracking-wider">live conversations</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-n-border">
            {chatLog.length === 0 && !loading && (
              <p className="text-[9px] font-mono text-n-faint p-3">waiting for conversations…</p>
            )}
            {chatLog.map(entry => (
              <div key={entry.id} className="px-3 py-2 space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[8px] font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase leading-none">
                    {trunc(entry.aName, 10)}
                  </span>
                  <span className="text-[7px] font-mono text-n-faint">→</span>
                  <span className="text-[8px] font-mono font-bold text-n-muted uppercase leading-none">
                    {trunc(entry.bName, 10)}
                  </span>
                </div>
                <p className="text-[8px] font-mono text-n-muted leading-snug italic">
                  &ldquo;{trunc(entry.text, 80)}&rdquo;
                </p>
                <div className="text-[7px] font-mono text-n-faint">{timeAgo(entry.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 text-[9px] font-mono text-n-faint flex-wrap">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> alien — slow</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" /> agent — methodical</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" /> cat — erratic</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-n-muted inline-block" /> human — normal</span>
        <span className="ml-auto">sprites · <a href="https://fullnormies.vercel.app" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-n-muted">fullnormies.vercel.app</a> · personas · <a href="https://api.normies.art" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-n-muted">api.normies.art</a> · erc-8004</span>
      </div>

      {/* ── Agent Registry ── */}
      {allAgents.length > 0 && (
        <section className="space-y-3 border-t border-n-border pt-6">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-n-muted" />
            <h2 className="text-xs font-mono text-n-muted uppercase tracking-wider">
              agent registry
            </h2>
            <span className="text-[10px] font-mono text-n-faint">
              {regShown} of {regTotal} shown
              {infoProgress < regTotal && ` · loading personas ${infoProgress}/${regTotal}`}
            </span>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1.5">
            {regAgents.map(a => {
              const tid     = Number(a.tokenId);
              const onStage = loungeIds.includes(tid);
              const info    = infoMap.get(tid);
              return (
                <button
                  key={tid}
                  onClick={() => bringToStage(tid, a.type, true)}
                  title={`${info?.name ?? a.name}${info?.tagline ? ` · "${info.tagline}"` : ""}${onStage ? " (on stage)" : ""}`}
                  className={`relative flex flex-col items-center gap-0.5 p-1 rounded border transition-colors ${
                    onStage
                      ? "border-cyan-400/60 bg-cyan-50/50 dark:bg-cyan-900/20"
                      : "border-n-border hover:border-n-muted hover:bg-n-surface"
                  }`}
                >
                  {/* face SVG */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${AGENTS_API}/normie/${tid}/image.svg`}
                    alt={a.name}
                    loading="lazy"
                    width={32} height={32}
                    className="pixelated w-8 h-8 object-contain"
                    style={{ filter: dark ? "invert(1)" : "none" }}
                  />
                  <span className="text-[6px] font-mono text-n-faint leading-tight text-center truncate w-full">
                    {trunc(info?.name ?? a.name, 9)}
                  </span>
                  {/* type dot */}
                  {a.type !== "Human" && (
                    <span
                      className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                      style={{ background: TYPE_COLOR[a.type] || "" }}
                    />
                  )}
                  {/* on-stage indicator */}
                  {onStage && (
                    <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Load more */}
          {regShown < regTotal && (
            <button
              onClick={() => setRegPage(p => p + 1)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-n-muted hover:text-n-text border border-n-border rounded px-3 py-1.5 transition-colors mx-auto"
            >
              show more <span className="text-n-faint">({regTotal - regShown} remaining)</span>
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT — passcode gate
══════════════════════════════════════════════════════════════════════════ */
export default function ArchiveLoungeClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked,  setChecked]  = useState(false);

  useEffect(() => {
    setUnlocked(localStorage.getItem(LS_KEY) === "1");
    setChecked(true);
  }, []);

  const unlock = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    setUnlocked(true);
  }, []);

  if (!checked) return null;
  if (!unlocked) return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <LockScreen onUnlock={unlock} />
    </div>
  );
  return <LoungeRoom />;
}
