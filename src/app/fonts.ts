import localFont from "next/font/local";

/**
 * Barlow, self-hosted (SIL Open Font License; see fonts/LICENSE-OFL.txt).
 *
 * One family carries the whole sheet. The semi-condensed cut is the data voice: set numbers,
 * loads, the measures that have to sit in narrow cells and be read at arm's length. Both are
 * subset to Latin and served from the app's own origin, so an installed app has its type
 * without a network and a native build can ship the same files.
 */
export const barlow = localFont({
  variable: "--font-barlow",
  display: "swap",
  src: [
    { path: "./fonts/barlow-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/barlow-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/barlow-medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlow-semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-bold.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const barlowData = localFont({
  variable: "--font-barlow-sc",
  display: "swap",
  src: [
    { path: "./fonts/barlowsemicondensed-medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlowsemicondensed-semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlowsemicondensed-bold.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});
