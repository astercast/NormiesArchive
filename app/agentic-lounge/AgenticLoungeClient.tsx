"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2, Bot, Lock, MessageSquare, Users, ChevronDown, ChevronUp, Search,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import type { AgentInfo } from "@/components/AgentSection";

const AGENTS_API  = "https://api.normies.art";
const SPRITES_API = "https://fullnormies.vercel.app/api/v1";

/* Sprite sheet: 7×40×80 native @ SCALE=2 */
const SCALE       = 2;
const SPR_W       = 40 * SCALE;
const SPR_H       = 80 * SCALE;
const ANC_X       = 20 * SCALE;
const ANC_Y       = 60 * SCALE;
const FOOT_BELOW  = SPR_H - ANC_Y;
const SHEET_CSS_W = 7 * SPR_W;
const FRAME_PX    = SPR_W;
const STAND_FRAME = 4;
const SIT_FRAME   = 5;

const WALK_FRAME_MS = 160;
const BASE_SPEED    = 0.88;
const TALK_DIST     = SPR_W * 2.1;
const TALK_MS       = 6800;
const CONV_COOL     = 4800;
const MAX_TALKS     = 3;
const ROTATE_MS     = 20000;
const BATCH_SZ      = 5;
const MAX_FETCH     = 500;
const CHAT_MAX      = 50;
const REG_PAGE_SIZE = 48;
const SOLO_COOL_MS  = 14000;
const PASSCODE      = "4356";
const LS_KEY        = "nl_unlocked_v3";

interface AgentItem {
  agentId: string;
  tokenId: string;
  name: string;
  type: string;
}

interface Normie {
  tokenId: number;
  name: string;
  type: string;
  info?: AgentInfo;
}

interface Body {
  fx: number;
  fy: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  walkFrame: number;
  state: "walk" | "talk" | "idle";
  stateUntil: number;
  partnerId: number | null;
}

interface Bubble {
  id: string;
  tokenId: number;
  name: string;
  text: string;
  x: number;
  y: number;
  solo: boolean;
}

interface ChatEntry {
  id: string;
  ts: number;
  aName: string;
  bName: string;
  textA: string;
  textB: string;
}

/* ── Personality helpers (deterministic from published API text only) ───── */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function personaSeed(info?: AgentInfo): string {
  if (!info) return "";
  return [
    info.communicationStyle ?? "",
    ...(info.personalityTraits ?? []),
    ...(info.quirks ?? []),
  ].join("\u0001");
}

/** Walk speed multiplier derived only from persona strings */
function paceMult(info?: AgentInfo): number {
  const s = personaSeed(info);
  if (!s) return 1;
  const x = stableHash(s);
  return 0.52 + (x % 1100) / 1000;
}

/** Idle likelihood scales slightly with how much text the agent published */
function idleLean(info?: AgentInfo): number {
  const traits = info?.personalityTraits?.length ?? 0;
  const quirks = info?.quirks?.length ?? 0;
  const extra  = (info?.communicationStyle?.length ?? 0) > 80 ? 1 : 0;
  const n      = Math.min(traits + quirks + extra, 14);
  return 0.85 + n * 0.05;
}

function collectVoiceLines(info?: AgentInfo): string[] {
  if (!info) return [];
  const out: string[] = [];
  const push = (t?: string) => {
    const x = t?.trim();
    if (x) out.push(x);
  };
  push(info.greeting);
  push(info.tagline);
  push(info.communicationStyle);
  info.personalityTraits?.forEach(t => push(t));
  info.quirks?.forEach(t => push(t));
  if (info.backstory?.trim())
    out.push(trunc(info.backstory.trim(), 200));
  return out;
}

