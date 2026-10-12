"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";
import { usePinnedFold } from "@/components/ui/pinned-actions";

import { RestFace, RestTime, restNamed, useRestReading } from "./rest-timer";

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
 * The key decides: the strip stands down only while its key has a box of its own, so however the
 * key's width is read, the workout is never left without a way back, and never shown twice.
 *
 * It measures itself rather than assuming a height. The name and the time grow with the
 * reader's text, and a guessed constant would either leave a gap or let the strip cover the
 * last row of the page, which is exactly where a Save button tends to be. Folded, it measures
 * nothing, and the pinned actions come down to the tab bar.
 */
export function SessionChrome({ session }: { session: ActiveSession }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const { remaining, total } = useRestReading(session.id);
  const fold = usePinnedFold();
  const [folded, setFolded] = useState(false);
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
          data-folded={folded ? "" : undefined}
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
          <SessionFold
            session={session}
            rest={resting ? { remaining, total } : null}
            onShown={setFolded}
          />,
          fold,
        )}
    </>
  );
}

/**
 * The strip folded into a screen's pinned actions (DESIGN.md, The session strip): a key in the
 * place they keep for it (PinnedFold), on the control surface, the session's mark over Resume,
 * or while a rest runs its dial and time over Resume, as the strip shows them. Its name says the rest of
 * what the strip says, the session, and carries the time it shows (WCAG 2.5.3), from the one
 * reading the face draws. rows.css shows it at large text; it says whether it is shown, so the
 * strip stands down exactly while it stands in.
 */
function SessionFold({
  session,
  rest,
  onShown,
}: {
  session: ActiveSession;
  rest: { remaining: number; total: number | null } | null;
  onShown: (shown: boolean) => void;
}) {
  const key = useRef<HTMLAnchorElement>(null);

  // Read before the first paint, so a screen opened at large text never shows both; then again
  // whenever the key gains or loses its box (the reader's text, a turned phone).
  useLayoutEffect(() => {
    const element = key.current;
    if (!element) return;
    const read = () => onShown(element.getClientRects().length > 0);
    read();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      onShown(false);
    };
  }, [onShown]);

  return (
    <Link
      ref={key}
      href={`/workouts/${session.id}`}
      prefetch
      aria-label={
        rest === null
          ? `Resume ${session.name}`
          : `Resume ${session.name}. ${restNamed(rest.remaining)}`
      }
      className="session-fold"
    >
      <span className="session-fold-state">
        {rest === null ? (
          <Art kind="mark" sport="strength" size={16} className="session-fold-glyph" />
        ) : (
          <RestFace
            remaining={rest.remaining}
            total={rest.total}
            glyphClassName="session-fold-glyph"
            timeClassName="figures"
          />
        )}
      </span>
      <span>Resume</span>
    </Link>
  );
}
