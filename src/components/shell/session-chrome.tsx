"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";
import { usePinnedFold } from "@/components/ui/pinned-actions";

import { RestFace, RestTime, restNamed, useRestRemaining } from "./rest-timer";

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
 * At large text, on a screen that pins its own actions, the strip folds into them (SessionFold):
 * the tab bar, the strip and the actions would otherwise hold a third of the screen and more.
 *
 * It measures itself rather than assuming a height. The name and the time grow with the
 * reader's text, and a guessed constant would either leave a gap or let the strip cover the
 * last row of the page, which is exactly where a Save button tends to be. Folded, it measures
 * nothing, and the pinned actions come down to the tab bar.
 */
export function SessionChrome({ session }: { session: ActiveSession }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const remaining = useRestRemaining(session.id);
  const fold = usePinnedFold();
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
    <>
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
            {/* The whole workout, prefetched, as Today's Resume is (ADR 0050). */}
            <Link href={`/workouts/${session.id}`} prefetch className="session-strip-resume">
              Resume
            </Link>
          </aside>
        </div>
      </div>
      {fold &&
        createPortal(
          <SessionFold session={session} remaining={resting ? remaining : null} />,
          fold,
        )}
    </>
  );
}

/**
 * The strip folded into a screen's pinned actions (DESIGN.md, The session strip): a key at the
 * end of their last line, on the control surface, the session's mark over Resume, or while a
 * rest runs its dial over the time, as the strip shows them. Its name says the rest of what the
 * strip says, the session, and carries the time it shows (WCAG 2.5.3). rows.css shows it in the
 * strip's place, from the same width, so the workout is one tap away at every size and never
 * twice; on a page of the session's own, which has no strip, it stands down too.
 */
function SessionFold({ session, remaining }: { session: ActiveSession; remaining: number | null }) {
  return (
    <Link
      href={`/workouts/${session.id}`}
      prefetch
      aria-label={
        remaining === null
          ? `Resume ${session.name}`
          : `Resume ${session.name}. ${restNamed(remaining)}`
      }
      className="session-fold"
    >
      {remaining === null ? (
        <>
          <Art kind="mark" sport="strength" size={16} className="session-fold-glyph" />
          <span className="session-fold-label">Resume</span>
        </>
      ) : (
        <RestFace
          sessionId={session.id}
          glyphClassName="session-fold-glyph"
          timeClassName="session-fold-label figures"
        />
      )}
    </Link>
  );
}
