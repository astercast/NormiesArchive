"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Bot,
  Lock,
  Search,
  RefreshCw,
  X,
  Users,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { AgentInfo } from "@/components/AgentSection";

/* ─── APIs ─────────────────────────────────────────────────────────────── */
const AGENTS_API = "https://api.normies.art";
const SPRITES_API = "https://fullnormies.vercel.app/api/v1";

/* ─── Sprite geometry (sheet: 7×40×80 native, SCALE=2) ────────────────── */
const SCALE = 2;
const SPR_W = 40 * SCALE;
const SPR_H = 80 * SCALE;
const ANC_X = 20 * SCALE;
const ANC_Y = 60 * SCALE;
const FOOT_BELOW = SPR_H - ANC_Y;
const SHEET_CSS_W = 7 * SPR_W;
const FRAME_PX = SPR_W;
const STAND_FRAME = 4;
const SIT_FRAME = 5;

/* ─── Lifecycle constants — slower and steadier ───────────────────────── */
const WALK_FRAME_MS = 160;
const BASE_SPEED = 0.75;
const TALK_DIST = SPR_W * 2.25;
const TURN_GAP_MS = 2900; // gap between each conversation turn
const TURNS_PER_CONV = 5; // multi-turn flow
const TALK_MS = TURN_GAP_MS * (TURNS_PER_CONV - 1) + 3400; // ~15s total
const CONV_COOL = 5500; // minimum gap between starting new conversations
const MAX_TALKS = 4;
const ROTATE_MS = 90_000; // shuffle floor every 90s (was 20s)
const BATCH_SZ = 5;
const MAX_FETCH = 500;
const CHAT_MAX = 24;
const REG_PAGE_SIZE = 60;
const IDLE_BASE = 0.0002;
const IDLE_MIN_MS = 1100;
const IDLE_MAX_MS = 2700;
const PASSCODE = "4356";
const LS_KEY = "nl_unlocked_v3";

/* ─── Types ───────────────────────────────────────────────────────────── */
interface AgentItem {
  agentId: string;
  tokenId: string;
  name: string;
  type: string;
}

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
}

interface Bubble {
  id: string;
  tokenId: number;
  name: string;
  text: string;
  x: number;
  y: number;
  active: boolean;
}

interface ConvoTurn {
  speakerId: number;
  text: string;
}

interface Convo {
  id: string;
  aId: number;
  bId: number;
  script: ConvoTurn[];
  turn: number; // next turn index to fire (0..script.length)
  nextTurnAt: number;
  endsAt: number;
}

interface ChatLine {
  who: string;
  text: string;
}

interface ChatEntry {
  id: string;
  ts: number;
  aName: string;
  bName: string;
  lines: ChatLine[];
}

/* ─── Persona helpers ─────────────────────────────────────────────────── */
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

function paceMult(info?: AgentInfo): number {
  const s = personaSeed(info);
  if (!s) return 1;
  return 0.55 + (stableHash(s) % 1000) / 1100;
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

/* ─── Voice corpus & dialogue engine ──────────────────────────────────── */
/**
 * Every line an agent speaks comes from their own published persona text.
 * We never stitch templates around their name — we surface the sentences
 * they actually wrote, picking the most evocative one for each turn while
 * tracking what's already been said so a single conversation never repeats.
 *
 * Sources, in order of preference:
 *   greeting           → literal opening line (used for hellos)
 *   tagline            → catchphrase (used for closes / asides)
 *   backstory          → mined sentence-by-sentence for self-reveals
 *   systemPrompt       → narrative sentences only (no imperatives to the LLM)
 *   communicationStyle → fallback self-reveal
 *   quirks             → behavioural asides
 *   personalityTraits  → tiny self-description if no prose exists
 */
interface Voice {
  name: string;
  type: string;
  greeting: string;
  tagline: string;
  style: string;
  traits: string[];
  quirks: string[];
  selfLines: string[];
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[A-Z"'(\[])/;
const IMPERATIVE_RE =
  /^(speak|don'?t|do not|avoid|never|always|be |become|remember|note|do |when |if |try |use |make |keep |stay |feel |think |consider )/i;
const SECOND_PERSON_RE = /\byou\s+(are|will|must|should|can|never|always)\b/i;

function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE_SPLIT)
    .map(s => s.trim())
    .filter(Boolean);
}

function clip(text: string, max = 180): string {
  const s = text.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max - 40 ? cut.slice(0, sp) : cut) + "…";
}

function ensurePunct(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return /[.!?…]$/.test(t) ? t : t + ".";
}

function buildVoice(info?: AgentInfo): Voice {
  if (!info) {
    return {
      name: "",
      type: "",
      greeting: "",
      tagline: "",
      style: "",
      traits: [],
      quirks: [],
      selfLines: [],
    };
  }
  const greeting = (info.greeting ?? "").trim();
  const tagline = (info.tagline ?? "").trim();
  const style = (info.communicationStyle ?? "").trim();
  const traits = (info.personalityTraits ?? [])
    .map(s => (s ?? "").trim())
    .filter(Boolean);
  const quirks = (info.quirks ?? [])
    .map(s => (s ?? "").trim())
    .filter(Boolean);

  // Backstory sentences read as authentic self-narrative.
  const backstoryLines = splitSentences(info.backstory ?? "").filter(
    s => s.length >= 12 && s.length <= 220
  );

  // System-prompt sentences, but only narrative ones (skip imperatives
  // directed at the LLM like "Speak softly." or "Avoid mentioning X.").
  const promptLines = splitSentences(info.systemPrompt ?? "")
    .filter(s => s.length >= 14 && s.length <= 220)
    .filter(s => !IMPERATIVE_RE.test(s))
    .filter(s => !SECOND_PERSON_RE.test(s));

  // De-duplicate while preserving order: backstory first (richest source),
  // then prompt narrative, then comm-style as a final self-reveal option.
  const selfLines: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    const k = line.toLowerCase();
    if (!seen.has(k) && line) {
      seen.add(k);
      selfLines.push(line);
    }
  };
  backstoryLines.forEach(push);
  promptLines.forEach(push);
  if (style) push(style);

  return {
    name: (info.name ?? "").trim(),
    type: info.type ?? "",
    greeting,
    tagline,
    style,
    traits,
    quirks,
    selfLines,
  };
}

