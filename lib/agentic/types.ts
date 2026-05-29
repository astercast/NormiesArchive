import type { AgentInfo } from "@/components/AgentSection";

export type { AgentInfo };

export interface AgentListItem {
  agentId: string;
  tokenId: string;
  name: string;
  type: string;
  registeredBy?: string;
  registeredAt?: string;
  txHash?: string;
}

export interface PersonaPreview {
  name: string;
  type: string;
  tagline: string;
  backstory: string;
  greeting: string;
  personalityTraits: string[];
  communicationStyle: string;
  quirks: string[];
  systemPrompt: string;
}

export interface AgentCard {
  name: string;
  description: string;
  iconUrl?: string;
  version?: string;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
  }>;
  supportedInterfaces?: Array<{
    url: string;
    protocolBinding?: string;
    protocolVersion?: string;
  }>;
}

export interface AgentMetadata {
  type: string;
  name: string;
  description: string;
  image: string;
  services: Array<{ name: string; endpoint: string; version?: string }>;
  active: boolean;
  x402Support: boolean;
}

export interface AgentBundle {
  tokenId: string;
  info: AgentInfo | null;
  persona: PersonaPreview | null;
  card: AgentCard | null;
  metadata: AgentMetadata | null;
  listing: { listed: boolean; price?: number; currency?: string } | null;
}

export interface ChatLine {
  who: string;
  text: string;
}

export interface ChatEntry {
  id: string;
  ts: number;
  aName: string;
  bName: string;
  aId: number;
  bId: number;
  lines: ChatLine[];
}

export interface WitnessEntry extends ChatEntry {
  witnessed: true;
}

export type MobileTab = "hive" | "deck" | "map" | "archive";
export type SortMode = "newest" | "oldest";
export type TypeFilter = "all" | "Human" | "Cat" | "Alien" | "Agent";

/** Live turn broadcast from the floor → Theatre overlay */
export interface LiveTurn {
  convoId: string;
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  speakerId: number;
  line: string;
  turnIndex: number;
  totalTurns: number;
  resonanceScore: number;
  resonanceLabel: string;
  sharedTraits: string[];
}

export interface BondEdge {
  aId: number;
  bId: number;
  count: number;
}
