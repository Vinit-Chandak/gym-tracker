"use client";

import { useEffect } from "react";

import { STANDALONE_ATTRIBUTE } from "@/lib/platform";

/** What brings a keyboard up: while one of these has the focus, a short viewport is expected. */
const TYPED =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * The installed app's viewport after the keyboard, on iOS. WebKit can hand the page back a
 * viewport a status bar short once the keyboard has gone, and keep it until the app is closed;
 * globals.css gives the page the height that lets it grow back, and this asks it to. The height
 * the app has had at this width is remembered, and when nothing is being typed and the viewport
 * still falls short of it, the page is scrolled a pixel and back over two frames: a scroll is
 * what has WebKit measure the viewport again. Nothing happens in a browser tab, off iOS, or while
 * a field has the focus.
 */
export function ViewportSettle() {
  useEffect(() => {
    if (
      !document.documentElement.hasAttribute(STANDALONE_ATTRIBUTE) ||
      !("standalone" in navigator)
    )
      return;
    const tallest = new Map<number, number>();
    const settle = () => {
      if (document.visibilityState !== "visible" || document.activeElement?.matches(TYPED)) return;
      const { innerWidth: width, innerHeight: height } = window;
      const best = tallest.get(width) ?? 0;
      if (height >= best) {
        tallest.set(width, height);
        return;
      }
      if (best - height < 2) return;
      const { scrollX: x, scrollY: y } = window;
      window.scrollTo(x, y > 0 ? y - 1 : y + 1);
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(x, y)));
    };

    let timers: number[] = [];
    // The keyboard takes a moment to go, and WebKit a moment more to say what it left.
    const soon = () => {
      timers.forEach(clearTimeout);
      timers = [120, 400, 900].map((delay) => window.setTimeout(settle, delay));
    };
    settle();
    const viewport = window.visualViewport;
    document.addEventListener("focusout", soon);
    document.addEventListener("visibilitychange", soon);
    window.addEventListener("resize", soon);
    viewport?.addEventListener("resize", soon);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("focusout", soon);
      document.removeEventListener("visibilitychange", soon);
      window.removeEventListener("resize", soon);
      viewport?.removeEventListener("resize", soon);
    };
  }, []);
  return null;
}