interface TurnCtx {
  voice: Voice;
  partner: Voice;
  used: Set<string>;
  salt: number;
}

function lineKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function take(used: Set<string>, line: string): string {
  used.add(lineKey(line));
  return line;
}

function isUsed(used: Set<string>, line: string): boolean {
  return used.has(lineKey(line));
}

/** Deterministically pick the first un-used line from a pool. */
function pickFresh(
  pool: string[],
  used: Set<string>,
  seed: string
): string | null {
  if (!pool.length) return null;
  const ranked = [...pool].sort(
    (a, b) =>
      stableHash(seed + "|" + a) - stableHash(seed + "|" + b)
  );
  for (const line of ranked) {
    if (!isUsed(used, line)) return line;
  }
  return null;
}

/** A opens — use their literal greeting if they have one. */
function turnOpen(ctx: TurnCtx): string {
  const { voice, partner, used, salt } = ctx;
  if (voice.greeting && !isUsed(used, voice.greeting)) {
    return take(used, ensurePunct(clip(voice.greeting)));
  }
  if (voice.tagline && !isUsed(used, voice.tagline)) {
    const line = ensurePunct(clip(voice.tagline));
    return take(used, partner.name ? `${partner.name}. ${line}` : line);
  }
  const self = pickFresh(voice.selfLines, used, `${voice.name}|o|${salt}`);
  if (self) return take(used, ensurePunct(clip(self)));
  if (partner.name) return take(used, `…${partner.name}.`);
  if (voice.name) return take(used, `${voice.name}.`);
  return take(used, "…");
}

/** B greets back — also use their own greeting if available. */
function turnReply(ctx: TurnCtx): string {
  const { voice, partner, used, salt } = ctx;
  if (voice.greeting && !isUsed(used, voice.greeting)) {
    return take(used, ensurePunct(clip(voice.greeting)));
  }
  // Else acknowledge the partner with a self-line.
  const self = pickFresh(voice.selfLines, used, `${voice.name}|r|${salt}`);
  if (self) {
    const body = clip(self, 150);
    const out = partner.name ? `${partner.name} — ${body}` : body;
    return take(used, ensurePunct(out));
  }
  if (voice.tagline && !isUsed(used, voice.tagline)) {
    return take(used, ensurePunct(clip(voice.tagline)));
  }
  if (voice.traits.length >= 2) {
    const ts = voice.traits.slice(0, 2).map(t => t.toLowerCase());
    return take(used, `${ts[0]} and ${ts[1]}, mostly. That's me.`);
  }
  if (voice.name) return take(used, partner.name ? `Hi, ${partner.name}.` : `${voice.name}.`);
  return take(used, "Hello.");
}

