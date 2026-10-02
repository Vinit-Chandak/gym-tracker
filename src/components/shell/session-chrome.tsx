"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import Link from "@/components/ui/app-link";
import { ChevronRight } from "@/components/ui/icons";
import { RestTimer, useRestRemaining } from "./rest-timer";

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
 * One line of fixed chrome between the page and the tab bar, and only when it has something
 * to say: the rest left on the clock, the workout in progress, or both on one row. Off most
 * of the time, and never taller than a row of text when it is on.
 *
 * It measures itself rather than assuming a height. The workout's name can wrap at large
 * text sizes, and a guessed constant would either leave a gap or let the strip cover the last
 * row of the page — which is exactly where a Save button tends to be.
 */
export function SessionChrome({ session }: { session: ActiveSession }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const remaining = useRestRemaining(session.id);

  // Today shows the session as its own content with a primary Resume action, so the strip
  // stands down there; two resume affordances on one screen is the duplication the
  // hierarchy rules out.
  const hideResume = pathname === "/today" || insideSession(pathname, session.id);
  const showTimer = session.restTimerEnabled && remaining !== null;
  const visible = showTimer || !hideResume;

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
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="viewport-chrome viewport-chrome-session">
      <div
        ref={ref}
        className="session-chrome fixed inset-x-0 z-[var(--ov-z-timer)] lg:left-52"
        style={{ bottom: "var(--nav-reserve)" }}
      >
        <div className="relative border-t border-line bg-surface">
          <div className="page-width flex min-h-10 items-center gap-2 py-1">
            {showTimer && <RestTimer sessionId={session.id} />}
            {!hideResume && (
              <>
                <p className="min-w-0 flex-1 truncate text-sm">
                  {!showTimer && <span className="text-ink-muted">In progress · </span>}
                  <span className="font-medium">{session.name}</span>
                </p>
                <Link
                  href={`/workouts/${session.id}`}
                  className="flex min-h-9 shrink-0 items-center gap-0.5 rounded-control pr-1 pl-2 text-sm font-medium text-pen transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
                >
                  Resume
                  <ChevronRight className="shrink-0" aria-hidden />
                </Link>
              </>
            )}
            {!!hideResume && showTimer && <span className="flex-1" />}
          </div>
        </div>
      </div>
    </div>
  );
}