function pickPairLines(a?: AgentInfo, b?: AgentInfo, salt = 0): { la: string; lb: string } {
  const va = collectVoiceLines(a);
  const vb = collectVoiceLines(b);
  if (!va.length && !vb.length) return { la: "…", lb: "…" };
  const ha = stableHash(`${salt}|${a?.tokenId ?? ""}|pair`);
  const hb = stableHash(`${salt}|${b?.tokenId ?? ""}|pair`);
  const la = va.length ? va[ha % va.length] : "…";
  const lb = vb.length ? vb[hb % vb.length] : "…";
  return { la, lb };
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function computeStageCap(innerWidth: number): number {
  if (innerWidth < 420) return 4;
  if (innerWidth < 640) return 6;
  if (innerWidth < 900) return 8;
  if (innerWidth < 1200) return 10;
  return 12;
}

function mkBody(
  cw: number,
  sh: number,
  info: AgentInfo | undefined,
  edge?: boolean
): Body {
  const minFx = ANC_X + 8;
  const maxFx = cw - (SPR_W - ANC_X) - 8;
  const minFy = ANC_Y + 8;
  const maxFy = sh - FOOT_BELOW - 16;
  const p     = paceMult(info);
  const speed = (0.32 + Math.random() * 0.92) * BASE_SPEED * p;

  const rv = () => (Math.random() < 0.5 ? speed : -speed);
  const fy = minFy + Math.random() * Math.max(1, maxFy - minFy);

  if (edge) {
    const left = Math.random() < 0.5;
    return {
      fx: left ? minFx : maxFx,
      fy,
      vx: left ? Math.abs(speed) : -Math.abs(speed),
      vy: (Math.random() - 0.5) * 0.28 * p,
      facing: left ? 1 : -1,
      walkFrame: 0,
      state: "walk",
      stateUntil: 0,
      partnerId: null,
    };
  }
  return {
    fx: minFx + Math.random() * Math.max(1, maxFx - minFx),
    fy,
    vx: rv(),
    vy: rv() * 0.3,
    facing: Math.random() < 0.5 ? 1 : -1,
    walkFrame: Math.floor(Math.random() * 4),
    state: "walk",
    stateUntil: 0,
    partnerId: null,
  };
}

function rvPostTalk(info?: AgentInfo): { vx: number; vy: number } {
  const p    = paceMult(info);
  const s    = (0.35 + Math.random() * 0.85) * BASE_SPEED * p;
  const vx   = Math.random() < 0.5 ? s : -s;
  const vy   = (Math.random() - 0.5) * 0.32 * p;
  return { vx, vy };
}

/* ── Lock ─────────────────────────────────────────────────────────────── */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hiddenRef.current?.focus();
  }, []);

  const push = useCallback(
    (d: string) => {
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
            setTimeout(() => {
              setShake(false);
              setDigits([]);
            }, 600);
          }
        }
        return next;
      });
    },
    [shake, success, onUnlock]
  );

  const pop = useCallback(() => {
    if (!shake && !success) setDigits(p => p.slice(0, -1));
  }, [shake, success]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[60vh] gap-6 sm:gap-8 select-none px-4"
      onClick={() => hiddenRef.current?.focus()}
    >
      <input
        ref={hiddenRef}
        className="sr-only"
        readOnly
        value=""
        onKeyDown={e => {
          if (/^\d$/.test(e.key)) push(e.key);
          else if (e.key === "Backspace") pop();
        }}
      />

      <motion.div
        className="flex flex-col items-center gap-1.5 text-center"
        animate={success ? { scale: [1, 1.08, 1] } : {}}
      >
        <Lock
          className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
            success ? "text-cyan-500" : "text-n-muted"
          }`}
        />
        <p className="text-[11px] sm:text-xs font-mono text-n-faint uppercase tracking-[0.25em]">
          agentic lounge
        </p>
        <p className="text-[10px] font-mono text-n-faint max-w-xs">
          ERC-8004 personas only — passcode for early access
        </p>
      </motion.div>

      <motion.div
        className="flex gap-2 sm:gap-2.5"
        animate={shake ? { x: [-8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.38 }}
      >
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{ width: 40, height: 48 }}
            className={`sm:w-11 sm:h-[52px] border rounded-md flex items-center justify-center transition-all text-base sm:text-lg font-mono ${
              success
                ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
                : shake
                  ? "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-500"
                  : i < digits.length
                    ? "border-n-text bg-n-surface text-n-text"
                    : i === digits.length
                      ? "border-n-muted bg-n-surface text-n-text"
                      : "border-n-border bg-n-bg text-n-faint"
            }`}
          >
            {i < digits.length ? "●" : i === digits.length ? <span className="animate-pulse">_</span> : ""}
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full max-w-[220px] sm:max-w-none mx-auto">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", ""].map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => (k === "←" ? pop() : k ? push(k) : undefined)}
            disabled={!k || shake}
            className={`min-h-[44px] sm:min-h-0 sm:h-12 font-mono text-sm border rounded-md transition-colors touch-manipulation ${
              k
                ? "border-n-border text-n-muted active:bg-n-surface hover:border-n-text hover:text-n-text"
                : "invisible"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Lounge
═══════════════════════════════════════════════════════════════════════ */
function LoungeRoom() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [infoMap, setInfoMap] = useState<Map<number, AgentInfo>>(new Map());
  const [loungeIds, setLoungeIds] = useState<number[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [secToShuffle, setSecToShuffle] = useState(Math.ceil(ROTATE_MS / 1000));
  const [regPage, setRegPage] = useState(1);
  const [infoProgress, setInfoProgress] = useState(0);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [traitsOpen, setTraitsOpen] = useState(false);

  useEffect(() => {
    setTraitsOpen(false);
  }, [focusId]);

  const stageRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const prevNow = useRef(0);
  const darkRef = useRef(false);
  const agentsRef = useRef<AgentItem[]>([]);
  const loungeRef = useRef<number[]>([]);
  const infoRef = useRef<Map<number, AgentInfo>>(new Map());
  const bodies = useRef<Map<number, Body>>(new Map());
  const spriteRefs = useRef<Map<number, HTMLElement>>(new Map());
  const nameRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stageHRef = useRef(400);
  const capRef = useRef(12);
  const lastConv = useRef(-CONV_COOL);
  const lastCheck = useRef(0);
  const convCount = useRef(0);
  const walkFrames = useRef<Map<number, number>>(new Map());
  const soloLast = useRef<Map<number, number>>(new Map());
  const pairSalt = useRef(0);
  const nextShuffleAt = useRef(Date.now() + ROTATE_MS);

  useEffect(() => {
    loungeRef.current = loungeIds;
  }, [loungeIds]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);
  useEffect(() => {
    infoRef.current = infoMap;
  }, [infoMap]);

  useEffect(() => {
    const chk = () => {
      const d = document.documentElement.classList.contains("dark");
      setDark(d);
      darkRef.current = d;
    };
    chk();
    const mo = new MutationObserver(chk);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* Stage height */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      stageHRef.current = Math.max(240, el.clientHeight);
    });
    ro.observe(el);
    stageHRef.current = Math.max(240, el.clientHeight);
    return () => ro.disconnect();
  }, [loading]);

  /* Responsive stage population cap */
  useEffect(() => {
    const sync = () => {
      const c = computeStageCap(window.innerWidth);
      capRef.current = c;
      setLoungeIds(prev => {
        if (prev.length <= c) return prev;
        const locked = prev.filter(
          id => bodies.current.get(id)?.state === "talk"
        );
        const pool   = prev.filter(
          id => !locked.includes(id)
        );
        const need   = Math.max(0, c - locked.length);
        return [...locked, ...pool.slice(0, need)];
      });
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    for (const id of [...bodies.current.keys()]) {
      if (!loungeIds.includes(id)) bodies.current.delete(id);
    }
  }, [loungeIds]);

  const bringToStage = useCallback(
    (
      tokenId: number,
      opts?: { fromEdge?: boolean; openSheet?: boolean }
    ) => {
      const fromEdge = opts?.fromEdge ?? true;
      const openSheet = opts?.openSheet ?? true;
      if (openSheet) setFocusId(tokenId);
      setLoungeIds(prev => {
        if (prev.includes(tokenId)) return prev;
        const cw = stageRef.current?.clientWidth ?? 360;
        const sh = stageHRef.current;
        const inf = infoRef.current.get(tokenId);
        bodies.current.set(tokenId, mkBody(cw, sh, inf, fromEdge));
        walkFrames.current.set(tokenId, 0);
        const cap = capRef.current;
        if (prev.length < cap) return [...prev, tokenId];
        const removable = prev.filter(
          id => bodies.current.get(id)?.state !== "talk"
        );
        if (!removable.length) return prev;
        const rm = removable[Math.floor(Math.random() * removable.length)];
        return [...prev.filter(id => id !== rm), tokenId];
      });
    },
    []
  );

  /* Fetch list → binding batch → only registered agentic */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let cursor: string | null = null;
        let hasMore = true;
        const raw: AgentItem[] = [];
        while (hasMore && raw.length < MAX_FETCH) {
          const url = new URL(`${AGENTS_API}/agents/list`);
          url.searchParams.set("limit", "100");
          url.searchParams.set("sort", "newest");
          if (cursor) url.searchParams.set("cursor", cursor);
          const d = await fetch(url.toString())
            .then(r => r.json())
            .catch(() => ({ items: [], hasMore: false }));
          const items: AgentItem[] = d.items ?? [];
          hasMore = d.hasMore ?? false;
          if (!items.length) break;
          cursor = items[items.length - 1].agentId;
          items.forEach(it => {
            if (raw.length < MAX_FETCH) raw.push(it);
          });
        }
        if (cancelled) return;

        const tokenIds = raw.map(a => String(a.tokenId));
        let bound = new Set<number>();
        if (tokenIds.length) {
          const br = await fetch(`${AGENTS_API}/agents/binding/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenIds }),
          })
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);
          if (br?.bindings)
            bound = new Set(Object.keys(br.bindings).map(Number));
        }

        const verified = raw.filter(a => bound.has(Number(a.tokenId)));
        if (!cancelled) {
          setAgents(verified);
          setLoading(false);
        }

        nextShuffleAt.current = Date.now() + ROTATE_MS;
        const cap  = capRef.current;
        const sh   = stageHRef.current;
        const cw   = stageRef.current?.clientWidth ?? 360;
        const seed = [...verified].sort(() => Math.random() - 0.5).slice(0, cap);
        seed.forEach(a => {
          const tid = Number(a.tokenId);
          bodies.current.set(tid, mkBody(cw, sh, undefined, false));
          walkFrames.current.set(tid, Math.floor(Math.random() * 4));
        });
        if (!cancelled) setLoungeIds(seed.map(a => Number(a.tokenId)));

        for (let i = 0; i < verified.length; i += BATCH_SZ) {
          if (cancelled) break;
          const batch = verified.slice(i, i + BATCH_SZ);
          const infos = await Promise.all(
            batch.map(async item => {
              try {
                const r = await fetch(`${AGENTS_API}/agents/info/${item.tokenId}`);
                return r.ok ? ((await r.json()) as AgentInfo) : null;
              } catch {
                return null;
              }
            })
          );
          if (cancelled) break;
          setInfoMap(prev => {
            const n = new Map(prev);
            infos.forEach((info, j) => {
              if (info) n.set(Number(batch[j].tokenId), info);
            });
            return n;
          });
          setInfoProgress(Math.min(i + BATCH_SZ, verified.length));
          await new Promise(r => setTimeout(r, 180));
        }
      } catch (e) {
        console.error("[Agentic Lounge]", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      nextShuffleAt.current = Date.now() + ROTATE_MS;
      const pool = agentsRef.current;
      if (!pool.length) return;
      setLoungeIds(prev => {
        const cw = stageRef.current?.clientWidth ?? 360;
        const sh = stageHRef.current;
        const cap = capRef.current;
        const removable = prev.filter(
          id => bodies.current.get(id)?.state !== "talk"
        );
        const nSwap = Math.min(2, removable.length);
        if (!nSwap) return prev;
        const drop = [...removable]
          .sort(() => Math.random() - 0.5)
          .slice(0, nSwap);
        let next = prev.filter(id => !drop.includes(id));
        const avail = pool.filter(a => !next.includes(Number(a.tokenId)));
        for (let k = 0; k < nSwap && avail.length; k++) {
          const pick =
            avail[Math.floor(Math.random() * Math.min(avail.length, 48))];
          const tid = Number(pick.tokenId);
          if (!next.includes(tid) && next.length < cap) {
            bodies.current.set(
              tid,
              mkBody(cw, sh, infoRef.current.get(tid), true)
            );
            walkFrames.current.set(tid, 0);
            next.push(tid);
          }
        }
        return next.slice(0, cap);
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  /* Shuffle countdown for the UI (synced when `nextShuffleAt` resets) */
  useEffect(() => {
    const tick = () => {
      const s = Math.max(
        0,
        Math.ceil((nextShuffleAt.current - Date.now()) / 1000)
      );
      setSecToShuffle(s);
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      for (const id of loungeRef.current) {
        const b = bodies.current.get(id);
        const el = spriteRefs.current.get(id);
        if (!el || !b) continue;
        if (b.state === "walk") {
          const nf = ((walkFrames.current.get(id) ?? 0) + 1) % 4;
          walkFrames.current.set(id, nf);
          el.style.backgroundPositionX = `${-nf * FRAME_PX}px`;
        } else {
          const fr = b.state === "idle" ? SIT_FRAME : STAND_FRAME;
          el.style.backgroundPositionX = `${-fr * FRAME_PX}px`;
        }
      }
    }, WALK_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(now - prevNow.current, 50);
      prevNow.current = now;

      const stage = stageRef.current;
      const canvas = bgCanvasRef.current;
      const cw = stage?.clientWidth ?? 360;
      const sh = stageHRef.current;
      const isDark = darkRef.current;
      const ids = loungeRef.current;
      const bods = bodies.current;
      const infos = infoRef.current;

      const minFx = ANC_X + 8;
      const maxFx = cw - (SPR_W - ANC_X) - 8;
      const minFy = ANC_Y + 8;
      const maxFy = sh - FOOT_BELOW - 16;

      const idleBase = 0.00024 * (dt / 16);

      for (const id of ids) {
        const inf = infos.get(id);
        if (!bods.has(id)) bods.set(id, mkBody(cw, sh, inf, false));
        const b = bods.get(id)!;

        if (b.state === "talk" || b.state === "idle") {
          if (now > b.stateUntil) {
            const wasT = b.state === "talk";
            b.state = "walk";
            b.partnerId = null;
            const { vx, vy } = rvPostTalk(inf);
            b.vx = vx;
            b.vy = vy;
            if (wasT) convCount.current = Math.max(0, convCount.current - 1);
          }
          continue;
        }

        const lean = idleLean(inf);
        if (Math.random() < idleBase * lean) {
          b.state = "idle";
          b.stateUntil =
            now +
            700 +
            stableHash(personaSeed(inf) + id) % 1800;
          continue;
        }

        const step = dt / 16;
        b.fx += b.vx * step;
        b.fy += b.vy * step;
        if (b.fx < minFx) {
          b.fx = minFx;
          b.vx = Math.abs(b.vx);
        }
        if (b.fx > maxFx) {
          b.fx = maxFx;
          b.vx = -Math.abs(b.vx);
        }
        if (b.fy < minFy) {
          b.fy = minFy;
          b.vy = Math.abs(b.vy);
        }
        if (b.fy > maxFy) {
          b.fy = maxFy;
          b.vy = -Math.abs(b.vy);
        }
        if (Math.abs(b.vx) > 0.05) b.facing = b.vx > 0 ? 1 : -1;

        /* Solo voice — quirks / traits only, API-sourced */
        if (inf && b.state === "walk") {
          const last = soloLast.current.get(id) ?? 0;
          if (now - last > SOLO_COOL_MS && Math.random() < 0.0009 * lean) {
            const quirks = inf.quirks?.filter(Boolean) ?? [];
            const traits = inf.personalityTraits?.filter(Boolean) ?? [];
            const pool = [...quirks, ...traits];
            if (pool.length) {
              const line = pool[stableHash(String(now) + id) % pool.length];
              soloLast.current.set(id, now);
              const uid = `solo-${id}-${now}`;
              setBubbles(p => [
                ...p.filter(x => x.tokenId !== id || !x.solo),
                {
                  id: uid,
                  tokenId: id,
                  name: inf.name,
                  text: line,
                  x: b.fx,
                  y: b.fy - ANC_Y,
                  solo: true,
                },
              ]);
              setTimeout(
                () => setBubbles(p => p.filter(x => x.id !== uid)),
                5200
              );
            }
          }
        }
      }

      if (now - lastCheck.current > 110) {
        lastCheck.current = now;
        if (
          convCount.current < MAX_TALKS &&
          now - lastConv.current > CONV_COOL
        ) {
          const walk = ids
            .map(id => ({ id, b: bods.get(id) }))
            .filter(x => x.b?.state === "walk");
          outer: for (let i = 0; i < walk.length; i++) {
            for (let j = i + 1; j < walk.length; j++) {
              const { id: idA, b: bA } = walk[i];
              const { id: idB, b: bB } = walk[j];
              if (!bA || !bB) continue;
              if (Math.hypot(bA.fx - bB.fx, bA.fy - bB.fy) >= TALK_DIST)
                continue;

              pairSalt.current++;
              const ia = infoRef.current.get(idA);
              const ib = infoRef.current.get(idB);
              const { la, lb } = pickPairLines(ia, ib, pairSalt.current);

              const end = now + TALK_MS;
              bA.state = "talk";
              bA.stateUntil = end;
              bA.partnerId = idB;
              bB.state = "talk";
              bB.stateUntil = end;
              bB.partnerId = idA;
              bA.facing = bA.fx < bB.fx ? 1 : -1;
              bB.facing = bB.fx < bA.fx ? 1 : -1;
              lastConv.current = now;
              convCount.current++;

              const uid = String(now | 0);
              setBubbles(p => [
                ...p.filter(
                  b => b.tokenId !== idA && b.tokenId !== idB
                ),
                {
                  id: `${idA}-${uid}`,
                  tokenId: idA,
                  name: ia?.name ?? `#${idA}`,
                  text: la,
                  x: bA.fx,
                  y: bA.fy - ANC_Y,
                  solo: false,
                },
                {
                  id: `${idB}-${uid}`,
                  tokenId: idB,
                  name: ib?.name ?? `#${idB}`,
                  text: lb,
                  x: bB.fx,
                  y: bB.fy - ANC_Y,
                  solo: false,
                },
              ]);
              setChatLog(p =>
                [
                  {
                    id: uid,
                    ts: Date.now(),
                    aName: ia?.name ?? `#${idA}`,
                    bName: ib?.name ?? `#${idB}`,
                    textA: la,
                    textB: lb,
                  },
                  ...p,
                ].slice(0, CHAT_MAX)
              );
              const aR = `${idA}-${uid}`;
              const bR = `${idB}-${uid}`;
              setTimeout(
                () =>
                  setBubbles(p => p.filter(x => x.id !== aR && x.id !== bR)),
                TALK_MS + 400
              );
              break outer;
            }
          }
        }
      }

      for (const id of ids) {
        const b = bods.get(id);
        const sel = spriteRefs.current.get(id);
        const nel = nameRefs.current.get(id);
        if (!b) continue;
        const lx = Math.round(b.fx - ANC_X);
        const ly = Math.round(b.fy - ANC_Y);
        if (sel) {
          sel.style.left = `${lx}px`;
          sel.style.top = `${ly}px`;
          sel.style.transform = b.facing === -1 ? "scaleX(-1)" : "";
          sel.style.filter = isDark ? "invert(1)" : "none";
          sel.style.zIndex = String(Math.round(b.fy));
        }
        if (nel) {
          nel.style.left = `${lx}px`;
          nel.style.top = `${ly + SPR_H + 2}px`;
          nel.style.zIndex = String(Math.round(b.fy));
        }
      }

      if (canvas && stage) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = cw;
          canvas.height = sh;
          ctx.clearRect(0, 0, cw, sh);
          const g1 = isDark ? "rgba(6,182,212,0.04)" : "rgba(0,0,0,0.025)";
          ctx.fillStyle = g1;
          for (let gx = 16; gx < cw; gx += 24)
            for (let gy = 16; gy < sh; gy += 24)
              ctx.fillRect(gx, gy, 1, 1);
          const flY = sh - 6;
          const grd = ctx.createLinearGradient(0, flY - 50, 0, sh);
          grd.addColorStop(
            0,
            isDark ? "rgba(6,182,212,0)" : "rgba(72,73,75,0)"
          );
          grd.addColorStop(
            1,
            isDark ? "rgba(6,182,212,0.1)" : "rgba(72,73,75,0.06)"
          );
          ctx.fillStyle = grd;
          ctx.fillRect(0, flY - 50, cw, 50);
          ctx.fillStyle = isDark
            ? "rgba(6,182,212,0.35)"
            : "rgba(72,73,75,0.12)";
          ctx.fillRect(0, flY, cw, 1);

          ctx.setLineDash([4, 8]);
          ctx.strokeStyle = isDark
            ? "rgba(6,182,212,0.2)"
            : "rgba(72,73,75,0.1)";
          for (const id of ids) {
            const b = bods.get(id);
            if (b?.state !== "talk" || !b.partnerId || b.partnerId < id)
              continue;
            const pb = bods.get(b.partnerId);
            if (!pb) continue;
            ctx.beginPath();
            ctx.moveTo(b.fx, b.fy - ANC_Y * 0.35);
            ctx.lineTo(pb.fx, pb.fy - ANC_Y * 0.35);
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
  }, []);

  const agentsByToken = useMemo(() => {
    const m = new Map<number, AgentItem>();
    for (const a of agents) m.set(Number(a.tokenId), a);
    return m;
  }, [agents]);

  const loungeNormies: Normie[] = useMemo(
    () =>
      loungeIds.map(id => {
        const a = agentsByToken.get(id);
        return {
          tokenId: id,
          name: a?.name ?? `#${id}`,
          type: a?.type ?? "Human",
          info: infoMap.get(id),
        };
      }),
    [loungeIds, agentsByToken, infoMap]
  );

  const searchHits = useMemo(() => {
    const rawQ = agentQuery.trim().toLowerCase().replace(/^#/, "");
    if (rawQ.length < 1) return [] as AgentItem[];
    return agents
      .filter(a => {
        const tid = String(a.tokenId);
        const displayName = (
          infoMap.get(Number(a.tokenId))?.name ?? a.name
        ).toLowerCase();
        return displayName.includes(rawQ) || tid.includes(rawQ);
      })
      .slice(0, 10);
  }, [agents, agentQuery, infoMap]);

  const regTotal = agents.length;
  const regShown = Math.min(regPage * REG_PAGE_SIZE, regTotal);
  const regSlice = agents.slice(0, regShown);
  const focusInfo = focusId != null ? infoMap.get(focusId) : null;
  const focusAgent = focusId != null ? agents.find(a => Number(a.tokenId) === focusId) : null;

  return (
    <div className="relative">
      {/* ambient */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-40 dark:opacity-25"
        aria-hidden
        style={{
          background: `
            radial-gradient(900px 500px at 10% 0%, rgba(6,182,212,0.09), transparent 55%),
            radial-gradient(700px 400px at 90% 30%, rgba(139,92,246,0.06), transparent 50%)`,
        }}
      />

      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Hero header */}
        <header className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-lg sm:text-2xl font-medium text-n-text tracking-tight">
                  agentic lounge
                </h1>
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan-400/50 text-cyan-700 dark:text-cyan-400 bg-cyan-50/80 dark:bg-cyan-950/40">
                  ERC-8004
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-mono text-n-muted leading-relaxed">
                Sprites wander until they meet — then both speak using lines from
                their public personas. The floor auto-shuffles on a timer, or pick
                someone yourself below.
              </p>
            </div>
            {!loading && (
              <div className="flex flex-col items-stretch sm:items-end gap-2 text-[10px] font-mono shrink-0">
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <span className="px-2 py-1 rounded-md border border-n-border bg-n-surface text-n-muted tabular-nums">
                    {agents.length} agents
                  </span>
                  <span className="px-2 py-1 rounded-md border border-cyan-500/35 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 tabular-nums">
                    {loungeIds.length} on screen
                  </span>
                  <span className="px-2 py-1 rounded-md border border-n-border bg-n-surface text-n-muted inline-flex items-center gap-1 tabular-nums">
                    <RefreshCw className="w-3 h-3 opacity-70" />
                    shuffle in {secToShuffle}s
                  </span>
                </div>
                <div className="h-1 w-full sm:w-48 rounded-full bg-n-border overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-[width] duration-300 ease-linear"
                    style={{
                      width: `${Math.min(
                        100,
                        (secToShuffle / (ROTATE_MS / 1000)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {loading && (
              <span className="px-2 py-1 rounded-md border border-n-border bg-n-surface text-n-muted text-[10px] font-mono inline-flex items-center gap-1.5 self-start">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                loading…
              </span>
            )}
          </div>

          {!loading && agents.length > 0 && (
            <div className="relative max-w-md">
              <label className="sr-only" htmlFor="agent-lounge-search">
                Find by name or normie number
              </label>
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-n-faint pointer-events-none" />
                <input
                  id="agent-lounge-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Search name or #…"
                  value={agentQuery}
                  onChange={e => setAgentQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs font-mono bg-n-surface border border-n-border rounded-lg text-n-text placeholder:text-n-faint focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              {agentQuery.trim().length > 0 && (
                <ul
                  className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-n-border bg-n-bg shadow-lg py-1"
                  role="listbox"
                >
                  {searchHits.length === 0 ? (
                    <li className="px-3 py-2 text-[10px] font-mono text-n-faint">
                      No match — try another name or number.
                    </li>
                  ) : (
                    searchHits.map(a => {
                      const tid = Number(a.tokenId);
                      const label =
                        infoMap.get(tid)?.name ?? a.name;
                      return (
                        <li key={tid} role="none">
                          <button
                            type="button"
                            role="option"
                            className="w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-n-surface flex items-center justify-between gap-2"
                            onClick={() => {
                              bringToStage(tid, {
                                fromEdge: true,
                                openSheet: false,
                              });
                              setAgentQuery("");
                            }}
                          >
                            <span className="text-n-text truncate">{label}</span>
                            <span className="text-[10px] text-n-faint shrink-0 tabular-nums">
                              #{tid}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          )}
        </header>

        {/* Stage + chat: stack on mobile */}
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 items-stretch">
          <div
            className="relative flex-1 min-w-0 rounded-xl border border-n-border bg-n-bg shadow-sm overflow-hidden ring-1 ring-black/[0.03] dark:ring-white/[0.05]"
            style={{ minHeight: "min(58vh, 520px)", height: "min(58vh, 520px)" }}
          >
            <div
              ref={stageRef}
              className="relative w-full h-full touch-pan-y"
            >
              <canvas
                ref={bgCanvasRef}
                className="absolute inset-0 pointer-events-none"
              />

              {loungeNormies.map(n => (
                <button
                  key={`sprite-${n.tokenId}`}
                  type="button"
                  ref={el => {
                    if (el) spriteRefs.current.set(n.tokenId, el);
                    else spriteRefs.current.delete(n.tokenId);
                  }}
                  className="normie-sprite absolute p-0 border-0 bg-transparent cursor-pointer touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 rounded"
                  style={{
                    backgroundImage: `url(${SPRITES_API}/normies/${n.tokenId}/sheet.png)`,
                  }}
                  onClick={() => {
                    bringToStage(n.tokenId, { openSheet: true });
                    setTraitsOpen(true);
                  }}
                  title={n.info?.tagline?.trim() ? `"${n.info.tagline}"` : n.name}
                  aria-label={`Inspect ${n.name}`}
                />
              ))}

              {loungeNormies.map(n => {
                const inf = n.info;
                return (
                  <div
                    key={`name-${n.tokenId}`}
                    ref={el => {
                      if (el) nameRefs.current.set(n.tokenId, el);
                      else nameRefs.current.delete(n.tokenId);
                    }}
                    className="absolute pointer-events-none text-center"
                    style={{ width: SPR_W }}
                  >
                    <div
                      className={`text-[6px] sm:text-[7px] font-mono font-medium leading-tight ${
                        focusId === n.tokenId
                          ? "text-cyan-500"
                          : "text-n-muted"
                      }`}
                    >
                      {trunc(n.name, 12)}
                    </div>
                    {inf?.canvas && (
                      <div className="text-[5px] sm:text-[6px] font-mono text-n-faint">
                        lv{inf.canvas.level}
                      </div>
                    )}
                  </div>
                );
              })}

              <style>{`
                .normie-sprite {
                  width: ${SPR_W}px;
                  height: ${SPR_H}px;
                  background-size: ${SHEET_CSS_W}px ${SPR_H}px;
                  background-repeat: no-repeat;
                  image-rendering: pixelated;
                  image-rendering: crisp-edges;
                }
              `}</style>

              <AnimatePresence>
                {bubbles.map(b => {
                  const cw = stageRef.current?.clientWidth ?? 360;
                  const bw = Math.min(88, cw - 16);
                  const left = Math.max(
                    4,
                    Math.min(b.x - bw / 2, cw - bw - 4)
                  );
                  const top = Math.max(2, b.y - (b.solo ? 34 : 42));
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 3, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -2, scale: 0.99 }}
                      transition={{ duration: 0.12 }}
                      className="absolute pointer-events-none"
                      style={{
                        left,
                        top,
                        width: bw,
                        zIndex: 9999,
                      }}
                    >
                      <div
                        className={`rounded-md border px-1 py-0.5 shadow-md ${
                          b.solo
                            ? "border-dashed border-[var(--border)]"
                            : "border-[var(--border)]"
                        } bg-[var(--white)]`}
                      >
                        <p className="font-mono text-[6px] text-[var(--muted)] leading-tight mb-0.5">
                          <span className="text-[var(--text)]">{trunc(b.name, 11)}</span>
                          {b.solo ? (
                            <span className="text-[var(--faint)]"> · musing</span>
                          ) : null}
                        </p>
                        <p className="font-body text-[8px] text-[var(--text)] leading-snug line-clamp-3 break-words">
                          {b.text}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {!loading && agents.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center bg-n-bg/90 backdrop-blur-sm">
                  <Bot className="w-10 h-10 text-n-faint" />
                  <p className="text-sm font-mono text-n-muted max-w-sm">
                    No agents are on-chain yet, or the list didn’t load. Refresh
                    and try again.
                  </p>
                </div>
              )}

              {loading && !loungeIds.length && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-n-bg/80 backdrop-blur-[2px]">
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="w-7 h-10 sm:w-8 sm:h-12 border border-n-border rounded-md bg-n-surface"
                        animate={{ opacity: [0.15, 0.55, 0.15] }}
                        transition={{
                          duration: 1.2,
                          delay: i * 0.08,
                          repeat: Infinity,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-mono text-n-muted px-4 text-center">
                    Loading agents and personas…
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chat column */}
          <aside
            className="w-full lg:w-72 xl:w-80 flex-shrink-0 flex flex-col rounded-xl border border-n-border bg-n-bg overflow-hidden max-h-[min(38vh,300px)] lg:max-h-[min(58vh,520px)] lg:h-[min(58vh,520px)]"
            style={{ minHeight: 0 }}
          >
            <div className="px-3 py-2.5 border-b border-n-border flex items-center gap-2 flex-shrink-0">
              <MessageSquare className="w-3.5 h-3.5 text-n-muted" />
              <span className="text-[10px] font-mono text-n-muted uppercase tracking-wider">
                when they meet
              </span>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-n-border min-h-[120px]">
              {chatLog.length === 0 && !loading && (
                <p className="text-[10px] font-mono text-n-faint p-3">
                  Pairs who bump into each other show both sides here — pulled
                  from their personas.
                </p>
              )}
              {chatLog.map(entry => (
                <div key={entry.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-[9px] font-mono">
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {trunc(entry.aName, 14)}
                    </span>
                    <span className="text-n-faint">↔</span>
                    <span className="font-semibold text-n-muted">
                      {trunc(entry.bName, 14)}
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-n-muted leading-snug border-l-2 border-cyan-500/30 pl-2">
                    <span className="italic">&ldquo;{trunc(entry.textA, 100)}&rdquo;</span>
                  </p>
                  <p className="text-[9px] font-mono text-n-muted leading-snug border-l-2 border-n-border pl-2">
                    <span className="italic">&ldquo;{trunc(entry.textB, 100)}&rdquo;</span>
                  </p>
                  <div className="text-[8px] font-mono text-n-faint">
                    {timeAgo(entry.ts)}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Focus sheet — mobile-forward */}
        <AnimatePresence>
          {focusId != null && (focusInfo || focusAgent) && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-[var(--bg)] sm:relative sm:inset-auto sm:bottom-auto sm:mt-2 sm:bg-transparent"
            >
              <div className="mx-auto max-w-[1400px] px-3 sm:px-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
                <div
                  onClick={() => {
                    if (focusId == null) return;
                    if (agents.some(a => Number(a.tokenId) === focusId)) {
                      bringToStage(focusId, {
                        fromEdge: true,
                        openSheet: true,
                      });
                    }
                  }}
                  className="rounded-t-2xl sm:rounded-xl border border-[var(--border)] bg-[var(--white)] shadow-xl sm:shadow-md p-4 space-y-3 sm:max-w-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${AGENTS_API}/normie/${focusId}/image.svg`}
                        alt=""
                        width={56}
                        height={56}
                        className="w-12 h-12 sm:w-14 sm:h-14 object-contain pixelated shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1"
                        style={{ filter: dark ? "invert(1)" : "none" }}
                      />
                      <div className="min-w-0">
                        <h2 className="font-mono text-sm sm:text-base font-medium text-[var(--text)] truncate">
                          {focusInfo?.name ?? focusAgent?.name ?? `#${focusId}`}
                        </h2>
                        {focusInfo?.tagline && (
                          <p className="text-[11px] font-mono text-[var(--muted)] italic line-clamp-2">
                            &ldquo;{focusInfo.tagline}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setFocusId(null);
                      }}
                      className="text-[10px] font-mono text-[var(--faint)] hover:text-[var(--text)] px-2 py-1 min-h-[44px] sm:min-h-0"
                    >
                      close
                    </button>
                  </div>
                  {focusId != null &&
                    !loungeIds.includes(focusId) &&
                    agents.some(a => Number(a.tokenId) === focusId) && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          bringToStage(focusId, {
                            fromEdge: true,
                            openSheet: true,
                          });
                        }}
                        className="w-full sm:w-auto inline-flex items-center justify-center min-h-[40px] px-4 text-[11px] font-mono rounded-md bg-cyan-600 text-white hover:bg-cyan-500 dark:bg-cyan-700 dark:hover:bg-cyan-600"
                      >
                        Put on floor
                      </button>
                    )}
                  {focusInfo?.greeting && (
                    <p
                      className="text-[11px] font-mono text-[var(--text)] leading-relaxed pointer-events-none"
                    >
                      {focusInfo.greeting}
                    </p>
                  )}
                  {(focusInfo?.personalityTraits?.length ||
                    focusInfo?.quirks?.length) && (
                    <div className="pointer-events-auto">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setTraitsOpen(o => !o);
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2 min-h-[40px] sm:min-h-0"
                      >
                        published traits
                        {traitsOpen ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                      {traitsOpen && (
                        <div className="flex flex-wrap gap-1.5">
                          {focusInfo.personalityTraits?.map((t, i) => (
                            <span
                              key={`t-${focusId}-${i}`}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)]"
                            >
                              {t}
                            </span>
                          ))}
                          {focusInfo.quirks?.map((q, i) => (
                            <span
                              key={`q-${focusId}-${i}`}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-dashed border-[var(--border)] text-[var(--faint)]"
                            >
                              {q}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className="flex flex-wrap gap-2 pt-1 pointer-events-auto"
                    onClick={e => e.stopPropagation()}
                  >
                    <Link
                      href={`/normie/${focusId}`}
                      className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[36px] px-4 text-[11px] font-mono rounded-md bg-[var(--text)] text-[var(--bg)] hover:opacity-90"
                    >
                      open normie page
                    </Link>
                    <a
                      href={`${AGENTS_API}/agents/info/${focusId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[36px] px-4 text-[11px] font-mono rounded-md border border-[var(--border)] text-[var(--muted)] hover:border-[var(--text)]"
                    >
                      raw persona JSON
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer strip */}
        <footer className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[9px] font-mono text-n-faint border-t border-n-border pt-5">
          <span className="flex items-center gap-1.5">
            <Bot className="w-3 h-3 shrink-0" />
            Lines from their API personas when paths cross.
          </span>
          <span className="sm:ml-auto flex flex-wrap gap-x-3 gap-y-1">
            <a
              className="underline underline-offset-2 hover:text-n-muted"
              href="https://fullnormies.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              sprites
            </a>
            <a
              className="underline underline-offset-2 hover:text-n-muted"
              href="https://api.normies.art"
              target="_blank"
              rel="noopener noreferrer"
            >
              agents API
            </a>
          </span>
        </footer>

        {/* Registry */}
        {agents.length > 0 && (
          <section className="space-y-3 border-t border-n-border pt-6">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-n-muted shrink-0" />
                  <h2 className="text-xs font-mono text-n-muted uppercase tracking-wider">
                    browse all
                  </h2>
                </div>
                <p className="text-[9px] font-mono text-n-faint max-w-lg">
                  Tap a portrait — same as picking from search.
                </p>
              </div>
              <span className="text-[10px] font-mono text-n-faint shrink-0">
                {regShown} / {regTotal}
                {infoProgress < regTotal &&
                  ` · personas ${infoProgress}/${regTotal}`}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-1.5 sm:gap-2">
              {regSlice.map(a => {
                const tid = Number(a.tokenId);
                const on = loungeIds.includes(tid);
                const inf = infoMap.get(tid);
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => bringToStage(tid, { openSheet: true })}
                    className={`relative flex flex-col items-center gap-0.5 p-1.5 sm:p-1 rounded-lg border min-h-[72px] sm:min-h-0 transition-colors touch-manipulation ${
                      on
                        ? "border-cyan-400/60 bg-cyan-50/60 dark:bg-cyan-950/30"
                        : "border-n-border active:bg-n-surface hover:border-n-muted"
                    }`}
                    title={`Bring ${inf?.name ?? a.name} onto the floor`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${AGENTS_API}/normie/${tid}/image.svg`}
                      alt=""
                      loading="lazy"
                      width={32}
                      height={32}
                      className="pixelated w-8 h-8 sm:w-9 sm:h-9 object-contain"
                      style={{ filter: dark ? "invert(1)" : "none" }}
                    />
                    <span className="text-[6px] sm:text-[7px] font-mono text-n-faint text-center line-clamp-2 leading-tight w-full px-0.5">
                      {trunc(inf?.name ?? a.name, 10)}
                    </span>
                    {on && (
                      <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-cyan-500 ring-2 ring-n-bg" />
                    )}
                  </button>
                );
              })}
            </div>

            {regShown < regTotal && (
              <button
                type="button"
                onClick={() => setRegPage(p => p + 1)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[44px] text-[11px] font-mono text-n-muted hover:text-n-text border border-n-border rounded-lg px-4 py-2.5 sm:py-2 mx-auto transition-colors"
              >
                load more roster
                <span className="text-n-faint">
                  ({regTotal - regShown} left)
                </span>
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Root
═══════════════════════════════════════════════════════════════════════ */
export default function AgenticLoungeClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setUnlocked(localStorage.getItem(LS_KEY) === "1");
    setChecked(true);
  }, []);

  const unlock = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    setUnlocked(true);
  }, []);

  if (!checked) return null;
  if (!unlocked)
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
        <LockScreen onUnlock={unlock} />
      </div>
    );
  return <LoungeRoom />;
}
