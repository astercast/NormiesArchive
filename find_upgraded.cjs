const { createPublicClient, http, parseAbiItem } = require("./node_modules/viem/_cjs/index.js");
const { mainnet } = require("./node_modules/viem/_cjs/chains/index.js");

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://eth.llamarpc.com", { timeout: 30000 }),
});

const CANVAS = "0x64951d92e345C50381267380e2975f66810E869c";

async function main() {
  const latest = await client.getBlockNumber();
  console.log("Latest block:", latest.toString());

  // Scan multiple chunks to find real upgraded normies
  const allIds = new Set();
  for (let from = 19_600_000n; from <= 19_900_000n; from += 50000n) {
    const to = from + 49999n;
    try {
      const logs = await client.getLogs({
        address: CANVAS,
        event: parseAbiItem("event PixelsTransformed(address indexed transformer, uint256 indexed tokenId, uint256 changeCount, uint256 newPixelCount)"),
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) allIds.add(Number(l.args.tokenId));
      if (logs.length > 0) console.log(`${from}-${to}: ${logs.length} events`);
    } catch(e) {
      console.log(`chunk ${from} failed: ${e.message}`);
    }
  }
  
  console.log("\n=== REAL UPGRADED NORMIE IDs ===");
  console.log([...allIds].sort((a,b)=>a-b).join(", "));
  console.log("Total unique:", allIds.size);
}

main().catch(console.error);
