const BASE_URL = "https://api.normies.art";

// Per llms.txt: IDs are 0-9999 (0-indexed)
export function normalizeId(id: number): number {
  return Math.max(0, Math.min(9999, id));
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

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (res.ok) return res;
      if (res.status === 404) throw new Error(`Not found: ${url}`);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch: ${url}`);
}

export async function getNormieCurrentPixels(id: number): Promise<string> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/pixels`);
    const text = await res.text();
    return text.trim();
  } catch {
    return generateMockPixels(nid, "current");
  }
}

export async function getNormieOriginalPixels(id: number): Promise<string> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/original/pixels`);
    const text = await res.text();
    return text.trim();
  } catch {
    return generateMockPixels(nid, "original");
  }
}

export async function getNormieDiff(id: number): Promise<NormieDiff> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/canvas/diff`);
    return await res.json();
  } catch {
    return {
      added: generateMockCoordList(nid * 7, 50),
      removed: generateMockCoordList(nid * 13, 30),
      addedCount: 50,
      removedCount: 30,
      netChange: 20,
    };
  }
}

export async function getNormieInfo(id: number): Promise<NormieInfo> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/canvas/info`);
    return await res.json();
  } catch {
    return {
      actionPoints: (nid * 17) % 100,
      level: Math.floor(((nid * 3) % 50) + 1),
      customized: nid % 3 !== 0,
      delegate: null,
    };
  }
}

export async function getNormieTraits(id: number): Promise<NormieTraits> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/traits`);
    return await res.json();
  } catch {
    const types = ["Human", "Cat", "Alien", "Agent"];
    return {
      raw: "0x0000000000000000",
      attributes: [
        { trait_type: "Type", value: types[nid % 4] },
        { trait_type: "Gender", value: "Male" },
        { trait_type: "Age", value: "Young" },
      ],
    };
  }
}

export async function getNormieMetadata(id: number): Promise<NormieMetadata> {
  const nid = normalizeId(id);
  try {
    const res = await fetchWithRetry(`${BASE_URL}/normie/${nid}/metadata`);
    return await res.json();
  } catch {
    const types = ["Human", "Cat", "Alien", "Agent"];
    return {
      name: `Normie #${nid}`,
      image: `${BASE_URL}/normie/${nid}/image.svg`,
      attributes: [
        { trait_type: "Type", value: types[nid % 4] },
        { display_type: "number", trait_type: "Level", value: 1 },
        { display_type: "number", trait_type: "Action Points", value: 0 },
        { trait_type: "Customized", value: "No" },
      ],
    };
  }
}

export function getNormieImageUrl(id: number): string {
  return `${BASE_URL}/normie/${normalizeId(id)}/image.svg`;
}

export function getNormiePngUrl(id: number): string {
  return `${BASE_URL}/normie/${normalizeId(id)}/image.png`;
}

function generateMockPixels(id: number, variant: "original" | "current"): string {
  const seed = id + (variant === "current" ? 9999 : 0);
  let str = "";
  for (let i = 0; i < 1600; i++) {
    const val = Math.sin(seed * 9301 + i * 49297 + 233) * 0.5 + 0.5;
    str += val > 0.62 ? "1" : "0";
  }
  return str;
}

function generateMockCoordList(seed: number, count: number): Array<{ x: number; y: number }> {
  const coords: Array<{ x: number; y: number }> = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const flat = Math.floor(Math.abs(Math.sin(seed * 1234 + i * 567)) * 1600) % 1600;
    if (!seen.has(flat)) {
      seen.add(flat);
      coords.push({ x: flat % 40, y: Math.floor(flat / 40) });
    }
  }
  return coords;
}
