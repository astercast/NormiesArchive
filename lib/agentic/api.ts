import type { AgentBundle, AgentListItem, PersonaPreview, SortMode } from "./types";

export async function fetchAgentCount(): Promise<number> {
  const r = await fetch("/api/agents/count");
  if (!r.ok) return 0;
  const d = (await r.json()) as { count?: number };
  return d.count ?? 0;
}

export async function fetchAgentList(params: {
  limit?: number;
  cursor?: string | null;
  sort?: SortMode;
}): Promise<{ items: AgentListItem[]; hasMore: boolean; nextCursor: string | null }> {
  const url = new URL("/api/agents/list", window.location.origin);
  url.searchParams.set("limit", String(params.limit ?? 24));
  url.searchParams.set("sort", params.sort ?? "newest");
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  const r = await fetch(url.toString());
  if (!r.ok) return { items: [], hasMore: false, nextCursor: null };
  const d = await r.json();
  const items: AgentListItem[] = d.items ?? [];
  const hasMore = d.hasMore ?? false;
  const nextCursor = items.length ? items[items.length - 1].agentId : null;
  return { items, hasMore, nextCursor };
}

export async function fetchPersonaPreview(tokenId: number): Promise<PersonaPreview | null> {
  const r = await fetch(`/api/agents/${tokenId}?preview=1`);
  if (!r.ok) return null;
  const d = (await r.json()) as { persona?: PersonaPreview | null };
  return d.persona ?? null;
}

export async function fetchAgentBundle(tokenId: number): Promise<AgentBundle | null> {
  const r = await fetch(`/api/agents/${tokenId}`);
  if (!r.ok) return null;
  return (await r.json()) as AgentBundle;
}

export async function fetchOpenSeaAgents(params: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ nfts: Array<{ tokenId: string; name?: string; image?: string }>; next: string | null }> {
  const url = new URL("/api/opensea/agents", window.location.origin);
  url.searchParams.set("limit", String(params.limit ?? 20));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  const r = await fetch(url.toString());
  if (!r.ok) return { nfts: [], next: null };
  const d = await r.json();
  return { nfts: d.nfts ?? [], next: d.next ?? null };
}
