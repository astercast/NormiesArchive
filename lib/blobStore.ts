/**
 * Vercel Blob storage helpers for the indexer cache.
 *
 * Two blobs:
 *   normies-index/events.json   — raw edit + burn events per token (large, ~1MB)
 *   normies-index/normies.json  — processed leaderboard data (small, ~50KB)
 *
 * Both are public readable (Vercel Blob is CDN-cached) but only writable
 * from the server using BLOB_READ_WRITE_TOKEN.
 */

import { put, head, del } from "@vercel/blob";

const EVENTS_KEY  = "normies-index/events.json";
const NORMIES_KEY = "normies-index/normies.json";

// ─── Serialisable types (Maps become arrays for JSON) ─────────────────────────

export interface RawEditEvent {
  blockNumber:   number;
  txHash:        string;
  changeCount:   number;
  newPixelCount: number;
  transformer:   string;
}

export interface RawBurnEvent {
  blockNumber:  number;
  txHash:       string;
  tokenId:      number;
  totalActions: number;
  owner:        string;
}

export interface UpgradedNormie {
  id:        number;
  level:     number;
  ap:        number;
  added:     number;
  removed:   number;
  type:      string;
  editCount: number;
}

export interface EventsBlob {
  latestBlock:  number;
  savedAt:      number; // unix ms
  editsByToken: Array<[number, RawEditEvent[]]>; // Map serialised as entries
  burnsByToken: Array<[number, RawBurnEvent[]]>;
}

export interface NormiesBlob {
  normies:  UpgradedNormie[];
  savedAt:  number;
  latestBlock: number;
}

// ─── Write ────────────────────────────────────────────────────────────────────

async function putJson(key: string, data: unknown): Promise<string> {
  const body = JSON.stringify(data);
  const blob = await put(key, body, {
    access:      "public",
    contentType: "application/json",
    addRandomSuffix: false, // keep stable URL
  });
  return blob.url;
}

export async function saveEventsBlob(data: EventsBlob): Promise<void> {
  await putJson(EVENTS_KEY, data);
}

export async function saveNormiesBlob(data: NormiesBlob): Promise<void> {
  await putJson(NORMIES_KEY, data);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

async function getJson<T>(key: string): Promise<T | null> {
  try {
    // head() returns the blob metadata including downloadUrl
    const info = await head(key);
    if (!info) return null;
    const res = await fetch(info.url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function loadEventsBlob(): Promise<EventsBlob | null> {
  return getJson<EventsBlob>(EVENTS_KEY);
}

export async function loadNormiesBlob(): Promise<NormiesBlob | null> {
  return getJson<NormiesBlob>(NORMIES_KEY);
}

// Helper to check if blob exists without downloading it
export async function blobExists(key: string): Promise<boolean> {
  try {
    const info = await head(key);
    return !!info;
  } catch {
    return false;
  }
}

export { EVENTS_KEY, NORMIES_KEY };
