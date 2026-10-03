"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";

import { RestTime, useRestRemaining } from "./rest-timer";

export type ActiveSession = {
  id: string;
  name: string;
  restTimerEnabled: boolean;
};

/**
 * Is this one of the active workout's own screens? The workout, the logger and every support
 * flow underneath it are the session itself, with its header and rest pill, so the strip would
 * only repeat it there.
 */
function insideSession(pathname: string, sessionId: string): boolean {
  const root = `/workouts/${sessionId}`;
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * The session strip (DESIGN.md, The session): a workout minimised is this strip over the tab
 * bar on every screen, ink with card corners, the session's mark and name, the rest's dial and
 * time while one runs, and Resume.
 *
 * Today offers Resume itself, as its one action, so there the strip stands only while a rest
 * runs: two ways back to one session on one screen is the duplication the hierarchy rules out,
 * but the rest has nowhere else to show.
 *
 * It measures itself rather than assuming a height. The name and the time grow with the
 * reader's text, and a guessed constant would either leave a gap or let the strip cover the
 * last row of the page, which is exactly where a Save button tends to be.
 */
export function SessionChrome({ session }: { session: ActiveSession }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const remaining = useRestRemaining(session.id);
  const resting = session.restTimerEnabled && remaining !== null;
  const hidden = insideSession(pathname, session.id) || (pathname === "/today" && !resting);

  useEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!element) {
      root.style.removeProperty("--session-chrome-height");
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        root.style.setProperty(
          "--session-chrome-height",
          `${entry.target.getBoundingClientRect().height}px`,
        );
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
        <aside aria-label="Workout in progress" className="session-strip">
          <Art kind="mark" sport="strength" size={16} className="session-strip-mark" />
          <span className="session-strip-name">{session.name}</span>
          {session.restTimerEnabled && <RestTime sessionId={session.id} />}
          <Link href={`/workouts/${session.id}`} className="session-strip-resume">
            Resume
          </Link>
        </aside>
      </div>
    </div>
  );
}
