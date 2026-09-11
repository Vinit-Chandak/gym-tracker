"use client";

import { SlidersHorizontal } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Sheet } from "./sheet";

/**
 * Every filter a screen has, behind one control that sits beside its tabs.
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
  /** Visible beside the icon where the screen is wide enough for it. */
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
        aria-label={summary ? `${label}: ${summary}` : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-sm font-medium transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised",
          count > 0 ? "text-accent" : "text-ink-muted hover:text-ink",
        )}
      >
        <SlidersHorizontal className="shrink-0" aria-hidden />
        <span className="hidden min-[24rem]:inline">{label}</span>
        {count > 0 && (
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-on-accent tabular-nums">
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
