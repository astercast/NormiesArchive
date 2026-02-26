const BASE_URL = "https://api.normies.art";

// IDs are 0-indexed (0–9999)
export function normalizeId(id: number): number {
  return Math.max(0, Math.min(9999, Math.floor(id)));
}

export interface NormieDiff {
  added: Array<{ x: number; y: number }>;
  removed: Array<{ x: number; y: number }>;
  addedCount: number;
  removedCount: number;
  netChange: number;
}

export interface NormieInfo {
  actionPoints: number;
  level: number;
  customized: boolean;
  delegate: string | null;
  delegateSetBy?: string | null;
}

export interface NormieTraits {
  raw: string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
}

export interface NormieMetadata {
  name: string;
  description?: string;
  image: string;
  animation_url?: string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
}

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { next: { revalidate: 300 }, ...opts });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res;
}

export async function getNormieCurrentPixels(id: number): Promise<string> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/pixels`);
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.length !== 1600 || !/^[01]+$/.test(trimmed)) {
    throw new Error(`Invalid pixel string for normie ${id}`);
  }
  return trimmed;
}

export async function getNormieOriginalPixels(id: number): Promise<string> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/original/pixels`);
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.length !== 1600 || !/^[01]+$/.test(trimmed)) {
    throw new Error(`Invalid original pixel string for normie ${id}`);
  }
  return trimmed;
}

export async function getNormieDiff(id: number): Promise<NormieDiff> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/canvas/diff`);
  return res.json();
}

export async function getNormieInfo(id: number): Promise<NormieInfo> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/canvas/info`);
  return res.json();
}

export async function getNormieTraits(id: number): Promise<NormieTraits> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/traits`);
  return res.json();
}

export async function getNormieMetadata(id: number): Promise<NormieMetadata> {
  const res = await apiFetch(`${BASE_URL}/normie/${normalizeId(id)}/metadata`);
  return res.json();
}

export function getNormieImageUrl(id: number): string {
  return `${BASE_URL}/normie/${normalizeId(id)}/image.svg`;
}

export function getNormiePngUrl(id: number): string {
  return `${BASE_URL}/normie/${normalizeId(id)}/image.png`;
}
