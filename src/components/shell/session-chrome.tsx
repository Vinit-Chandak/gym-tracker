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
  const hideResume = pathname === "/today" || insideSession(pathname, session.id);

  useEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!element) {
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
  }, [hideResume, session.restTimerEnabled]);

  if (hideResume && !session.restTimerEnabled) return null;

  return (
    <div className="viewport-chrome viewport-chrome-session">
      <div
        ref={ref}
        className="session-chrome fixed inset-x-0 z-[var(--ov-z-timer)] lg:left-48"
        style={{ bottom: "var(--nav-reserve)" }}
      >
        {session.restTimerEnabled && <RestTimer sessionId={session.id} />}
        {!hideResume && (
          <div className="page-width pb-2">
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-chip bg-ink py-1.5 pr-1.5 pl-5 text-surface shadow-[var(--ov-nav-shadow)]">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-lift" aria-hidden />
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{session.name}</span>
                  <span className="opacity-75"> in progress</span>
                </span>
              </p>
              <Link
                href={`/workouts/${session.id}`}
                className="shrink-0 pressable rounded-chip bg-surface px-4 py-2 text-sm font-semibold text-ink"
              >
                Resume
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
