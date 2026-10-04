"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Glyph } from "./glyphs";

/**
 * The coach's note at two lines with More, which opens the rest in place (DESIGN.md, Coach
 * note): the same quiet block as `CoachNote`, for a screen where the note stands over a list
 * (the workout). More shows only when the words are really cut, and Less folds them again.
 */
export function CoachNoteMore({
  who = "Coach",
  className,
  children,
}: {
  who?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const words = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    const element = words.current;
    if (!element || open) return;
    const measure = () => setCut(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  return (
    <aside
      aria-label={who === "Coach" ? "From the coach" : who}
      className={cn("rounded-control bg-surface px-3.5 py-3", className)}
    >
      <p className="flex flex-wrap items-center gap-1.5 type-caption leading-[1.4] text-ink">
        <Glyph name="coach" className="glyph-16" />
        {who}
      </p>
      <div
        ref={words}
        id={id}
        className={cn(
          "mt-1 type-meta leading-[1.45] [overflow-wrap:anywhere] text-ink tabular-nums",
          !open && "line-clamp-2",
        )}
      >
        {children}
      </div>
      {(cut || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          className="-my-2.5 -ml-1.5 min-h-11 min-w-11 px-1.5 type-meta font-bold"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </aside>
  );
}
