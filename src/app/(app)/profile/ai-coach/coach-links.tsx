"use client";

import { useState } from "react";

import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { Sheet } from "@/components/ui/sheet";

/**
 * The two places you change what the coach does, behind More (board AI coach): what it plans
 * from, and every change and request, past ones included.
 */
export function CoachLinks({ waiting }: { waiting: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Goals, availability and reports; programme changes and requests"
        aria-haspopup="dialog"
        className="icon-button"
        onClick={() => setOpen(true)}
      >
        <Glyph name="more" className="glyph-24" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coaching">
        <ul className="mt-1">
          <NavRow
            href="/profile/programme/create"
            glyph="sliders"
            label="Goals, availability and reports"
          />
          <NavRow
            href="/profile/programme?view=changes"
            glyph="note"
            label="Programme changes and requests"
            value={waiting > 0 ? String(waiting) : undefined}
          />
        </ul>
      </Sheet>
    </>
  );
}
