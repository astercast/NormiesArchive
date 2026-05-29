import type { AgentInfo } from "@/components/AgentSection";
import { stableHash } from "./utils";

export interface ConvoTurn {
  speakerId: number;
  text: string;
}

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

function personaSeed(info?: AgentInfo): string {
  if (!info) return "";
  return [
    info.communicationStyle ?? "",
    ...(info.personalityTraits ?? []),
    ...(info.quirks ?? []),
  ].join("\u0001");
}

export function paceMult(info?: AgentInfo): number {
  const s = personaSeed(info);
  if (!s) return 1;
  return 0.55 + (stableHash(s) % 1000) / 1100;
}

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
  const traits = (info.personalityTraits ?? []).map(s => (s ?? "").trim()).filter(Boolean);
  const quirks = (info.quirks ?? []).map(s => (s ?? "").trim()).filter(Boolean);

  const backstoryLines = splitSentences(info.backstory ?? "").filter(
    s => s.length >= 12 && s.length <= 220
  );
  const promptLines = splitSentences(info.systemPrompt ?? "")
    .filter(s => s.length >= 14 && s.length <= 220)
    .filter(s => !IMPERATIVE_RE.test(s))
    .filter(s => !SECOND_PERSON_RE.test(s));

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

function pickFresh(pool: string[], used: Set<string>, seed: string): string | null {
  if (!pool.length) return null;
  const ranked = [...pool].sort(
    (a, b) => stableHash(seed + "|" + a) - stableHash(seed + "|" + b)
  );
  for (const line of ranked) {
    if (!isUsed(used, line)) return line;
  }
  return null;
}

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

function turnReply(ctx: TurnCtx): string {
  const { voice, partner, used, salt } = ctx;
  if (voice.greeting && !isUsed(used, voice.greeting)) {
    return take(used, ensurePunct(clip(voice.greeting)));
  }
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

function turnSelf(ctx: TurnCtx): string {
  const { voice, used, salt } = ctx;
  const self = pickFresh(voice.selfLines, used, `${voice.name}|s|${salt}`);
  if (self) return take(used, ensurePunct(clip(self)));
  if (voice.traits.length >= 3) {
    const ts = voice.traits.slice(0, 3).map(t => t.toLowerCase());
    return take(used, `${ts[0]}, ${ts[1]}, ${ts[2]} — that's about the shape of me.`);
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

export function buildScript(
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

/** Build a single-agent monologue from persona fields (for card previews). */
export function buildMonologue(info: AgentInfo, maxLines = 3): string[] {
  const v = buildVoice(info);
  const lines: string[] = [];
  if (v.greeting) lines.push(clip(v.greeting, 140));
  if (v.tagline && lines.length < maxLines) lines.push(clip(v.tagline, 120));
  for (const s of v.selfLines) {
    if (lines.length >= maxLines) break;
    lines.push(clip(s, 140));
  }
  return lines.slice(0, maxLines);
}
