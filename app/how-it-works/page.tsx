import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "How It Works",
  description: "How Normies, NormiesCanvas, and this archive work — burning, action points, levels, and pixel transforms explained.",
};

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-mono text-n-muted uppercase tracking-widest mb-1">{label}</div>
        <h2 className="text-xl font-mono font-medium text-n-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-n-border rounded px-4 py-3 bg-n-surface text-xs font-mono text-n-muted leading-relaxed">
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 border border-n-border rounded flex items-center justify-center text-xs font-mono font-medium text-n-muted bg-n-surface">
        {n}
      </div>
      <div className="space-y-1 pt-0.5">
        <div className="text-sm font-mono font-medium text-n-text">{title}</div>
        <div className="text-xs font-mono text-n-muted leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-14">

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-n-muted uppercase tracking-widest">docs</div>
        <h1 className="text-3xl font-mono font-medium text-n-text">how it works</h1>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          everything you need to know about Normies, the Canvas system, and what this archive does.
        </p>
      </div>

      <div className="border-t border-n-border" />

      {/* ── PART 1: NORMIES ── */}
      <Section label="part 1" title="what is a normie?">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Normies is a collection of 10,000 NFTs on Ethereum. Each one is a <strong className="text-n-text">40×40 monochrome bitmap</strong> — 1,600 pixels, each either on (dark) or off (light). The art is stored entirely on-chain, meaning no IPFS, no external servers. The pixel data lives directly in Ethereum smart contracts forever.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Every Normie has traits — Type (Human, Cat, Alien, Agent), Gender, Age, Hair, Eyes, Expression, Accessory — all packed into 8 bytes of on-chain storage.
        </p>
        <Callout>
          the pixel colors are always the same: <span className="text-n-text">#48494b</span> for on-pixels and <span className="text-n-text">#e3e5e4</span> for off-pixels. the only thing that varies is which of the 1,600 pixels are flipped.
        </Callout>
      </Section>

      {/* ── PART 2: CANVAS ── */}
      <Section label="part 2" title="what is normiescanvas?">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          NormiesCanvas is a separate smart contract that lets owners edit their Normie&apos;s pixels. It works through a <strong className="text-n-text">transform layer</strong> — an XOR mask stored on-chain alongside the original bitmap.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          the final displayed Normie is always: <code className="bg-n-surface px-1.5 py-0.5 rounded text-n-text">original XOR transform_layer</code>. every 1-bit in the transform layer flips the corresponding pixel. the original is never destroyed — it always exists underneath.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          you can interact with NormiesCanvas at{" "}
          <a
            href="https://www.normies.art/lab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-n-text underline underline-offset-2 hover:opacity-70 transition-opacity"
          >
            normies.art/lab
          </a>
          .
        </p>
      </Section>

      {/* ── PART 3: AP & BURNING ── */}
      <Section label="part 3" title="action points &amp; burning">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          you can&apos;t edit pixels for free. editing requires <strong className="text-n-text">Action Points (AP)</strong> — on-chain budget earned by <strong className="text-n-text">burning</strong> other Normies into your target Normie. each 1 AP of budget lets you flip one pixel in the next edit transaction.
        </p>

        <div className="space-y-3">
          <Step n={1} title="choose a normie to burn">
            you pick a Normie you own (the &quot;fuel&quot;) and a target Normie that will receive the AP budget. the fuel Normie is destroyed permanently — it&apos;s gone forever.
          </Step>
          <Step n={2} title="pixel count determines ap earned">
            the burned Normie&apos;s pixel count (how many pixels are lit up) is converted to AP. denser Normies give more AP. there are three tiers — above 490 pixels and above 890 pixels unlock higher conversion percentages.
          </Step>
          <Step n={3} title="commit → reveal">
            burning uses a two-step commit-reveal pattern on-chain to prevent front-running. you commit first, then reveal after a delay to actually receive the AP budget.
          </Step>
          <Step n={4} title="spend ap to transform pixels">
            with AP budget on your Normie, you can call the canvas contract to flip pixels. each flip costs 1 AP. the transform layer is updated on-chain, and the displayed image changes permanently.
          </Step>
        </div>

        <Callout>
          <strong className="text-n-text">note on the AP stat shown here:</strong> the &quot;AP&quot; displayed on this archive (and in <code>canvas/info</code> from the API) is the <em>total pixels ever flipped</em> — a lifetime edit score that only goes up, not a remaining budget. your actual remaining budget is tracked separately on-chain. think of the AP shown here as &quot;total edits made&quot;.
        </Callout>
      </Section>

      {/* ── PART 4: LEVELS ── */}
      <Section label="part 4" title="levels">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Level is a display stat derived directly from Action Points:
        </p>
        <div className="border border-n-border rounded px-4 py-3 bg-n-surface font-mono text-sm text-center text-n-text">
          level = floor(AP ÷ 10) + 1
        </div>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          so 0 AP = Level 1, 10 AP = Level 2, 50 AP = Level 6, 100 AP = Level 11, and so on. there&apos;s no cap. level signals how much editing activity a Normie has accumulated over its lifetime.
        </p>


      </Section>

      {/* ── PART 5: DELEGATES ── */}
      <Section label="part 5" title="delegates">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Normie owners can authorize a <strong className="text-n-text">delegate address</strong> to transform pixels on their behalf — without giving up ownership of the NFT. this is useful for cold wallet holders who want to edit from a hot wallet, or for collaborative projects where someone else manages the canvas.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          when a delegate is active, you&apos;ll see it displayed on the Normie&apos;s detail page as a banner with the authorized address (here on the archive website).
        </p>
      </Section>

      <div className="border-t border-n-border" />

      {/* ── PART 6: THIS ARCHIVE ── */}
      <Section label="part 6" title="about this archive">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          the Normie Pixel Archive is an independent site that indexes every on-chain edit event and makes the history of each Normie explorable. here&apos;s what it does and how:
        </p>

        <div className="space-y-3">
          <Step n={1} title="ponder indexer + blob cache">
            all pixel state, edit history, and canvas data is served by the <strong className="text-n-text">Normies Ponder API</strong> (<code className="bg-n-surface px-1 rounded">api.normies.art</code>), which indexes every on-chain event in real time. leaderboard and burn data is fetched from the Ponder API every 10 minutes by a GitHub Actions cron job and cached in Vercel Blob — so the site never hits the blockchain directly on page load.
          </Step>
          <Step n={2} title="per-normie history">
            when you open a Normie&apos;s detail page, the archive fetches that token&apos;s full edit history from the Ponder API. timestamps for each edit are resolved lazily — only the blocks relevant to that specific Normie. this is fast because each Normie typically has at most a handful of unique edit blocks.
          </Step>
          <Step n={3} title="timeline animation">
            using the original pixels, the transform layer, and the edit history, the archive reconstructs an animated timeline showing each edit step. pixels are distributed proportionally across edits based on their change counts and shuffled deterministically — so the same Normie always produces the same animation.
          </Step>
          <Step n={4} title="heatmap overlay">
            the heatmap shows exactly which pixels were added (green) vs removed (red) from the original. this is built from the <code className="bg-n-surface px-1 rounded">canvas/diff</code> endpoint and overlaid on the canvas in real time.
          </Step>
          <Step n={5} title="leaderboard &amp; the 100">
            the leaderboard ranks all edited Normies by total AP (lifetime edits). &quot;The 100&quot; page shows the first 100 Normies ever edited — sorted by the block number of their first <code className="bg-n-surface px-1 rounded">PixelsTransformed</code> event.
          </Step>
          <Step n={6} title="wallet search">
            you can look up any Ethereum address or ENS name to see all Normies it owns, sorted by AP. ownership is fetched live via multiple strategies (OpenSea, Reservoir, Etherscan) so the data is always current. visit <Link href="/wallet" className="text-n-text underline underline-offset-2 hover:opacity-70 transition-opacity">/wallet</Link> to search.
          </Step>
        </div>

        <Callout>
          <strong className="text-n-text">data freshness:</strong> leaderboard and burn data is refreshed every 10 minutes via a background cron. individual pixel/history data comes directly from <code>api.normies.art</code> and is CDN-cached for 5 minutes. wallet ownership is fetched live on every lookup. nothing here is mutable or controlled by anyone.
        </Callout>
      </Section>

      <div className="border-t border-n-border" />

      {/* Built by */}
      <p className="text-xs font-mono text-n-muted">
        built by{" "}
        <a href="https://x.com/aster0x" target="_blank" rel="noopener noreferrer"
           className="hover:text-n-text transition-colors">@aster0x</a>
      </p>

      {/* CTA */}
      <div className="flex flex-wrap gap-3">
        <Link href="/leaderboard"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          leaderboard <ArrowRight className="w-3 h-3" />
        </Link>
        <Link href="/the-100"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          the 100 <ArrowRight className="w-3 h-3" />
        </Link>
        <Link href="/wallet"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          wallet search <ArrowRight className="w-3 h-3" />
        </Link>
        <a href="https://normies.art" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          normies.art <ArrowRight className="w-3 h-3" />
        </a>
      </div>

    </div>
  );
}
