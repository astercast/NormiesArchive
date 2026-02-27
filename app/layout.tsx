import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "Normies Pixel Archive", template: "%s — Normies Pixel Archive" },
  description: "The complete pixel evolution history of every Normie. 10,000 on-chain 40×40 monochrome faces.",
  openGraph: {
    siteName: "Normies Pixel Archive",
    type: "website",
    title: "Normies Pixel Archive",
    description: "10,000 on-chain faces. All history preserved.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Normies Pixel Archive" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Normies Pixel Archive",
    description: "10,000 on-chain faces. All history preserved.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
  },
};

// Inline script — runs before paint to apply saved dark/light preference
// Prevents flash of wrong theme
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
