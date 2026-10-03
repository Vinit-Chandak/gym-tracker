"use client";

import type { Route } from "next";
import { useState, type ReactNode } from "react";

import Link from "@/components/ui/app-link";

import { Glyph } from "./glyphs";
import { Sheet } from "./sheet";

export type SectionOption<V extends string> = {
  value: V;
  label: string;
  /**
   * For a section that is a page of its own: choosing it opens that page in this one's place.
   * It is a link, so it can be opened in a new tab like any other.
   */
  href?: Route;
  /** Loads that page whole once the list shows it, for one chosen often enough to be instant. */
  prefetch?: boolean;
};

/**
 * One screen's sections behind a single control (DESIGN.md, Navigation: one button naming the
 * current one, which opens a sheet of them), with whatever belongs to the whole screen beside
 * it: the range the section shows, in practice.
 *
 * Five destinations as tabs cost two rows of a phone's width, which is a strip of chrome
 * taller than some of the panels underneath it. Naming only the section you are in takes
 * one row, and the rest arrive in the same bottom sheet the app already uses for a short
 * decision: anchored to the bottom edge, capped at 90dvh, never hanging off a narrow
 * screen, and identical on iOS and Android — which a native select is not.
 */
export function SectionSelect<V extends string>({
  label,
  options,
  value,
  onChange,
  action,
}: {
  /** Names the control and the sheet: "Progress section". */
  label: string;
  options: readonly SectionOption<V>[];
  value: V;
  /** Called with a section chosen in place; one with an `href` is navigated to instead. */
  onChange?: (value: V) => void;
  /** A control belonging to the whole screen rather than to one section. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <div className="section-select">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={current ? `${label}: ${current.label}` : label}
        className="section-select-button"
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{current?.label}</span>
        <Glyph name="chevronDown" className="glyph-18" />
      </button>
      {action}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul className="min-w-0">
          {options.map((option) => {
            const selected = option.value === value;
            const className = "sheet-row";
            // The section you are in carries a check, and is named as current to a screen
            // reader; the control that opened the sheet already names it too.
            const content = (
              <>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
                {selected && <Glyph name="check" className="glyph-20" />}
              </>
            );
            return (
              <li key={option.value}>
                {option.href && !selected ? (
                  // Replaces this entry, as a section chosen in place does: Back leaves the
                  // screen rather than stepping back through the sections looked at.
                  <Link
                    href={option.href}
                    prefetch={option.prefetch}
                    replace
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      if (!selected) onChange?.(option.value);
                      setOpen(false);
                    }}
                    className={className}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
