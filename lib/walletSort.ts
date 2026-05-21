import type { WalletNormie } from "@/app/api/address/[addr]/route";

export type WalletSortKey = "ap" | "pixels" | "level" | "acquired";

export const WALLET_SORT_OPTIONS: {
  key: WalletSortKey;
  label: string;
  short: string;
}[] = [
  { key: "ap", label: "action points", short: "AP" },
  { key: "pixels", label: "pixel count", short: "pixels" },
  { key: "level", label: "level", short: "level" },
  { key: "acquired", label: "time acquired", short: "acquired" },
];

export function sortWalletNormies(
  normies: WalletNormie[],
  sort: WalletSortKey
): WalletNormie[] {
  const sorted = [...normies];
  switch (sort) {
    case "pixels":
      return sorted.sort(
        (a, b) =>
          (b.pixelCount ?? 0) - (a.pixelCount ?? 0) ||
          b.ap - a.ap ||
          a.tokenId - b.tokenId
      );
    case "level":
      return sorted.sort(
        (a, b) =>
          b.level - a.level ||
          b.ap - a.ap ||
          a.tokenId - b.tokenId
      );
    case "acquired":
      return sorted.sort((a, b) => {
        const ta = a.acquiredAt ?? 0;
        const tb = b.acquiredAt ?? 0;
        if (tb !== ta) return tb - ta;
        return a.tokenId - b.tokenId;
      });
    case "ap":
    default:
      return sorted.sort(
        (a, b) =>
          b.ap - a.ap ||
          b.level - a.level ||
          a.tokenId - b.tokenId
      );
  }
}
