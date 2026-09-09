"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useOnline } from "./connectivity";

function useSlowLoad() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timeout);
  }, []);
  return slow;
}

/** Mounted only while a link is pending, so a new navigation gets a fresh timer. */
export function NavigationFeedback({ href }: { href: string }) {
  const online = useOnline();
  const slow = useSlowLoad();

  // A portal keeps fixed feedback out of clipping/containing blocks on links and headers.
  return createPortal(
    <div role="status" aria-live="polite">
      <div className="navigation-progress" aria-hidden />
      <span className="sr-only">Loading page…</span>
      {(!online || slow) && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-[var(--ov-z-notice)] mx-auto flex max-w-md items-center justify-between gap-3 rounded-control border border-line-strong bg-surface px-4 py-2 text-sm">
          <span>
            {online ? "Taking longer than usual…" : "You’re offline. Reconnect to load this page."}
          </span>
          {online && (
            <a
              href={href}
              className="flex min-h-11 shrink-0 items-center px-2 font-medium text-accent"
            >
              Retry
            </a>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The URL has committed, but the page's data may still be loading behind Suspense. */
export function LoadingMessage({ title }: { title: string }) {
  const online = useOnline();
  const slow = useSlowLoad();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
      <p>
        {!online
          ? "You’re offline. Reconnect to load this page."
          : slow
            ? "Taking longer than usual…"
            : `Loading ${title === "Loading" ? "page" : title.toLowerCase()}…`}
      </p>
      {online && (
        <a
          href=""
          className="loading-retry flex min-h-11 items-center px-3 font-medium text-accent"
        >
          Retry loading
        </a>
      )}
    </div>
  );
}
