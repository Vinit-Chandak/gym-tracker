import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/app";
import { CANVAS_DARK } from "@/lib/appearance";

/**
 * The installed launch and splash colours are read from this file by the platform before
 * the app runs, so they cannot follow the appearance preference: a manifest holds one
 * colour. Form's dark canvas is the deliberate fallback. A light-mode user therefore sees
 * a dark splash hand over to the light interface; the app itself is correct from its
 * first paint, and only the OS-drawn splash is fixed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
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
    ],
  };
}
