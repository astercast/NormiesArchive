"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Star } from "lucide-react";
import type { AgentInfo } from "@/components/AgentSection";
import {
  SPRITES_API,
  SPR_W,
  SPR_H,
  ANC_X,
  ANC_Y,
  FOOT_BELOW,
  SHEET_CSS_W,
  FRAME_PX,
  STAND_FRAME,
  SIT_FRAME,
  WALK_FRAME_MS,
  BASE_SPEED,
  TALK_DIST,
  TURN_GAP_MS,
  TALK_MS,
  CONV_COOL,
  MAX_TALKS,
} from "@/lib/agentic/constants";
import { buildScript, paceMult, type ConvoTurn } from "@/lib/agentic/dialogue";
import { rankConversationPairs } from "@/lib/agentic/resonance";
import { computeStageCap, trunc } from "@/lib/agentic/utils";
import type {
  AgentListItem,
  ChatEntry,
  LiveTurn,
  WitnessEntry,
} from "@/lib/agentic/types";

const IDLE_BASE = 0.00006;
const IDLE_MIN_MS = 700;
const IDLE_MAX_MS = 1600;
const WANDER_MIN_MS = 1800;
const WANDER_MAX_MS = 4200;
const SPRITE_HIT_PAD = 12;

interface Body {
  fx: number;
  fy: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: "walk" | "talk" | "idle";
  stateUntil: number;
  partnerId: number | null;
  convoId: string | null;
  wanderTx: number;
  wanderTy: number;
  wanderUntil: number;
}

interface BubbleMeta {
  id: string;
  tokenId: number;
  name: string;
  text: string;
  active: boolean;
}

interface Convo {
  id: string;
  aId: number;
  bId: number;
  script: ConvoTurn[];
  turn: number;
  nextTurnAt: number;
  endsAt: number;
  resonanceScore: number;
  resonanceLabel: string;
  sharedTraits: string[];
}

export interface LoungeStageProps {
  agents: AgentListItem[];
  loungeIds: number[];
  setLoungeIds: Dispatch<SetStateAction<number[]>>;
  infoMap: Map<number, AgentInfo>;
  pinnedIds: number[];
  dark: boolean;
  loading: boolean;
  onAgentClick: (tokenId: number) => void;
  onDiscover: (tokenId: number) => void;
  onChatEntry: (entry: ChatEntry) => void;
  onWitness: (entry: WitnessEntry) => void;
  onLiveTurn?: (turn: LiveTurn | null) => void;
  onActiveConvos?: (count: number) => void;
  className?: string;
}

function pickWanderTarget(
  minFx: number,
  maxFx: number,
  minFy: number,
  maxFy: number
): { tx: number; ty: number; until: number } {
  return {
    tx: minFx + Math.random() * Math.max(1, maxFx - minFx),
    ty: minFy + Math.random() * Math.max(1, maxFy - minFy),
    until:
      performance.now() +
      WANDER_MIN_MS +
      Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS),
  };
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
  const p = paceMult(info);
  const speed = (0.55 + Math.random() * 1.1) * BASE_SPEED * p;
  const rv = () => (Math.random() < 0.5 ? speed : -speed);
  const fy = minFy + Math.random() * Math.max(1, maxFy - minFy);
  const wander = pickWanderTarget(minFx, maxFx, minFy, maxFy);
  if (edge) {
    const left = Math.random() < 0.5;
    return {
      fx: left ? minFx : maxFx,
      fy,
      vx: left ? Math.abs(speed) : -Math.abs(speed),
      vy: (Math.random() - 0.5) * 0.45 * p,
      facing: left ? 1 : -1,
      state: "walk",
      stateUntil: 0,
      partnerId: null,
      convoId: null,
      wanderTx: wander.tx,
      wanderTy: wander.ty,
      wanderUntil: wander.until,
    };
  }
  return {
    fx: minFx + Math.random() * Math.max(1, maxFx - minFx),
    fy,
    vx: rv(),
    vy: rv() * 0.45,
    facing: Math.random() < 0.5 ? 1 : -1,
    state: "walk",
    stateUntil: 0,
    partnerId: null,
    convoId: null,
    wanderTx: wander.tx,
    wanderTy: wander.ty,
    wanderUntil: wander.until,
  };
}

