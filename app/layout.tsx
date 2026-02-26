import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "Normie Eternal Archive", template: "%s — Normie Eternal Archive" },
  description: "The complete pixel evolution history of every Normie. 10,000 on-chain 40×40 monochrome faces.",
  openGraph: {
    siteName: "Normie Eternal Archive",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <footer className="border-t border-n-border mt-20 py-8 px-4">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-n-muted font-mono">
              <span>NORMIE ETERNAL ARCHIVE</span>
              <span>10,000 on-chain faces · all history preserved</span>
              <a href="https://normies.art" target="_blank" rel="noopener noreferrer"
                 className="hover:text-n-text transition-colors">normies.art ↗</a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
