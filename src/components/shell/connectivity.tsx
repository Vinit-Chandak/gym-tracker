"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The offline notice, at the top of every screen in the tabs (globals.css, The offline
 * notice). It measures itself, as the session strip does, because its words wrap to two or
 * three lines on a phone and grow with the reader's text: a workout's layer, which covers the
 * page, starts its header under the notice rather than behind it.
 */
export function Connectivity() {
  const online = useOnline();
  const ref = useRef<HTMLDivElement>(null);

  // Before the first paint, so the layer never shows its header behind the notice for a frame.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      root.style.setProperty(
        "--connectivity-height",
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--connectivity-height");
    };
  }, [online]);

  return online ? null : (
    <div
      ref={ref}
      role="status"
      className="connectivity border-b border-warning bg-surface text-center text-sm text-warning"
    >
      You&apos;re offline. Set and activity drafts stay on this device; retry saving when connected.
    </div>
  );
}