/** A reveals something authentic about themselves. */
function turnSelf(ctx: TurnCtx): string {
  const { voice, used, salt } = ctx;
  const self = pickFresh(voice.selfLines, used, `${voice.name}|s|${salt}`);
  if (self) return take(used, ensurePunct(clip(self)));
  if (voice.traits.length >= 3) {
    const ts = voice.traits.slice(0, 3).map(t => t.toLowerCase());
    return take(
      used,
      `${ts[0]}, ${ts[1]}, ${ts[2]} — that's about the shape of me.`
    );
  }
  if (voice.traits.length === 2) {
    const ts = voice.traits.map(t => t.toLowerCase());
    return take(used, `${ts[0]} and ${ts[1]} — that's about it.`);
  }
  if (voice.traits.length === 1) {
    return take(used, `${voice.traits[0].toLowerCase()}, mostly.`);
  }
  if (voice.tagline && !isUsed(used, voice.tagline)) {
    return take(used, ensurePunct(clip(voice.tagline)));
  }
  return take(used, "…");
}

/** B shares a quirk or another self-line — a candid aside. */
function turnAside(ctx: TurnCtx): string {
  const { voice, used, salt } = ctx;
  const quirk = pickFresh(voice.quirks, used, `${voice.name}|q|${salt}`);
  if (quirk) return take(used, ensurePunct(clip(quirk)));
  const self = pickFresh(voice.selfLines, used, `${voice.name}|s2|${salt}`);
  if (self) return take(used, ensurePunct(clip(self)));
  if (voice.style && !isUsed(used, voice.style)) {
    return take(used, ensurePunct(clip(voice.style)));
  }
  if (voice.tagline && !isUsed(used, voice.tagline)) {
    return take(used, ensurePunct(clip(voice.tagline)));
  }
  return take(used, "…");
}

/** A closes with their tagline — their signature parting line. */
function turnClose(ctx: TurnCtx): string {
  const { voice, partner, used, salt } = ctx;
  if (voice.tagline && !isUsed(used, voice.tagline)) {
    return take(used, ensurePunct(clip(voice.tagline)));
  }
  const self = pickFresh(voice.selfLines, used, `${voice.name}|c|${salt}`);
  if (self) return take(used, ensurePunct(clip(self)));
  if (voice.greeting && !isUsed(used, voice.greeting)) {
    return take(used, ensurePunct(clip(voice.greeting)));
  }
  if (partner.name) return take(used, `Walk well, ${partner.name}.`);
  return take(used, "Walk well.");
}

function buildScript(
  idA: number,
  idB: number,
  infoA: AgentInfo | undefined,
  infoB: AgentInfo | undefined,
  salt: number
): ConvoTurn[] {
  const va = buildVoice(infoA);
  const vb = buildVoice(infoB);
  const used = new Set<string>();
  const ctxA: TurnCtx = { voice: va, partner: vb, used, salt };
  const ctxB: TurnCtx = { voice: vb, partner: va, used, salt };
  return [
    { speakerId: idA, text: turnOpen(ctxA) },
    { speakerId: idB, text: turnReply(ctxB) },
    { speakerId: idA, text: turnSelf(ctxA) },
    { speakerId: idB, text: turnAside(ctxB) },
    { speakerId: idA, text: turnClose(ctxA) },
  ];
}

/* ─── Bodies ──────────────────────────────────────────────────────────── */
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
  const speed = (0.3 + Math.random() * 0.9) * BASE_SPEED * p;
  const rv = () => (Math.random() < 0.5 ? speed : -speed);
  const fy = minFy + Math.random() * Math.max(1, maxFy - minFy);
  if (edge) {
    const left = Math.random() < 0.5;
    return {
      fx: left ? minFx : maxFx,
      fy,
      vx: left ? Math.abs(speed) : -Math.abs(speed),
      vy: (Math.random() - 0.5) * 0.26 * p,
      facing: left ? 1 : -1,
      state: "walk",
      stateUntil: 0,
      partnerId: null,
      convoId: null,
    };
  }
  return {
    fx: minFx + Math.random() * Math.max(1, maxFx - minFx),
    fy,
    vx: rv(),
    vy: rv() * 0.3,
    facing: Math.random() < 0.5 ? 1 : -1,
    state: "walk",
    stateUntil: 0,
    partnerId: null,
    convoId: null,
  };
}

function rvPostTalk(info?: AgentInfo): { vx: number; vy: number } {
  const p = paceMult(info);
  const s = (0.35 + Math.random() * 0.85) * BASE_SPEED * p;
  const vx = Math.random() < 0.5 ? s : -s;
  const vy = (Math.random() - 0.5) * 0.3 * p;
  return { vx, vy };
}

