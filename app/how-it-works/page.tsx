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
          a clean overview of Normies, NormiesCanvas, and what this archive tracks.
        </p>
      </div>

      <div className="border-t border-n-border" />

      {/* NORMIES */}
      <Section label="part 1" title="what is a normie?">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          Normies is a collection of 10,000 NFTs on Ethereum. each one is a <strong className="text-n-text">40×40 monochrome bitmap</strong> — 1,600 pixels stored entirely on-chain. no IPFS, no external servers.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          each normie also includes traits like type, gender, age, hair, eyes, expression, and accessory, all packed into a tiny amount of on-chain storage.
        </p>
      </Section>

      {/* CANVAS */}
      <Section label="part 2" title="normiescanvas">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          NormiesCanvas lets owners edit a normie&apos;s pixels. edits are stored on-chain as a <strong className="text-n-text">transform layer</strong> that flips pixels on top of the original.
        </p>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          the original normie is never destroyed — both the original and the transform are kept on-chain. edit at{' '}
          <a href="https://www.normies.art/lab" target="_blank" rel="noopener noreferrer"
             className="text-n-text underline underline-offset-2 hover:opacity-70 transition-opacity">normies.art/lab</a>.
        </p>
      </Section>

      {/* BURNS & AP */}
      <Section label="part 3" title="burning &amp; action points">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          editing pixels costs <strong className="text-n-text">Action Points (AP)</strong>. AP is earned by burning other normies into a target normie. the burned normie is destroyed permanently.
        </p>
        <div className="space-y-3">
          <Step n={1} title="burn a normie">each burn grants AP to the target normie. the burned normie is gone permanently.</Step>
          <Step n={2} title="commit → reveal">burning uses a two-step commit-reveal on-chain flow to prevent front-running.</Step>
          <Step n={3} title="spend AP to edit">with AP on your normie, you can flip pixels by updating the transform layer.</Step>
        </div>
      </Section>

      {/* LEVELS */}
      <Section label="part 4" title="levels">
        <p className="text-sm font-mono text-n-muted leading-relaxed">level is a display stat derived from AP:</p>
        <div className="border border-n-border rounded px-4 py-3 bg-n-surface font-mono text-sm text-center text-n-text">
          level = floor(AP ÷ 10) + 1
        </div>
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          0 AP = Level 1 · 10 AP = Level 2 · 100 AP = Level 11. there is no cap.
        </p>
      </Section>

      <div className="border-t border-n-border" />

      {/* THIS ARCHIVE */}
      <Section label="part 5" title="about this archive">
        <p className="text-sm font-mono text-n-muted leading-relaxed">
          this site indexes every on-chain edit and makes each normie&apos;s full history explorable.
        </p>
        <div className="space-y-3">
          <Step n={1} title="data source">all pixel state, edit history, and canvas data comes from the Normies Ponder API (<code className="bg-n-surface px-1 rounded">api.normies.art</code>).</Step>
          <Step n={2} title="cron cache">leaderboard data is refreshed every 10 minutes by GitHub Actions and cached in Vercel Blob.</Step>
          <Step n={3} title="timeline animation">the archive reconstructs each normie&apos;s history to show edits over time.</Step>
          <Step n={4} title="leaderboard &amp; the 100">the leaderboard ranks normies by level, edit count, and pixel count. the 100 page shows the first 100 normies ever edited.</Step>
          <Step n={5} title="wallet search">look up any address or ENS name to see owned normies and recent activity.</Step>
        </div>
        <Callout>
          data is CDN-cached for performance, while ownership and wallet info are fetched live.
        </Callout>
      </Section>

      <div className="border-t border-n-border" />

      <p className="text-xs font-mono text-n-muted">
        built by{' '}
        <a href="https://x.com/aster0x" target="_blank" rel="noopener noreferrer"
           className="hover:text-n-text transition-colors">@aster0x</a>
      </p>

      <p className="text-xs font-mono text-n-muted leading-relaxed">
        this was made out of normie love. feel like donating?{' '}
        <a
          href="https://etherscan.io/address/astercast.eth"
          target="_blank"
          rel="noopener noreferrer"
          className="text-n-text hover:opacity-70 transition-opacity"
        >
          astercast.eth
        </a>
        {' '}← thank you very much for all support and feedback! 🙏
      </p>

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
