import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Glyph } from "./glyphs";

type Tone = "note" | "check" | "planning" | "failed";

const GLYPH = { note: "coach", check: "info", planning: "wait", failed: "warn" } as const;

/**
 * Everything the coach (or the app's own advice, under its own name) writes, in one quiet
 * block (DESIGN.md, Coach note): surface, 14-px corners, the speech glyph and who says it, an
 * optional heading, then the words. Never on a print, never in colour, at most one a screen.
 */
export function CoachNote({
  who = "Coach",
  context,
  title,
  tone = "note",
  role,
  clamp = false,
  more,
  action,
  small = false,
  className,
  children,
}: {
  /** "Coach", or the app's own advice by its name ("Recovery check"). */
  who?: string;
  /** After who, quieter: what the note is about. */
  context?: string;
  /** One line that leads the words ("Sleep 5 h"). */
  title?: ReactNode;
  tone?: Tone;
  /** Makes the words a live region: "status" for the coach planning, "alert" for a failure. */
  role?: "status" | "alert";
  /** Two lines at most, with `more` to read the rest. */
  clamp?: boolean;
  more?: ReactNode;
  action?: ReactNode;
  /** The words at Meta size (15), where the note sits among rows (Today, the workout). */
  small?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <aside
      aria-label={who === "Coach" ? "From the coach" : who}
      className={cn("rounded-control bg-surface px-3.5 py-3", className)}
    >
      <p className="flex flex-wrap items-center gap-1.5 type-caption leading-[1.4] text-ink">
        <Glyph
          name={GLYPH[tone]}
          className={cn("glyph-16", tone === "planning" && "motion-safe:animate-spin")}
        />
        {who}
        {context && <span className="font-medium text-ink-2">· {context}</span>}
      </p>
      {title && <p className="mt-1.5 type-heading leading-[1.4] tabular-nums">{title}</p>}
      {children && (
        <div
          // A note that changes as it is read (the coach planning) announces its words alone.
          role={role}
          className={cn(
            small ? "mt-1 type-meta leading-[1.45] text-ink" : "mt-1 type-body",
            "[overflow-wrap:anywhere] tabular-nums",
            title && "mt-0.5",
            clamp && "line-clamp-2",
          )}
        >
          {children}
        </div>
      )}
      {more}
      {action && <div className="mt-2.5">{action}</div>}
    </aside>
  );
}
