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
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-12">

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-n-muted uppercase tracking-widest">docs</div>
        <h1 className="text-3xl font-mono font-medium text-n-text">how it works</h1>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          normies, the canvas system, and what this archive tracks \u2014 explained simply.
        </p>
      </div>

      <div className="border-t border-n-border" />

      {/* â”€â”€ NORMIES â”€â”€ */}
      <Section label="part 1" title="what is a normie?">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Normies is a collection of 10,000 NFTs on Ethereum. each one is a <strong className="text-n-text">40×40 monochrome bitmap</strong> \u2014 1,600 pixels, stored entirely on-chain. no IPFS, no external servers. the art lives in the smart contracts forever.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          every normie has traits (Type, Gender, Age, Hair, Eyes, Expression, Accessory) packed into 8 bytes of on-chain storage.
        </p>
      </Section>

      {/* â”€â”€ CANVAS â”€â”€ */}
      <Section label="part 2" title="normiescanvas">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          NormiesCanvas lets owners edit their normie&apos;s pixels. it works via a <strong className="text-n-text">transform layer</strong> \u2014 an XOR mask stored on-chain on top of the original. the displayed normie is always:
        </p>
        <div className="border border-n-border rounded px-4 py-3 bg-n-surface font-mono text-sm text-center text-n-text">
          original XOR transform_layer
        </div>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          the original is never destroyed \u2014 it always lives underneath. edit at{" "}
          <a href="https://www.normies.art/lab" target="_blank" rel="noopener noreferrer"
             className="text-n-text underline underline-offset-2 hover:opacity-70 transition-opacity">normies.art/lab</a>.
        </p>
      </Section>

      {/* â”€â”€ BURNS & AP â”€â”€ */}
      <Section label="part 3" title="burning &amp; action points">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          editing pixels requires <strong className="text-n-text">Action Points (AP)</strong> \u2014 earned by burning other normies into a target normie. the burned normie is destroyed permanently. each pixel flip costs 1 AP.
        </p>
        <div className="space-y-3">
          <Step n={1} title="burn a normie">the burned normie&apos;s pixel count determines how many AP the target earns. denser normies give more. there are three conversion tiers based on pixel count.</Step>
          <Step n={2} title="commit → reveal">burning uses a two-step commit-reveal on-chain to prevent front-running. commit first, reveal after a delay to receive the AP.</Step>
          <Step n={3} title="spend AP to edit">with AP on your normie, call the canvas contract to flip pixels. each flip costs 1 AP and updates the transform layer permanently.</Step>
        </div>
        <Callout>
          the &quot;AP&quot; shown on this site is a <strong className="text-n-text">lifetime edit score</strong> \u2014 total pixels ever flipped, not remaining budget. it only goes up. think of it as an activity counter.
        </Callout>
      </Section>

      {/* â”€â”€ LEVELS â”€â”€ */}
      <Section label="part 4" title="levels">
        <p className="text-sm font-mono text-n-muted leading-relaxed">level is derived directly from AP:</p>
        <div className="border border-n-border rounded px-4 py-3 bg-n-surface font-mono text-sm text-center text-n-text">
          level = floor(AP \u00f7 10) + 1
        </div>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          0 AP = Level 1 \u00b7 10 AP = Level 2 \u00b7 100 AP = Level 11. no cap.
        </p>
      </Section>

      <div className="border-t border-n-border" />

      {/* â”€â”€ THIS ARCHIVE â”€â”€ */}
      <Section label="part 5" title="about this archive">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          this site indexes every on-chain edit and makes each normie&apos;s full history explorable.
        </p>
        <div className="space-y-3">
          <Step n={1} title="data source">all pixel, history, and canvas data comes from the <strong className="text-n-text">Normies Ponder API</strong> (<code className="bg-n-surface px-1 rounded">api.normies.art</code>), which tracks every on-chain event in real time.</Step>
          <Step n={2} title="cron cache">leaderboard data is refreshed every 10 minutes via a GitHub Actions cron that writes to Vercel Blob. page loads never hit the blockchain directly.</Step>
          <Step n={3} title="timeline animation">the archive reconstructs a frame-by-frame animation of each normie&apos;s edit history using the original pixels, transform layer, and version history.</Step>
          <Step n={4} title="leaderboard &amp; the 100">leaderboard ranks all edited normies by AP. &quot;the 100&quot; shows the first 100 normies ever edited \u2014 sorted by their first <code className="bg-n-surface px-1 rounded">PixelsTransformed</code> block.</Step>
          <Step n={5} title="wallet search">look up any address or ENS name to see all owned normies. visit <Link href="/wallet" className="text-n-text underline underline-offset-2 hover:opacity-70 transition-opacity">/wallet</Link>.</Step>
        </div>
        <Callout>
          leaderboard data refreshes every 10 min. pixel/history data is CDN-cached for 5 min via <code>api.normies.art</code>. wallet ownership is fetched live.
        </Callout>
      </Section>

      <div className="border-t border-n-border" />

      {/* Built by */}
      <p className="text-xs font-mono text-n-muted">
        built by{" "}
        <a href="https://x.com/aster0x" target="_blank" rel="noopener noreferrer"
           className="hover:text-n-text transition-colors">@aster0x</a>
      </p>

      {/* Donation note */}
      <p className="text-xs font-mono text-n-muted leading-relaxed">
        this was made out of normie love. feel like donating?{" "}
        <a
          href="https://etherscan.io/address/astercast.eth"
          target="_blank"
          rel="noopener noreferrer"
          className="text-n-text hover:opacity-70 transition-opacity"
        >
          astercast.eth
        </a>
        {" "}← thank you very much for all support and feedback! 🙏
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
        <a href="https://normuseum.vercel.app/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          museum <ArrowRight className="w-3 h-3" />
        </a>
        <a href="https://fullnormies.xyz/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-n-border text-xs font-mono text-n-muted hover:text-n-text hover:border-n-text transition-colors rounded">
          fullnormies <ArrowRight className="w-3 h-3" />
        </a>
      </div>

    </div>
  );
}
