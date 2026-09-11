"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import Link from "@/components/ui/app-link";
import { RestTimer } from "./rest-timer";

export type ActiveSession = {
  id: string;
  name: string;
  restTimerEnabled: boolean;
};

/**
 * Is this one of the active workout's own screens? The overview, the logger and every
 * support flow underneath it already say which session you are in, so the strip would only
 * repeat itself there.
 */
function insideSession(pathname: string, sessionId: string): boolean {
  const root = `/workouts/${sessionId}`;
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Fixed chrome that sits between the page and the bottom navigation: one resume strip and,
 * when the preference is on, one rest timer.
 *
 * It measures itself rather than assuming a height. The timer's controls and the workout's
 * name wrap at large text sizes, and a guessed constant would either leave a gap or let the
 * strip cover the last row of the page — which is exactly where a Save button tends to be.
 */
export function SessionChrome({ session }: { session: ActiveSession }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // Today shows the session as its own content with a primary Resume action, so the strip
  // stands down there; two resume affordances on one screen is the duplication the
  // hierarchy rules out.
  const hidden = pathname === "/today" || insideSession(pathname, session.id);

  useEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (hidden || !element) {
      root.style.removeProperty("--session-chrome-height");
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) root.style.setProperty("--session-chrome-height", `${entry.contentRect.height}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--session-chrome-height");
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div className="viewport-chrome viewport-chrome-session">
      <div
        ref={ref}
        className="session-chrome fixed inset-x-0 z-[var(--ov-z-timer)] lg:left-48"
        style={{ bottom: "var(--nav-reserve)" }}
      >
        {session.restTimerEnabled && <RestTimer sessionId={session.id} />}
        <div className="border-t border-line bg-surface">
          <div className="page-width flex min-h-11 items-center justify-between gap-3 py-1.5">
            <p className="min-w-0 truncate text-sm">
              <span className="text-ink-muted">In progress · </span>
              {session.name}
            </p>
            <Link
              href={`/workouts/${session.id}`}
              className="shrink-0 px-2 py-1 text-sm font-medium text-accent"
            >
              Resume
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
