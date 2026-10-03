"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A screen's actions, pinned 12 pt above the tab bar (DESIGN.md, Layout): the one thing the
 * screen is for, and More. The content stops above them and fades under them.
 *
 * When the reader's text is so large that the action and More cannot share a line, More stands
 * under the action rather than the action's words breaking up; the page is told how tall the
 * pinned actions are, so its last row still clears them.
 */
export function PinnedActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      root.style.setProperty(
        "--pinned-actions-height",
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--pinned-actions-height");
    };
  }, []);

  return (
    <div ref={ref} className="pinned-actions">
      <div className="pinned-actions-row">{children}</div>
    </div>
  );
}
