import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/app";
import { CANVAS_DARK } from "@/lib/appearance";

/**
 * The installed launch and splash colours are read from this file by the platform before
 * the app runs, so they cannot follow the appearance preference: a manifest holds one
 * colour. Form v2's dark ground is the deliberate fallback. A light-mode user therefore sees
 * a dark splash hand over to the light interface; the app itself is correct from its
 * first paint, and only the OS-drawn splash is fixed. (iOS draws no splash from this file:
 * it has its own launch images, one per screen and scheme, in layout.tsx.)
 *
 * There is no `orientation`: "any" told Android to follow the sensor even with rotation
 * locked, which turned a phone laid on a bench sideways mid-set. Left out, the phone's own
 * rotation lock decides, and a tablet still turns.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: "en",
    categories: ["health", "fitness"],
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    background_color: CANVAS_DARK,
    theme_color: CANVAS_DARK,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      // Android's themed icons take one colour from the wallpaper and use only this shape.
      {
        src: "/icons/icon-512-monochrome.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ],
    // Pressing and holding the icon on Android offers these.
    shortcuts: [
      { name: "Today", url: "/today", icons: [shortcutIcon("today")] },
      { name: "Log food", url: "/food", icons: [shortcutIcon("food")] },
      {
        name: "Log a run",
        short_name: "Run",
        url: "/training/new?sport=running",
        icons: [shortcutIcon("run")],
      },
      { name: "Progress", url: "/progress", icons: [shortcutIcon("progress")] },
    ],
    // Shown in the richer install sheet on Android and desktop Chrome.
    screenshots: [
      {
        src: "/screenshots/today-narrow.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Today: the day's training and food",
      },
      {
        src: "/screenshots/progress-narrow.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Progress: trends over weeks and months",
      },
      {
        src: "/screenshots/today-wide.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Today on a larger screen",
      },
      {
        src: "/screenshots/progress-wide.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Progress on a larger screen",
      },
    ],
    // Lets a browser tab ask whether this app is already installed (pwa-provider.tsx), so
    // Profile stops offering to install it again.
    related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
    prefer_related_applications: false,
  };
}

function shortcutIcon(name: "today" | "food" | "run" | "progress") {
  return { src: `/icons/shortcut-${name}.png`, sizes: "96x96", type: "image/png" };
}