function steerWander(
  b: Body,
  inf: AgentInfo | undefined,
  minFx: number,
  maxFx: number,
  minFy: number,
  maxFy: number,
  now: number
) {
  if (now >= b.wanderUntil) {
    const w = pickWanderTarget(minFx, maxFx, minFy, maxFy);
    b.wanderTx = w.tx;
    b.wanderTy = w.ty;
    b.wanderUntil = w.until;
  }
  const dx = b.wanderTx - b.fx;
  const dy = b.wanderTy - b.fy;
  const dist = Math.hypot(dx, dy);
  const p = paceMult(inf);
  const speed = BASE_SPEED * p * (0.95 + Math.random() * 0.35);
  if (dist > 6) {
    b.vx = (dx / dist) * speed;
    b.vy = (dy / dist) * speed * 0.55;
  } else {
    const w = pickWanderTarget(minFx, maxFx, minFy, maxFy);
    b.wanderTx = w.tx;
    b.wanderTy = w.ty;
    b.wanderUntil = w.until;
  }
}

function rvPostTalk(
  info: AgentInfo | undefined,
  minFx: number,
  maxFx: number,
  minFy: number,
  maxFy: number
): {
  vx: number;
  vy: number;
  wanderTx: number;
  wanderTy: number;
  wanderUntil: number;
} {
  const p = paceMult(info);
  const s = (0.5 + Math.random() * 1.0) * BASE_SPEED * p;
  const vx = Math.random() < 0.5 ? s : -s;
  const vy = (Math.random() - 0.5) * 0.45 * p;
  const w = pickWanderTarget(minFx, maxFx, minFy, maxFy);
  return { vx, vy, wanderTx: w.tx, wanderTy: w.ty, wanderUntil: w.until };
}

