import { createPublicClient, http, fallback } from "viem";
import { mainnet } from "viem/chains";

// Multiple public RPCs as fallbacks — browser extensions (ad blockers) often
// block specific RPC endpoints, so we try several in sequence.
const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com",
].filter(Boolean) as string[];

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { timeout: 10_000 })),
    { rank: false, retryCount: 2 }
  ),
  batch: { multicall: true },
});

export const CANVAS_ADDRESS =
  "0x64951d92e345C50381267380e2975f66810E869c" as const;
