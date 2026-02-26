import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Normies.art official palette
        "n-bg":      "#e3e5e4",  // off-pixel / page background
        "n-surface": "#d6d8d7",  // card backgrounds
        "n-border":  "#c2c4c3",  // borders
        "n-text":    "#48494b",  // on-pixel / primary text
        "n-muted":   "#82848a",  // secondary text
        "n-faint":   "#b8bab9",  // placeholders
        "n-white":   "#f5f5f4",  // near-white panels
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