export default function LoungeStage({
  agents,
  loungeIds,
  setLoungeIds,
  infoMap,
  pinnedIds,
  dark,
  loading,
  onAgentClick,
  onDiscover,
  onChatEntry,
  onWitness,
  onLiveTurn,
  onActiveConvos,
  className = "",
}: LoungeStageProps) {
  const [bubbles, setBubbles] = useState<BubbleMeta[]>([]);
  const bubblesRef = useRef<BubbleMeta[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const prevNow = useRef(0);
  const darkRef = useRef(dark);
  const loungeRef = useRef(loungeIds);
  const infoRef = useRef(infoMap);
  const agentsRef = useRef(agents);
  const bodies = useRef<Map<number, Body>>(new Map());
  const spriteRefs = useRef<Map<number, HTMLElement>>(new Map());
  const nameRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const stageHRef = useRef(420);
  const walkFrames = useRef<Map<number, number>>(new Map());
  const convosRef = useRef<Convo[]>([]);
  const convCount = useRef(0);
  const lastConvAt = useRef(-CONV_COOL);
  const lastCheck = useRef(0);
  const pairSalt = useRef(0);
  const prevLoungeRef = useRef<number[]>([]);
  const onChatEntryRef = useRef(onChatEntry);
  const onWitnessRef = useRef(onWitness);
  const onDiscoverRef = useRef(onDiscover);
  const onLiveTurnRef = useRef(onLiveTurn);
  const onActiveConvosRef = useRef(onActiveConvos);

  useEffect(() => {
    loungeRef.current = loungeIds;
  }, [loungeIds]);
  useEffect(() => {
    infoRef.current = infoMap;
  }, [infoMap]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);
  useEffect(() => {
    onChatEntryRef.current = onChatEntry;
  }, [onChatEntry]);
  useEffect(() => {
    onWitnessRef.current = onWitness;
  }, [onWitness]);
  useEffect(() => {
    onDiscoverRef.current = onDiscover;
  }, [onDiscover]);
  useEffect(() => {
    onLiveTurnRef.current = onLiveTurn;
  }, [onLiveTurn]);
  useEffect(() => {
    onActiveConvosRef.current = onActiveConvos;
  }, [onActiveConvos]);

  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  /* Responsive stage cap */
  useEffect(() => {
    const sync = () => {
      const cap = computeStageCap(window.innerWidth);
      setLoungeIds(prev => {
        if (prev.length <= cap) return prev;
        const locked = prev.filter(
          id =>
            bodies.current.get(id)?.state === "talk" ||
            pinnedIds.includes(id)
        );
        const others = prev.filter(id => !locked.includes(id));
        const need = Math.max(0, cap - locked.length);
        return [...locked, ...others.slice(0, need)];
      });
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [pinnedIds, setLoungeIds]);

  /* Stage size observer */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      stageHRef.current = Math.max(280, el.clientHeight);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [loading]);

  /* Sync bodies when lounge roster changes */
  useEffect(() => {
    const prev = new Set(prevLoungeRef.current);
    const bulkInit = loungeIds.length > 0 && prevLoungeRef.current.length === 0;
    const cw = stageRef.current?.clientWidth ?? 360;
    const sh = stageHRef.current;

    for (const id of loungeIds) {
      if (!bodies.current.has(id)) {
        const fromEdge = !bulkInit && !prev.has(id);
        bodies.current.set(
          id,
          mkBody(cw, sh, infoMap.get(id), fromEdge)
        );
        walkFrames.current.set(id, Math.floor(Math.random() * 4));
      }
    }
    for (const id of [...bodies.current.keys()]) {
      if (!loungeIds.includes(id)) bodies.current.delete(id);
    }
    prevLoungeRef.current = loungeIds;
  }, [loungeIds, infoMap]);

  /* Sprite walk-frame ticker */
  useEffect(() => {
    const t = setInterval(() => {
      for (const id of loungeRef.current) {
        const b = bodies.current.get(id);
        const el = spriteRefs.current.get(id);
        if (!el || !b) continue;
        if (b.state === "walk") {
          const nf = ((walkFrames.current.get(id) ?? 0) + 1) % 4;
          walkFrames.current.set(id, nf);
          el.style.backgroundPosition = `${-nf * FRAME_PX + SPRITE_HIT_PAD}px ${SPRITE_HIT_PAD}px`;
        } else {
          const fr = b.state === "idle" ? SIT_FRAME : STAND_FRAME;
          el.style.backgroundPosition = `${-fr * FRAME_PX + SPRITE_HIT_PAD}px ${SPRITE_HIT_PAD}px`;
        }
      }
    }, WALK_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  /* Main rAF loop */
  useEffect(() => {
    const layoutBubble = (
      el: HTMLDivElement,
      body: Body,
      cw: number
    ) => {
      const bw = Math.min(160, cw - 12);
      const left = Math.max(4, Math.min(body.fx - bw / 2, cw - bw - 4));
      const top = Math.max(2, body.fy - ANC_Y - 60);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${bw}px`;
    };

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

      for (const id of ids) {
        const inf = infos.get(id);
        if (!bods.has(id)) bods.set(id, mkBody(cw, sh, inf, false));
        const b = bods.get(id)!;

        if (b.state === "talk") continue;

        if (b.state === "idle") {
          if (now > b.stateUntil) {
            b.state = "walk";
            const rv = rvPostTalk(inf, minFx, maxFx, minFy, maxFy);
            b.vx = rv.vx;
            b.vy = rv.vy;
            b.wanderTx = rv.wanderTx;
            b.wanderTy = rv.wanderTy;
            b.wanderUntil = rv.wanderUntil;
          }
          continue;
        }

        steerWander(b, inf, minFx, maxFx, minFy, maxFy, now);

        if (Math.random() < IDLE_BASE * (dt / 16)) {
          b.state = "idle";
          b.stateUntil =
            now + IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
          continue;
        }

        const step = dt / 16;
        b.fx += b.vx * step;
        b.fy += b.vy * step;
        if (b.fx < minFx) {
          b.fx = minFx;
          b.vx = Math.abs(b.vx) * 1.05;
          const w = pickWanderTarget(minFx, maxFx, minFy, maxFy);
          b.wanderTx = w.tx;
          b.wanderTy = w.ty;
          b.wanderUntil = w.until;
        }
        if (b.fx > maxFx) {
          b.fx = maxFx;
          b.vx = -Math.abs(b.vx) * 1.05;
          const w = pickWanderTarget(minFx, maxFx, minFy, maxFy);
          b.wanderTx = w.tx;
          b.wanderTy = w.ty;
          b.wanderUntil = w.until;
        }
        if (b.fy < minFy) {
          b.fy = minFy;
          b.vy = Math.abs(b.vy) * 1.05;
        }
        if (b.fy > maxFy) {
          b.fy = maxFy;
          b.vy = -Math.abs(b.vy) * 1.05;
        }
        if (Math.abs(b.vx) > 0.05) b.facing = b.vx > 0 ? 1 : -1;
      }

      const convos = convosRef.current;

      for (const c of convos) {
        if (c.turn < c.script.length && now >= c.nextTurnAt) {
          const t = c.script[c.turn];
          const body = bods.get(t.speakerId);
          if (body) {
            const info = infos.get(t.speakerId);
            const partner = t.speakerId === c.aId ? c.bId : c.aId;
            const partnerBody = bods.get(partner);
            if (partnerBody) {
              body.facing = body.fx < partnerBody.fx ? 1 : -1;
            }
            setBubbles(prev => {
              const others = prev.filter(b => b.tokenId !== t.speakerId);
              return [
                ...others.map(b =>
                  b.tokenId === partner ? { ...b, active: false } : b
                ),
                {
                  id: `${c.id}-${t.speakerId}-${c.turn}`,
                  tokenId: t.speakerId,
                  name: info?.name ?? `#${t.speakerId}`,
                  text: t.text,
                  active: true,
                },
              ];
            });
            const ai = infos.get(c.aId);
            const bi = infos.get(c.bId);
            onLiveTurnRef.current?.({
              convoId: c.id,
              aId: c.aId,
              bId: c.bId,
              aName: ai?.name ?? `#${c.aId}`,
              bName: bi?.name ?? `#${c.bId}`,
              speakerId: t.speakerId,
              line: t.text,
              turnIndex: c.turn,
              totalTurns: c.script.length,
              resonanceScore: c.resonanceScore,
              resonanceLabel: c.resonanceLabel,
              sharedTraits: c.sharedTraits,
            });
          }
          c.turn += 1;
          c.nextTurnAt = now + TURN_GAP_MS;
        }
      }

      for (let i = convos.length - 1; i >= 0; i--) {
        const c = convos[i];
        if (now < c.endsAt) continue;
        const ai = infos.get(c.aId);
        const bi = infos.get(c.bId);
        const bA = bods.get(c.aId);
        const bB = bods.get(c.bId);
        if (bA) {
          bA.state = "walk";
          bA.partnerId = null;
          bA.convoId = null;
          const rv = rvPostTalk(ai, minFx, maxFx, minFy, maxFy);
          bA.vx = rv.vx;
          bA.vy = rv.vy;
          bA.wanderTx = rv.wanderTx;
          bA.wanderTy = rv.wanderTy;
          bA.wanderUntil = rv.wanderUntil;
        }
        if (bB) {
          bB.state = "walk";
          bB.partnerId = null;
          bB.convoId = null;
          const rv = rvPostTalk(bi, minFx, maxFx, minFy, maxFy);
          bB.vx = rv.vx;
          bB.vy = rv.vy;
          bB.wanderTx = rv.wanderTx;
          bB.wanderTy = rv.wanderTy;
          bB.wanderUntil = rv.wanderUntil;
        }
        convos.splice(i, 1);
        convCount.current = Math.max(0, convCount.current - 1);
        onActiveConvosRef.current?.(convCount.current);
        if (convCount.current === 0) onLiveTurnRef.current?.(null);

        const entry: ChatEntry = {
          id: c.id,
          ts: Date.now(),
          aName: ai?.name ?? `#${c.aId}`,
          bName: bi?.name ?? `#${c.bId}`,
          aId: c.aId,
          bId: c.bId,
          lines: c.script.map(turn => ({
            who: infos.get(turn.speakerId)?.name ?? `#${turn.speakerId}`,
            text: turn.text,
          })),
        };

        onChatEntryRef.current(entry);
        onWitnessRef.current({ ...entry, witnessed: true });
        onDiscoverRef.current(c.aId);
        onDiscoverRef.current(c.bId);

        const fadeIds = [c.aId, c.bId];
        setTimeout(() => {
          setBubbles(prev =>
            prev.filter(b => !fadeIds.includes(b.tokenId))
          );
        }, 600);
      }

      if (
        convCount.current < MAX_TALKS &&
        now - lastConvAt.current > CONV_COOL &&
        now - lastCheck.current > 120
      ) {
        lastCheck.current = now;
        const candidates = ids
          .map(id => ({ id, b: bods.get(id) }))
          .filter(x => x.b?.state === "walk")
          .map(x => ({ id: x.id, x: x.b!.fx, y: x.b!.fy }));
        const ranked = rankConversationPairs(candidates, infos, TALK_DIST);
        if (ranked.length > 0) {
          const best = ranked[0];
          const idA = best.a;
          const idB = best.b;
          const bA = bods.get(idA);
          const bB = bods.get(idB);
          if (bA && bB) {
            pairSalt.current++;
            const ia = infos.get(idA);
            const ib = infos.get(idB);
            const cId = `c-${now}-${idA}-${idB}`;
            const script = buildScript(idA, idB, ia, ib, pairSalt.current);
            const endsAt = now + TALK_MS;
            convos.push({
              id: cId,
              aId: idA,
              bId: idB,
              script,
              turn: 0,
              nextTurnAt: now,
              endsAt,
              resonanceScore: best.resonance.score,
              resonanceLabel: best.resonance.label,
              sharedTraits: best.resonance.sharedTraits,
            });
            bA.state = "talk";
            bA.stateUntil = endsAt;
            bA.partnerId = idB;
            bA.convoId = cId;
            bA.vx = 0;
            bA.vy = 0;
            bA.facing = bA.fx < bB.fx ? 1 : -1;
            bB.state = "talk";
            bB.stateUntil = endsAt;
            bB.partnerId = idA;
            bB.convoId = cId;
            bB.vx = 0;
            bB.vy = 0;
            bB.facing = bB.fx < bA.fx ? 1 : -1;
            convCount.current += 1;
            lastConvAt.current = now;
            onActiveConvosRef.current?.(convCount.current);
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
          sel.style.left = `${lx - SPRITE_HIT_PAD}px`;
          sel.style.top = `${ly - SPRITE_HIT_PAD}px`;
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

      for (const b of bubblesRef.current) {
        const el = bubbleRefs.current.get(b.id);
        const body = bods.get(b.tokenId);
        if (!el || !body) continue;
        layoutBubble(el, body, cw);
      }

      if (canvas && stage) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = cw;
          canvas.height = sh;
          ctx.clearRect(0, 0, cw, sh);
          ctx.fillStyle = isDark
            ? "rgba(6,182,212,0.04)"
            : "rgba(0,0,0,0.025)";
          for (let gx = 16; gx < cw; gx += 24) {
            for (let gy = 16; gy < sh; gy += 24) {
              ctx.fillRect(gx, gy, 1, 1);
            }
          }
          const flY = sh - 6;
          const grd = ctx.createLinearGradient(0, flY - 60, 0, sh);
          grd.addColorStop(
            0,
            isDark ? "rgba(6,182,212,0)" : "rgba(72,73,75,0)"
          );
          grd.addColorStop(
            1,
            isDark ? "rgba(6,182,212,0.1)" : "rgba(72,73,75,0.06)"
          );
          ctx.fillStyle = grd;
          ctx.fillRect(0, flY - 60, cw, 60);
          ctx.fillStyle = isDark
            ? "rgba(6,182,212,0.35)"
            : "rgba(72,73,75,0.12)";
          ctx.fillRect(0, flY, cw, 1);

          ctx.setLineDash([4, 8]);
          ctx.strokeStyle = isDark
            ? "rgba(6,182,212,0.25)"
            : "rgba(6,182,212,0.2)";
          ctx.lineWidth = 1;
          for (const c of convos) {
            const aB = bods.get(c.aId);
            const bB = bods.get(c.bId);
            if (!aB || !bB) continue;
            ctx.beginPath();
            ctx.moveTo(aB.fx, aB.fy - ANC_Y * 0.35);
            ctx.lineTo(bB.fx, bB.fy - ANC_Y * 0.35);
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
    const m = new Map<number, AgentListItem>();
    for (const a of agents) m.set(Number(a.tokenId), a);
    return m;
  }, [agents]);

  const loungeNormies = useMemo(
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

  const outerClass = [
    "relative w-full min-h-[50vh] sm:min-h-[420px] max-h-[560px]",
    "h-[50vh] sm:h-[420px] lg:h-[560px]",
    "rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-sm overflow-hidden",
    "ring-1 ring-black/[0.03] dark:ring-white/[0.05]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={outerClass}>
      <div ref={stageRef} className="relative w-full h-full touch-pan-y">
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
            className="normie-sprite-hit absolute border-0 bg-transparent cursor-pointer touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 rounded"
            style={{
              backgroundImage: `url(${SPRITES_API}/normies/${n.tokenId}/sheet.png)`,
              padding: SPRITE_HIT_PAD,
              minWidth: 44,
              minHeight: 44,
            }}
            onClick={() => {
              onDiscover(n.tokenId);
              onAgentClick(n.tokenId);
            }}
            title={
              n.info?.tagline?.trim() ? `"${n.info.tagline}"` : n.name
            }
            aria-label={`Inspect ${n.name}`}
          />
        ))}

        {loungeNormies.map(n => (
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
              className={`text-[10px] sm:text-xs font-mono font-medium leading-tight flex items-center justify-center gap-0.5 ${
                pinnedIds.includes(n.tokenId)
                  ? "text-cyan-600 dark:text-cyan-400"
                  : "text-[var(--muted)]"
              }`}
            >
              {pinnedIds.includes(n.tokenId) ? (
                <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-cyan-500 text-cyan-500 shrink-0" />
              ) : null}
              <span>{trunc(n.name, 12)}</span>
            </div>
            {n.info?.canvas && (
              <div className="text-[9px] sm:text-[10px] font-mono text-[var(--faint)]">
                lv{n.info.canvas.level}
              </div>
            )}
          </div>
        ))}

        <style>{`
          .normie-sprite-hit {
            width: ${SPR_W + SPRITE_HIT_PAD * 2}px;
            height: ${SPR_H + SPRITE_HIT_PAD * 2}px;
            background-size: ${SHEET_CSS_W}px ${SPR_H}px;
            background-repeat: no-repeat;
            background-position: ${SPRITE_HIT_PAD}px ${SPRITE_HIT_PAD}px;
            background-origin: content-box;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            box-sizing: border-box;
          }
        `}</style>

        <AnimatePresence>
          {bubbles.map(b => (
            <motion.div
              key={b.id}
              ref={el => {
                if (el) bubbleRefs.current.set(b.id, el);
                else bubbleRefs.current.delete(b.id);
              }}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="absolute pointer-events-none"
              style={{ zIndex: 9999 }}
            >
              <div
                className={`rounded-md border px-2 py-1.5 shadow-md bg-[var(--white)] ${
                  b.active
                    ? "border-cyan-500/60"
                    : "border-[var(--border)] opacity-90"
                }`}
              >
                <p className="font-mono text-[10px] sm:text-xs text-[var(--muted)] leading-tight mb-0.5">
                  <span className="text-[var(--text)] font-medium">
                    {trunc(b.name, 12)}
                  </span>
                </p>
                <p className="font-body text-xs sm:text-sm text-[var(--text)] leading-snug break-words line-clamp-5">
                  {b.text}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {!loading && agents.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center bg-[var(--bg)]/95">
            <Bot className="w-10 h-10 text-[var(--faint)]" />
            <p className="text-sm font-mono text-[var(--muted)] max-w-sm">
              No agents are on-chain yet. Refresh once more have registered.
            </p>
          </div>
        )}

        {loading && !loungeIds.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--bg)]/80 backdrop-blur-[2px]">
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-7 h-10 sm:w-8 sm:h-12 border border-[var(--border)] rounded-md bg-[var(--surface)]"
                  animate={{ opacity: [0.15, 0.55, 0.15] }}
                  transition={{
                    duration: 1.2,
                    delay: i * 0.08,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>
            <p className="text-xs font-mono text-[var(--muted)] px-4 text-center inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Loading agents and personas…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
