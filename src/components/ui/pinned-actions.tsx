"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

/*
 * Where the session strip folds into the screen's own actions at large text (DESIGN.md, The
 * session strip). The pinned actions, or a form's kept-on-screen actions, hold a place at the end
 * of their last line and say where it is; the strip, which knows the workout, draws its folded
 * self there. One screen pins one set of actions, so one place is held at a time: the latest to
 * arrive, until it goes.
 */
let fold: HTMLElement | null = null;
const listeners = new Set<() => void>();

function holdFold(element: HTMLElement | null) {
  fold = element;
  for (const listener of listeners) listener();
}

function subscribeFold(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The place the screen's pinned actions keep for the folded strip, or null without them. */
export function usePinnedFold(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeFold,
    () => fold,
    () => null,
  );
}

/**
 * A screen's actions, pinned 12 pt above the tab bar (DESIGN.md, Layout): the one thing the
 * screen is for, and More. The content stops above them and fades under them.
 *
 * When the reader's text is so large that the action and More cannot share a line, More stands
 * under the action rather than the action's words breaking up; the page is told how tall the
 * pinned actions are, so its last row still clears them.
 *
 * At large text, while a workout is open, the session strip folds into them: its key stands at
 * the end of their last line, in the place they hold for it (rows.css).
 */
export function PinnedActions({
  children,
  stack = false,
}: {
  children: ReactNode;
  /** One under another, full width: the action, then a quieter way out (Skip check-in). */
  stack?: boolean;
}) {
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
      <div className={stack ? "pinned-actions-stack" : "pinned-actions-row"}>
        {children}
        <PinnedFold />
      </div>
    </div>
  );
}

/**
 * The place a screen's actions keep for the folded strip, where a line of theirs has room for its
 * key: after the last action of the pinned actions; beside Back in a form's kept actions. It adds
 * no box of its own (rows.css), and the key, drawn into it, stands where it stands in the focus
 * order too. Whatever holds it measures its own width for large text (rows.css).
 */
export function PinnedFold() {
  const holdPlace = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    holdFold(element);
    return () => {
      if (fold === element) holdFold(null);
    };
  }, []);
  return <span ref={holdPlace} className="pinned-fold" />;
}
