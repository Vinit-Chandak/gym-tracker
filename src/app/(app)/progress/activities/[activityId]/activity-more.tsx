"use client";

import type { Route } from "next";
import { useState } from "react";

import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";

import { DeleteActivityButton, type AnsweredOnDelete } from "./delete-button";

/**
 * What can be done to a logged activity, behind More (board Run): correct it, or delete it.
 * Deleting still asks twice and says what goes with it.
 */
export function ActivityMore({
  label,
  title,
  editHref,
  activityId,
  noun,
  answered,
}: {
  /** What More is called aloud: "Correct or delete this run". */
  label: string;
  title: string;
  editHref: Route;
  activityId: string;
  /** What it is, as deleting it names it: "run", "ride", "swim". */
  noun?: string;
  /** What deleting it does to the planned session it answered, said before it is done. */
  answered: AnsweredOnDelete;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        className="icon-button"
        onClick={() => setOpen(true)}
      >
        <Glyph name="more" className="glyph-24" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <ul className="mt-1">
          <li>
            <Link href={editHref} className="sheet-row" onClick={() => setOpen(false)}>
              <Glyph name="edit" className="glyph-22" />
              Correct this activity
            </Link>
          </li>
        </ul>
        <div className="mt-3">
          <DeleteActivityButton activityId={activityId} noun={noun} answered={answered} />
        </div>
      </Sheet>
    </>
  );
}
