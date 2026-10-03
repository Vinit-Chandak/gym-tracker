"use client";

import { useState } from "react";

import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";

/**
 * One of the two promises behind a row (board Privacy): what a follower can see, what nobody
 * can. The row opens the list in a sheet, so the switches lead the page.
 */
export function PrivacyListRow({
  glyph,
  title,
  lines,
}: {
  glyph: GlyphName;
  title: string;
  lines: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="nav-row-item">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="nav-row w-full text-left"
      >
        <span className="mark-cell">
          <Glyph name={glyph} className="glyph-20" />
        </span>
        <span className="nav-row-label">{title}</span>
        <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <ul className="mt-1">
          {lines.map((line) => (
            <li
              key={line}
              className="border-b border-hair py-2.5 type-meta leading-[1.4] last:border-b-0"
            >
              {line}
            </li>
          ))}
        </ul>
      </Sheet>
    </li>
  );
}
