"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Glyph } from "./glyphs";

/**
 * One activity of the day as a card of its own (DESIGN.md, Today): the workout, a run, a ride,
 * a swim, the rest day's mobility or a session already under way. Every card has the same
 * anatomy, so a run reads like a workout (owner, 28 October 2026): the name, and the sport's sign
 * at the end of its line; the facts that decide the day (where, how long, what it aims at); what
 * is happening now; the card's own next step and under it the quieter way out (Discard empty
 * session); then the plan, folded behind a row that names it ("Exercises", "Steps and pace").
 *
 * The plan is folded until asked for, and unfolds under its row, at the foot of the card, so
 * opening it never moves the next step away. Folded, it is inert, so it is neither read out nor
 * reachable by Tab; its row says whether it is open. Unfolding animates the plan's height
 * (220 ms, ease-out), and with reduced motion it simply appears.
 */
export function ActivityCard({
  mark,
  title,
  aside,
  facts,
  status,
  details,
  detailsLabel = "Details",
  actions,
  footer,
  muted = false,
  defaultOpen = false,
  className,
  "aria-label": ariaLabel,
}: {
  /** The sport's sign, 40 pt, at the end of the name's line (DESIGN.md, Rows and signs). */
  mark: ReactNode;
  title: ReactNode;
  /** Stands after the title on its line: a run's figure ("30 min"). */
  aside?: ReactNode;
  /** The meta line: facts, each led by its glyph. A fact may be a choice (the gym). */
  facts?: ReactNode;
  /** What is happening now: in progress, planning, done, skipped. */
  status?: ReactNode;
  /** The plan, folded until asked for. Without it the card has no fold. */
  details?: ReactNode;
  /** What the fold's row names the plan: "Exercises", "Steps and pace", "Drills". */
  detailsLabel?: string;
  actions?: ReactNode;
  /** Under the actions, a quieter way out that belongs to this card alone. */
  footer?: ReactNode;
  /** A card that is finished or skipped: its name in ink 2. */
  muted?: boolean;
  defaultOpen?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const titleId = `${id}-title`;
  const detailsId = `${id}-details`;

  return (
    <article
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-label={ariaLabel}
      className={cn("activity-card", className)}
      data-open={details ? open : undefined}
    >
      <div className="activity-card-head">
        {/* The name and its figure wrap as a pair: where both do not fit on a line (320 pt,
            200% text), the figure goes under the name rather than squeezing it into pieces. */}
        <h2 className="activity-card-name">
          <span id={titleId} className={cn("activity-card-title", muted && "text-ink-2")}>
            {title}
          </span>
          {aside && <span className="activity-card-aside">{aside}</span>}
        </h2>
        <span className="activity-card-mark">{mark}</span>
      </div>
      {facts && <div className="meta-line activity-card-facts">{facts}</div>}
      {status && <div className="activity-card-status">{status}</div>}
      {actions && <div className="activity-card-actions">{actions}</div>}
      {footer && <div className="activity-card-footer">{footer}</div>}
      {details && (
        <>
          <button
            type="button"
            className="activity-card-fold"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="min-w-0 flex-1">{detailsLabel}</span>
            <span aria-hidden className="activity-card-chevron">
              <Glyph name="chevronDown" className="glyph-20" />
            </span>
          </button>
          <div id={detailsId} className="activity-card-details" inert={!open}>
            <div className="activity-card-details-inner">{details}</div>
          </div>
        </>
      )}
    </article>
  );
}
