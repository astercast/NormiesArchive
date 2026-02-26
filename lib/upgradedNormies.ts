/**
 * Shared type for an upgraded (customized) Normie.
 * The actual data always comes from the on-chain indexer (lib/indexer.ts),
 * not from any hardcoded list.
 */
export interface UpgradedNormie {
  id: number;
  level: number;
  ap: number;
  added: number;
  removed: number;
  type: string;
  editCount?: number;
}
