# 🎭 Normie Eternal Archive

The most beautiful explorer for the [Normies](https://normies.art) NFT collection. Every Normie gets a living history book: animated timeline, pixel birth/death particle effects, heatmap, leaderboards, and powerful search.

## ✨ Features

- **Timeline Scrubber** — Animated pixel evolution from mint to current state
- **3D Particle FX** — Three.js voxel particles fly in/out on every edit (via React Three Fiber)
- **Heatmap Overlay** — Visual diff of changed pixels with heat colors
- **GIF Export** — One-click export of animated timeline with watermark
- **Leaderboards** — Most edited, highest level, biggest glow-up, most burned-for
- **Life Story** — Prose narrative generated from on-chain events
- **Sound FX** — Chiptune pixel birth/death sounds via Web Audio API
- **Search & Filters** — Search by ID, type (Human/Cat/Alien/Agent), customized only, special features

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Edit .env.local and add your RPC URL (free public RPC works fine)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🏗 Architecture

### Data Sources
- **Normies API** (`https://api.normies.art`) — pixel strings, diffs, traits, metadata
- **NormiesCanvas contract** (`0x64951d92e345C50381267380e2975f66810E869c`) — on-chain event history via `viem`

### Key Limitation & Solution
Only the current transform layer is stored on-chain (no historical bitmaps). We simulate evolution by distributing net changed pixels proportionally across historical `PixelsTransformed` events. It looks and feels 100% real.

### Tech Stack
| Layer | Tech |
|-------|------|
| Framework | Next.js 15 App Router + TypeScript |
| Styling | Tailwind CSS + custom CSS vars |
| Animation | Framer Motion |
| 3D Particles | Three.js + React Three Fiber |
| Web3 | viem (public client, no wallet needed) |
| Data Fetching | TanStack Query v5 |
| GIF Export | GIF.js (dynamic CDN load) |
| Sound | Web Audio API |

## 📁 File Structure

```
app/
  page.tsx                    ← Homepage with hero + explore grid
  normie/[id]/
    page.tsx                  ← SSR wrapper with metadata
    NormieDetailClient.tsx    ← Full detail view with timeline
  leaderboards/
    page.tsx                  ← Leaderboards page
    LeaderboardsClient.tsx    ← Live leaderboard tabs
  api/
    leaderboards/route.ts     ← Cached leaderboard aggregates
    normie/[id]/history/route.ts  ← Per-Normie history endpoint
components/
  NormieGrid.tsx              ← HTML5 Canvas 40×40 renderer
  TimelineScrubber.tsx        ← Radix slider with edit markers
  ParticleCanvas.tsx          ← Three.js particle system
  HeatmapOverlay.tsx          ← Canvas heatmap overlay
  SearchFilters.tsx           ← Search + advanced filters
  Nav.tsx                     ← Sticky navigation
  GlobalStats.tsx             ← Stats dashboard widget
  LeaderboardCard.tsx         ← Leaderboard entry card
lib/
  viemClient.ts               ← Ethereum public client
  normiesApi.ts               ← API fetch wrappers + mock fallbacks
  pixelUtils.ts               ← 1600-string ↔ {x,y} + canvas render
  eventIndexer.ts             ← getLogs for PixelsTransformed + BurnRevealed
  gifExport.ts                ← GIF.js-based animated export
  sound.ts                    ← Web Audio API chiptune sounds
hooks/
  useNormieHistory.ts         ← Combined data hook with life story
```

## 🚢 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set env vars in Vercel dashboard or:
vercel env add NEXT_PUBLIC_RPC_URL
```

### Recommended Vercel Settings
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Node.js Version: 20.x

## ⚡ Performance Tips

1. **RPC Rate Limits** — Public RPCs (llamarpc, cloudflare-eth) work but may rate-limit heavy leaderboard queries. For production, use Alchemy free tier.

2. **Leaderboard Caching** — The `/api/leaderboards` route has `revalidate = 21600` (6h). For faster updates, add Upstash Redis:
   ```ts
   // In app/api/leaderboards/route.ts
   import { Redis } from '@upstash/redis'
   const redis = Redis.fromEnv()
   ```

3. **Block range** — `eventIndexer.ts` starts from block `19_500_000`. Update `DEPLOY_BLOCK` to the actual contract deploy block for faster initial loads.

## 🔮 Phase 2 Roadmap

- [ ] TheGraph subgraph for instant global queries (YAML included in spec)
- [ ] Compare two Normies side-by-side
- [ ] Clan/guild view (all Normies by same owner)
- [ ] Real-time WebSocket updates on new edits
- [ ] OG image generation (`/api/og/[id]`) with level badge

## 📜 TheGraph Subgraph

See `subgraph.yaml` spec in project root for deploying a subgraph that enables instant global leaderboard queries without scanning all blocks.

---

Built with ❤️ for the Normies community · [normies.art](https://normies.art)
