import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { familyOf, type Family, type Sport } from "./geometry";

/**
 * Each sport's sign (DESIGN.md, Rows and signs; owner, 28 October 2026): a figure drawn on the
 * Munich 1972 grid, at 0, 45 and 90 degrees, in one stroke with a disc for a head, on a 48-unit
 * square. A sport added later takes its family's sign until it is drawn.
 */
const SIGNS: Readonly<Record<Family, ReactNode>> = {
  strength: (
    <>
      <circle cx="24" cy="15" r="4.4" className="sport-sign-fill" />
      <path d="M4 8h40M9 2v12M39 2v12M24 26l-8-8V8M24 26l8-8V8M24 22v14M24 36l-8 8M24 36l8 8" />
    </>
  ),
  run: (
    <>
      <circle cx="31" cy="7" r="4.4" className="sport-sign-fill" />
      <path d="M29 14L20 23M20 23l9 9v10M20 23l-8 8H5M27 16l7 7 6-6M27 16h-8l-5 5" />
    </>
  ),
  ride: (
    <>
      <circle cx="11" cy="36" r="7" />
      <circle cx="37" cy="36" r="7" />
      <circle cx="30" cy="8" r="4.4" className="sport-sign-fill" />
      <path d="M28 15L19 24M28 15l7 7M19 24l7 7v5M11 36l8-12M35 22l2 14" />
    </>
  ),
  swim: (
    <>
      <circle cx="36" cy="19" r="4.4" className="sport-sign-fill" />
      <path d="M30 24H12M27 22l7-8h7M4 35q4-4 8 0t8 0t8 0t8 0t8 0" />
    </>
  ),
  mobility: (
    <>
      <circle cx="24" cy="7" r="4.4" className="sport-sign-fill" />
      <path d="M24 13v14M24 16l-7-7M24 16l7-7M24 27l-8 8v8M24 27l10 10h6" />
    </>
  ),
  food: (
    <>
      <path d="M5 22h38a19 18 0 0 1-38 0z" className="sport-sign-fill" />
      <path d="M14 22a10 9.2 0 0 1 20 0" className="sport-sign-fill" />
    </>
  ),
  play: (
    <>
      <circle cx="20" cy="8" r="4.4" className="sport-sign-fill" />
      <circle cx="38" cy="10" r="5.5" />
      <path d="M21 15l-4 12M20 17l9 1 5-4M17 27l-7 7v8M17 27l9 6v9" />
    </>
  ),
};

/**
 * A sport's sign in its pigment, the one place a sport's colour stands beside a name: 16 at the
 * head of a line of figures (a friend's activity), 24 before a session's name in a list, 40
 * beside a task's title or a programme in a list, 64 once, beside a programme's name on its own
 * page. It says the sport and nothing else: whether the session is
 * done, skipped or missed is said in words beside it. Named only when the words beside it do not
 * say the sport; it grows with the reader's text by half, as a glyph does.
 */
export function SportSign({
  sport,
  size = 24,
  label,
  className,
}: {
  sport: Sport;
  size?: 16 | 20 | 24 | 32 | 40 | 64;
  label?: string;
  className?: string;
}) {
  const family = familyOf(sport);
  const length = `calc(${size / 2} * var(--ov-u) + ${size / 32}rem)`;
  return (
    <svg
      viewBox="0 0 48 48"
      data-sport={family}
      className={cn("sport-sign", className)}
      style={{ width: length, height: length }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {SIGNS[family]}
    </svg>
  );
}
