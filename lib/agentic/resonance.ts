import type { AgentInfo } from "@/components/AgentSection";
import type { PersonaPreview } from "./types";
import { stableHash } from "./utils";

export interface ResonanceResult {
  score: number; // 0–100
  sharedTraits: string[];
  sharedTypes: boolean;
  label: string; // "high resonance" | "unlikely pair" | etc.
}

function traitTokens(info?: AgentInfo | PersonaPreview | null): string[] {
  if (!info) return [];
  const traits = info.personalityTraits ?? [];
  return traits.map(t =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 4)
  ).flat();
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

export function computeResonance(
  infoA?: AgentInfo | PersonaPreview | null,
  infoB?: AgentInfo | PersonaPreview | null
): ResonanceResult {
  const tokensA = traitTokens(infoA);
  const tokensB = traitTokens(infoB);
  const traitOverlap = jaccard(tokensA, tokensB);

  const sharedTraits: string[] = [];
  if (infoA?.personalityTraits && infoB?.personalityTraits) {
    for (const ta of infoA.personalityTraits) {
      for (const tb of infoB.personalityTraits) {
        const wa = ta.toLowerCase().slice(0, 12);
        const wb = tb.toLowerCase().slice(0, 12);
        if (wa === wb || ta.toLowerCase().includes(wb.slice(0, 8))) {
          sharedTraits.push(ta.length <= tb.length ? ta : tb);
        }
      }
    }
  }

  const typeA = infoA?.type ?? "";
  const typeB = infoB?.type ?? "";
  const sharedTypes = typeA === typeB && typeA !== "";
  const typeBonus = sharedTypes ? 0.15 : typeA && typeB && typeA !== typeB ? 0.08 : 0;

  const quirkBonus =
    (infoA?.quirks?.length ?? 0) > 0 && (infoB?.quirks?.length ?? 0) > 0 ? 0.05 : 0;

  const raw = traitOverlap * 0.65 + typeBonus + quirkBonus;
  const salt = stableHash(`${infoA?.name ?? ""}|${infoB?.name ?? ""}`) % 17;
  const score = Math.min(100, Math.round(raw * 100 + salt * 0.8));

  let label = "neutral field";
  if (score >= 72) label = "high resonance";
  else if (score >= 48) label = "harmonic drift";
  else if (score >= 28) label = "unlikely pair";
  else label = "distant frequencies";

  return {
    score,
    sharedTraits: [...new Set(sharedTraits)].slice(0, 4),
    sharedTypes,
    label,
  };
}

/** Pick best conversation pair: proximity × resonance. */
export function rankConversationPairs(
  candidates: Array<{ id: number; x: number; y: number }>,
  infoMap: Map<number, AgentInfo>,
  talkDist: number
): Array<{ a: number; b: number; score: number; resonance: ResonanceResult }> {
  const pairs: Array<{ a: number; b: number; score: number; resonance: ResonanceResult }> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const ca = candidates[i];
      const cb = candidates[j];
      const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
      if (dist >= talkDist) continue;
      const resonance = computeResonance(infoMap.get(ca.id), infoMap.get(cb.id));
      const prox = 1 - dist / talkDist;
      const score = prox * (0.45 + (resonance.score / 100) * 0.55);
      pairs.push({ a: ca.id, b: cb.id, score, resonance });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