/* ═══════════════════════════════════════════════════════════════════════
   LOCK SCREEN
═══════════════════════════════════════════════════════════════════════ */
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
            success ? "text-cyan-500" : "text-[var(--muted)]"
          }`}
        />
        <p className="text-[11px] sm:text-xs font-mono text-[var(--faint)] uppercase tracking-[0.25em]">
          agentic lounge
        </p>
        <p className="text-[10px] font-mono text-[var(--faint)] max-w-xs">
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
                    ? "border-[var(--text)] bg-[var(--surface)] text-[var(--text)]"
                    : i === digits.length
                      ? "border-[var(--muted)] bg-[var(--surface)] text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--faint)]"
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
                ? "border-[var(--border)] text-[var(--muted)] active:bg-[var(--surface)] hover:border-[var(--text)] hover:text-[var(--text)]"
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
   LOUNGE ROOM
═══════════════════════════════════════════════════════════════════════ */
function LoungeRoom() {
  /* React state */
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [infoMap, setInfoMap] = useState<Map<number, AgentInfo>>(new Map());
  const [loungeIds, setLoungeIds] = useState<number[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [secToShuffle, setSecToShuffle] = useState(Math.ceil(ROTATE_MS / 1000));
  const [infoProgress, setInfoProgress] = useState(0);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [regPage, setRegPage] = useState(1);
  const [stageW, setStageW] = useState(360);

  /* Refs (mutable, rAF-friendly) */
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
  const stageHRef = useRef(420);
  const capRef = useRef(12);
  const walkFrames = useRef<Map<number, number>>(new Map());
  const convosRef = useRef<Convo[]>([]);
  const convCount = useRef(0);
  const lastConvAt = useRef(-CONV_COOL);
  const lastCheck = useRef(0);
  const pairSalt = useRef(0);
  const nextShuffleAt = useRef(0);

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

  /* Init refs that need browser-time */
  useEffect(() => {
    nextShuffleAt.current = Date.now() + ROTATE_MS;
  }, []);

  /* Dark mode observer */
  useEffect(() => {
    const chk = () => {
      const d = document.documentElement.classList.contains("dark");
      setDark(d);
      darkRef.current = d;
    };
    chk();
    const mo = new MutationObserver(chk);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => mo.disconnect();
  }, []);

  /* Stage size observer */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => {
      stageHRef.current = Math.max(280, el.clientHeight);
      setStageW(Math.max(120, el.clientWidth));
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [loading]);

  /* Responsive stage cap */
  useEffect(() => {
    const sync = () => {
      const c = computeStageCap(window.innerWidth);
      capRef.current = c;
      setLoungeIds(prev => {
        if (prev.length <= c) return prev;
        const locked = prev.filter(
          id => bodies.current.get(id)?.state === "talk"
        );
        const others = prev.filter(id => !locked.includes(id));
        const need = Math.max(0, c - locked.length);
        return [...locked, ...others.slice(0, need)];
      });
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  /* Cleanup deleted bodies */
  useEffect(() => {
    for (const id of [...bodies.current.keys()]) {
      if (!loungeIds.includes(id)) bodies.current.delete(id);
    }
  }, [loungeIds]);

  /* ── Bring agent onto stage ── */
  const bringToStage = useCallback(
    (
      tokenId: number,
      opts?: { fromEdge?: boolean; openSheet?: boolean }
    ) => {
      const fromEdge = opts?.fromEdge ?? true;
      const openSheet = opts?.openSheet ?? false;
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

  /* ── Initial data fetch — agents + bindings + personas ── */
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
        const cap = capRef.current;
        const sh = stageHRef.current;
        const cw = stageRef.current?.clientWidth ?? 360;
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
                const r = await fetch(
                  `${AGENTS_API}/agents/info/${item.tokenId}`
                );
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

  /* ── Slow floor rotation ── */
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
        if (!removable.length) return prev;
        // swap just one at a time, gently
        const drop =
          removable[Math.floor(Math.random() * removable.length)];
        const next = prev.filter(id => id !== drop);
        const avail = pool.filter(
          a => !next.includes(Number(a.tokenId))
        );
        if (avail.length) {
          const pick =
            avail[Math.floor(Math.random() * Math.min(avail.length, 64))];
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

  /* ── Shuffle countdown ── */
  useEffect(() => {
    const tick = () => {
      setSecToShuffle(
        Math.max(
          0,
          Math.ceil((nextShuffleAt.current - Date.now()) / 1000)
        )
      );
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  /* ── Sprite walk-frame ticker ── */
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

  /* ── Main rAF loop: physics + conversation engine + canvas BG ── */
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

      /* ── PHYSICS ── */
      for (const id of ids) {
        const inf = infos.get(id);
        if (!bods.has(id)) bods.set(id, mkBody(cw, sh, inf, false));
        const b = bods.get(id)!;

        if (b.state === "talk") {
          // Stand still while talking — conversation handler manages release
          continue;
        }
        if (b.state === "idle") {
          if (now > b.stateUntil) {
            b.state = "walk";
            const { vx, vy } = rvPostTalk(inf);
            b.vx = vx;
            b.vy = vy;
          }
          continue;
        }

        // Walking — small chance of an idle pause
        if (Math.random() < IDLE_BASE * (dt / 16)) {
          b.state = "idle";
          b.stateUntil = now + IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
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
      }

      /* ── CONVERSATION ENGINE ── */
      const convos = convosRef.current;
      // 1) Advance each active convo's turns
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
                  x: body.fx,
                  y: body.fy - ANC_Y,
                  active: true,
                },
              ];
            });
          }
          c.turn += 1;
          c.nextTurnAt = now + TURN_GAP_MS;
        }
      }
      // 2) End completed conversations
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
          const { vx, vy } = rvPostTalk(ai);
          bA.vx = vx;
          bA.vy = vy;
        }
        if (bB) {
          bB.state = "walk";
          bB.partnerId = null;
          bB.convoId = null;
          const { vx, vy } = rvPostTalk(bi);
          bB.vx = vx;
          bB.vy = vy;
        }
        convos.splice(i, 1);
        convCount.current = Math.max(0, convCount.current - 1);

        // Log the conversation
        setChatLog(prev =>
          [
            {
              id: c.id,
              ts: Date.now(),
              aName: ai?.name ?? `#${c.aId}`,
              bName: bi?.name ?? `#${c.bId}`,
              lines: c.script.map(t => ({
                who: infos.get(t.speakerId)?.name ?? `#${t.speakerId}`,
                text: t.text,
              })),
            },
            ...prev,
          ].slice(0, CHAT_MAX)
        );
        // Fade out bubbles
        const ids2 = [c.aId, c.bId];
        setTimeout(() => {
          setBubbles(prev => prev.filter(b => !ids2.includes(b.tokenId)));
        }, 600);
      }
      // 3) Start new conversation if eligible
      if (
        convCount.current < MAX_TALKS &&
        now - lastConvAt.current > CONV_COOL &&
        now - lastCheck.current > 120
      ) {
        lastCheck.current = now;
        const candidates = ids
          .map(id => ({ id, b: bods.get(id) }))
          .filter(x => x.b?.state === "walk");
        outer: for (let i = 0; i < candidates.length; i++) {
          for (let j = i + 1; j < candidates.length; j++) {
            const { id: idA, b: bA } = candidates[i];
            const { id: idB, b: bB } = candidates[j];
            if (!bA || !bB) continue;
            if (
              Math.hypot(bA.fx - bB.fx, bA.fy - bB.fy) >= TALK_DIST
            )
              continue;
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
              nextTurnAt: now, // first turn fires immediately
              endsAt,
            });
            // Freeze both bodies
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
            break outer;
          }
        }
      }

      /* ── Sprite DOM positions ── */
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

      /* ── Live bubble positioning ── */
      setBubbles(prev => {
        let changed = false;
        const next = prev.map(b => {
          const body = bods.get(b.tokenId);
          if (!body) return b;
          const nx = body.fx;
          const ny = body.fy - ANC_Y;
          if (Math.abs(nx - b.x) > 0.5 || Math.abs(ny - b.y) > 0.5) {
            changed = true;
            return { ...b, x: nx, y: ny };
          }
          return b;
        });
        return changed ? next : prev;
      });

      /* ── Background canvas ── */
      if (canvas && stage) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = cw;
          canvas.height = sh;
          ctx.clearRect(0, 0, cw, sh);
          // Dot grid
          ctx.fillStyle = isDark
            ? "rgba(6,182,212,0.04)"
            : "rgba(0,0,0,0.025)";
          for (let gx = 16; gx < cw; gx += 24) {
            for (let gy = 16; gy < sh; gy += 24) {
              ctx.fillRect(gx, gy, 1, 1);
            }
          }
          // Floor glow
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

          // Conversation link lines
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

  /* Derived data */
  const agentsByToken = useMemo(() => {
    const m = new Map<number, AgentItem>();
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

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return [] as AgentItem[];
    return agents
      .filter(a => {
        const tid = String(a.tokenId);
        const displayName = (
          infoMap.get(Number(a.tokenId))?.name ?? a.name
        ).toLowerCase();
        return displayName.includes(q) || tid.includes(q);
      })
      .slice(0, 8);
  }, [agents, query, infoMap]);

  const focusInfo = focusId != null ? infoMap.get(focusId) : null;
  const focusAgent =
    focusId != null
      ? agents.find(a => Number(a.tokenId) === focusId)
      : null;

  const regTotal = agents.length;
  const regShown = Math.min(regPage * REG_PAGE_SIZE, regTotal);
  const regSlice = agents.slice(0, regShown);

  /* ─── Render ─── */
  return (
    <div className="relative">
      {/* ambient bg */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-50 dark:opacity-30"
        aria-hidden
        style={{
          background: `
            radial-gradient(900px 500px at 8% 0%, rgba(6,182,212,0.10), transparent 55%),
            radial-gradient(700px 400px at 92% 30%, rgba(139,92,246,0.07), transparent 50%)`,
        }}
      />

      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-7 space-y-4">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <Sparkles className="w-4 h-4 text-cyan-500" />
            <h1 className="font-mono text-base sm:text-lg font-medium text-[var(--text)] tracking-tight">
              agentic lounge
            </h1>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-400/45 text-cyan-700 dark:text-cyan-300 bg-cyan-50/80 dark:bg-cyan-950/40">
              ERC-8004
            </span>
          </div>
          {loading ? (
            <span className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] text-[10px] font-mono inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              loading agents…
            </span>
          ) : (
            <>
              <span
                className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] text-[10px] font-mono tabular-nums"
                title="Agents on-chain and eligible for this lounge"
              >
                {agents.length} agents
              </span>
              <span
                className="hidden sm:inline-flex px-2 py-1 rounded-md border border-cyan-400/40 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 text-[10px] font-mono tabular-nums"
                title="On the floor right now"
              >
                {loungeIds.length} on floor
              </span>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] text-[10px] font-mono"
                title="Shuffle gently rotates the floor"
              >
                <RefreshCw className="w-3 h-3 opacity-70" />
                <span className="tabular-nums">
                  shuffle {secToShuffle}s
                </span>
                <div className="w-10 h-1 rounded-full bg-[var(--border)] overflow-hidden">
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
            </>
          )}
        </header>

        {/* ── Single-line intro ── */}
        <p className="text-[11px] sm:text-xs font-mono text-[var(--muted)] leading-relaxed max-w-3xl">
          Agents wander, bump into each other, and hold short conversations
          using their <span className="text-[var(--text)]">published personas</span>.
          Search to summon anyone — tap a sprite for their full profile.
        </p>

        {/* ── Search bar ── */}
        {!loading && agents.length > 0 && (
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--faint)] pointer-events-none" />
            <input
              type="search"
              autoComplete="off"
              placeholder="Search any agent by name or # to add to the floor…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs font-mono bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none focus:border-cyan-500/50"
            />
            {query.trim().length > 0 && (
              <ul className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--white)] shadow-lg py-1">
                {searchHits.length === 0 ? (
                  <li className="px-3 py-2 text-[10px] font-mono text-[var(--faint)]">
                    No match — try another name or #.
                  </li>
                ) : (
                  searchHits.map(a => {
                    const tid = Number(a.tokenId);
                    const inf = infoMap.get(tid);
                    const label = inf?.name ?? a.name;
                    return (
                      <li key={tid}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-[var(--surface)] flex items-center justify-between gap-2"
                          onClick={() => {
                            bringToStage(tid, {
                              fromEdge: true,
                              openSheet: false,
                            });
                            setQuery("");
                          }}
                        >
                          <span className="text-[var(--text)] truncate">
                            {label}
                          </span>
                          <span className="text-[10px] text-[var(--faint)] shrink-0 tabular-nums">
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

        {/* ── Stage + chat feed ── */}
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 items-stretch">
          <div
            className="relative flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-sm overflow-hidden ring-1 ring-black/[0.03] dark:ring-white/[0.05]"
            style={{
              minHeight: "min(60vh, 560px)",
              height: "min(60vh, 560px)",
            }}
          >
            <div
              ref={stageRef}
              className="relative w-full h-full touch-pan-y"
            >
              <canvas
                ref={bgCanvasRef}
                className="absolute inset-0 pointer-events-none"
              />

              {/* Sprites */}
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
                    setFocusId(n.tokenId);
                  }}
                  title={
                    n.info?.tagline?.trim() ? `"${n.info.tagline}"` : n.name
                  }
                  aria-label={`Inspect ${n.name}`}
                />
              ))}

              {/* Name tags */}
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
                    className={`text-[6px] sm:text-[7px] font-mono font-medium leading-tight ${
                      focusId === n.tokenId
                        ? "text-cyan-500"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {trunc(n.name, 12)}
                  </div>
                  {n.info?.canvas && (
                    <div className="text-[5px] sm:text-[6px] font-mono text-[var(--faint)]">
                      lv{n.info.canvas.level}
                    </div>
                  )}
                </div>
              ))}

              {/* Sprite CSS */}
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

              {/* Speech bubbles */}
              <AnimatePresence>
                {bubbles.map(b => {
                  const cw = stageW;
                  const bw = Math.min(160, cw - 12);
                  const left = Math.max(
                    4,
                    Math.min(b.x - bw / 2, cw - bw - 4)
                  );
                  const top = Math.max(2, b.y - 60);
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -3, scale: 0.97 }}
                      transition={{ duration: 0.16 }}
                      className="absolute pointer-events-none"
                      style={{
                        left,
                        top,
                        width: bw,
                        zIndex: 9999,
                      }}
                    >
                      <div
                        className={`rounded-md border px-1.5 py-1 shadow-md bg-[var(--white)] ${
                          b.active
                            ? "border-cyan-500/60"
                            : "border-[var(--border)] opacity-90"
                        }`}
                      >
                        <p className="font-mono text-[6.5px] text-[var(--muted)] leading-tight mb-0.5">
                          <span className="text-[var(--text)] font-medium">
                            {trunc(b.name, 12)}
                          </span>
                        </p>
                        <p className="font-body text-[8.5px] sm:text-[9px] text-[var(--text)] leading-snug break-words line-clamp-5">
                          {b.text}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Empty + loading overlays */}
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
                  <p className="text-xs font-mono text-[var(--muted)] px-4 text-center">
                    Loading agents and personas…
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chat feed sidebar */}
          <aside
            className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden max-h-[min(40vh,360px)] lg:max-h-[min(60vh,560px)] lg:h-[min(60vh,560px)]"
          >
            <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-2 flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider">
                recent conversations
              </span>
              {chatLog.length > 0 && (
                <span className="ml-auto text-[10px] font-mono text-[var(--faint)] tabular-nums">
                  {chatLog.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-[var(--border)] min-h-[120px]">
              {chatLog.length === 0 && !loading && (
                <p className="text-[10px] font-mono text-[var(--faint)] p-3 leading-relaxed">
                  Conversations appear here when two agents meet on the floor —
                  with each turn quoted in full.
                </p>
              )}
              {chatLog.map(entry => (
                <div key={entry.id} className="px-3 py-2.5 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-mono font-medium text-[var(--text)] truncate">
                      <span className="text-cyan-600 dark:text-cyan-400">
                        {trunc(entry.aName, 16)}
                      </span>
                      <span className="text-[var(--faint)] mx-1">↔</span>
                      <span className="text-[var(--muted)]">
                        {trunc(entry.bName, 16)}
                      </span>
                    </p>
                    <span className="text-[9px] font-mono text-[var(--faint)] shrink-0">
                      {timeAgo(entry.ts)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {entry.lines.map((ln, i) => (
                      <li
                        key={i}
                        className="text-[10px] leading-snug font-body"
                      >
                        <span className="font-mono text-[8.5px] text-[var(--faint)] mr-1">
                          {trunc(ln.who, 12)}:
                        </span>
                        <span className="text-[var(--text)]">{ln.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* ── Browse drawer ── */}
        {agents.length > 0 && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <button
              type="button"
              onClick={() => setBrowseOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--surface)] transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              <span className="text-[11px] font-mono text-[var(--text)] uppercase tracking-wider">
                browse all agents
              </span>
              <span className="text-[10px] font-mono text-[var(--faint)] tabular-nums">
                {regTotal}
                {infoProgress < regTotal &&
                  ` · loading ${infoProgress}/${regTotal}`}
              </span>
              {browseOpen ? (
                <ChevronUp className="w-3 h-3 text-[var(--faint)] ml-auto" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[var(--faint)] ml-auto" />
              )}
            </button>
            {browseOpen && (
              <div className="p-3 border-t border-[var(--border)] space-y-3">
                <p className="text-[10px] font-mono text-[var(--faint)]">
                  Tap a portrait — they walk in from the edge of the floor.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-1.5 sm:gap-2">
                  {regSlice.map(a => {
                    const tid = Number(a.tokenId);
                    const on = loungeIds.includes(tid);
                    const inf = infoMap.get(tid);
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() =>
                          bringToStage(tid, {
                            fromEdge: true,
                            openSheet: false,
                          })
                        }
                        className={`relative flex flex-col items-center gap-0.5 p-1.5 sm:p-1 rounded-lg border min-h-[72px] sm:min-h-0 transition-colors touch-manipulation ${
                          on
                            ? "border-cyan-400/60 bg-cyan-50 dark:bg-cyan-950/40"
                            : "border-[var(--border)] active:bg-[var(--surface)] hover:border-[var(--muted)]"
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
                        <span className="text-[6px] sm:text-[7px] font-mono text-[var(--faint)] text-center line-clamp-2 leading-tight w-full px-0.5">
                          {trunc(inf?.name ?? a.name, 10)}
                        </span>
                        {on && (
                          <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-cyan-500 ring-2 ring-[var(--bg)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {regShown < regTotal && (
                  <button
                    type="button"
                    onClick={() => setRegPage(p => p + 1)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] text-[11px] font-mono text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg px-4 py-2 mx-auto transition-colors"
                  >
                    load more
                    <span className="text-[var(--faint)]">
                      ({regTotal - regShown})
                    </span>
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="text-[9.5px] font-mono text-[var(--faint)] pt-3 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span className="inline-flex items-center gap-1.5">
            <Bot className="w-3 h-3 shrink-0" />
            Lines pulled from each persona&apos;s API fields, woven into a
            mini exchange.
          </span>
          <span className="sm:ml-auto flex flex-wrap gap-x-3 gap-y-1">
            <a
              className="underline underline-offset-2 hover:text-[var(--muted)]"
              href="https://fullnormies.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              sprites
            </a>
            <a
              className="underline underline-offset-2 hover:text-[var(--muted)]"
              href="https://api.normies.art"
              target="_blank"
              rel="noopener noreferrer"
            >
              agents API
            </a>
          </span>
        </footer>
      </div>

      {/* ── Focus modal ── */}
      <AnimatePresence>
        {focusId != null && (focusInfo || focusAgent) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setFocusId(null)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-[var(--border)] bg-[var(--white)] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${AGENTS_API}/normie/${focusId}/image.svg`}
                    alt=""
                    width={56}
                    height={56}
                    className="w-14 h-14 object-contain pixelated shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1"
                    style={{ filter: dark ? "invert(1)" : "none" }}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-base sm:text-lg font-medium text-[var(--text)] truncate">
                      {focusInfo?.name ?? focusAgent?.name ?? `#${focusId}`}
                    </h2>
                    <p className="text-[10px] font-mono text-[var(--faint)] tabular-nums">
                      #{focusId}
                      {focusInfo?.type && focusInfo.type !== "Human"
                        ? ` · ${focusInfo.type.toLowerCase()}`
                        : ""}
                      {focusInfo?.canvas
                        ? ` · lv${focusInfo.canvas.level}`
                        : ""}
                    </p>
                    {focusInfo?.tagline && (
                      <p className="text-[11px] font-mono text-[var(--muted)] italic mt-1 line-clamp-3">
                        &ldquo;{focusInfo.tagline}&rdquo;
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusId(null)}
                    className="text-[var(--faint)] hover:text-[var(--text)] p-1 shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (focusId == null) return;
                    bringToStage(focusId, {
                      fromEdge: true,
                      openSheet: false,
                    });
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 text-xs font-mono rounded-md bg-cyan-600 text-white hover:bg-cyan-500 dark:bg-cyan-700 dark:hover:bg-cyan-600 transition-colors"
                >
                  {focusId != null && loungeIds.includes(focusId)
                    ? "Already on floor"
                    : "Put on floor"}
                </button>

                {focusInfo?.greeting && (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                    <p className="text-[9px] font-mono text-[var(--faint)] uppercase tracking-wider mb-1">
                      their greeting
                    </p>
                    <p className="text-[11px] font-body text-[var(--text)] leading-relaxed">
                      &ldquo;{focusInfo.greeting}&rdquo;
                    </p>
                  </div>
                )}

                {focusInfo?.backstory && (
                  <div>
                    <p className="text-[9px] font-mono text-[var(--faint)] uppercase tracking-wider mb-1">
                      backstory
                    </p>
                    <p className="text-[11px] font-body text-[var(--muted)] leading-relaxed line-clamp-5">
                      {focusInfo.backstory}
                    </p>
                  </div>
                )}

                {focusInfo?.communicationStyle && (
                  <div>
                    <p className="text-[9px] font-mono text-[var(--faint)] uppercase tracking-wider mb-1">
                      communication style
                    </p>
                    <p className="text-[11px] font-body text-[var(--muted)] leading-relaxed line-clamp-3">
                      {focusInfo.communicationStyle}
                    </p>
                  </div>
                )}

                {(focusInfo?.personalityTraits?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[9px] font-mono text-[var(--faint)] uppercase tracking-wider mb-1.5">
                      personality
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {focusInfo!.personalityTraits!.map((t, i) => (
                        <span
                          key={`pt-${focusId}-${i}`}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(focusInfo?.quirks?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[9px] font-mono text-[var(--faint)] uppercase tracking-wider mb-1.5">
                      quirks
                    </p>
                    <ul className="space-y-1">
                      {focusInfo!.quirks!.map((q, i) => (
                        <li
                          key={`qk-${focusId}-${i}`}
                          className="text-[11px] font-body text-[var(--muted)] leading-snug flex gap-1.5"
                        >
                          <span className="text-[var(--faint)] mt-0.5">·</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`/normie/${focusId}`}
                    className="inline-flex items-center justify-center min-h-[40px] px-3 text-[11px] font-mono rounded-md border border-[var(--border)] text-[var(--text)] hover:border-[var(--text)]"
                  >
                    open normie page
                  </Link>
                  <a
                    href={`${AGENTS_API}/agents/info/${focusId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center min-h-[40px] px-3 text-[11px] font-mono rounded-md border border-[var(--border)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                  >
                    raw persona
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Root — passcode gate
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
