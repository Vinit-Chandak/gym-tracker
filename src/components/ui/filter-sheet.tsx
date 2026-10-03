"use client";

import { useState, type ReactNode } from "react";

import { Glyph } from "./glyphs";
import { Sheet } from "./sheet";

/**
 * Every filter a screen has, behind one control: the funnel, at the end of the screen's title
 * (DESIGN.md, Navigation), with a count of the filters set.
 *
 * The panel is the bottom sheet, so it is always inside the screen whatever the device: it
 * is anchored to the bottom edge, capped at 90dvh and scrolls its own content, rather than
 * hanging off the side of a narrow phone the way an anchored menu can. Nothing inside it is
 * rendered while it is closed, so the filters cost the page one button until they are asked
 * for.
 */
export function FilterSheet({
  title,
  label = "Filters",
  summary,
  count = 0,
  children,
}: {
  /** Names the panel, and the button that opens it. */
  title: string;
  /** The control's name, said with the summary. */
  label?: string;
  /** What the filters currently say, for the button's accessible name: the date range. */
  summary?: string;
  /** How many filters are set, shown as a count on the button. */
  count?: number;
  /** The panel's contents, given the way to close it once a choice has taken effect. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${summary ? `${label}: ${summary}` : label}${
          count > 0 ? `, ${count} set` : ""
        }`}
        className="filter-button"
      >
        <Glyph name="filter" className="glyph-24" />
        {count > 0 && (
          <span aria-hidden className="filter-count">
            {count}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {open && <div className="space-y-4">{children(() => setOpen(false))}</div>}
      </Sheet>
    </>
  );
}
