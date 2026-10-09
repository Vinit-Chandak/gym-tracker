"use client";

import { useEffect } from "react";

/** How long the app must have been out of sight before coming back is worth a warm-up. */
export const RESUME_AFTER_MS = 2 * 60_000;

/** The least time between two warm-ups, however often the app is shown or the network returns. */
export const WARM_AGAIN_AFTER_MS = 60_000;

/**
 * Coming back to the installed app after a break (ADR 0049).
 *
 * A phone keeps the app's page in memory, so reopening it shows the last screen at once, and the
 * first tap is the first request. After a break that tap used to wait for everything at once: a
 * new server instance, the session's access token renewed through Supabase (about 800 ms when it
 * has expired) and new database connections. Asking for `/warm` the moment the app is shown
 * starts all three while the athlete is still reading the screen. The request carries the
 * session's cookies, so the proxy renews an expired token on the way and hands back the new one;
 * it is a HEAD request, so nothing comes back but headers.
 */
export function WarmOnResume() {
  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;
    let lastWarm = Number.NEGATIVE_INFINITY;

    // Time alone limits these: a request stuck on a bad connection must not stop the next one.
    const warm = () => {
      const now = Date.now();
      if (!navigator.onLine || now - lastWarm < WARM_AGAIN_AFTER_MS) return;
      lastWarm = now;
      void fetch("/warm", { method: "HEAD", cache: "no-store" }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= RESUME_AFTER_MS) warm();
    };
    // Back from a dead spot, a basement gym say: the token may have lapsed while offline.
    const onOnline = () => {
      if (document.visibilityState === "visible") warm();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
