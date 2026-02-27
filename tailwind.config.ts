import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // These map to CSS variables so they switch automatically with dark mode
        "n-bg":      "var(--bg)",
        "n-surface": "var(--surface)",
        "n-border":  "var(--border)",
        "n-text":    "var(--text)",
        "n-muted":   "var(--muted)",
        "n-faint":   "var(--faint)",
        "n-white":   "var(--white)",
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["IBM Plex Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
