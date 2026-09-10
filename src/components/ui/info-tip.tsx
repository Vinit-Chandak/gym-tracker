"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type InfoTipProps = {
  /** What the tip explains, for the button's accessible name: "About the rest timer". */
  label: string;
  children: ReactNode;
  className?: string;
};

/** Widest a note grows, and the least it keeps from either edge of the screen. */
const NOTE_WIDTH = 288;
const EDGE = 12;

/**
 * Where the note goes, relative to its button: under it, starting at the button's left
 * edge, then slid just far enough that it stays `EDGE` px inside the screen on both sides.
 * Exported for the test; the maths is the only part of this component worth one.
 */
export function placeNote(
  buttonLeft: number,
  viewportWidth: number,
): { left: number; width: number } {
  const width = Math.min(NOTE_WIDTH, viewportWidth - EDGE * 2);
  const left = Math.max(EDGE, Math.min(buttonLeft, viewportWidth - EDGE - width));
  return { left: left - buttonLeft, width };
}

/**
 * The one place an explanation lives: a small circled "i" that opens a short note in
 * place. Nothing else on a screen explains itself in running text.
 *
 * It is deliberately cheap. The note is plain markup positioned beside its button — no
 * portal, no dialog, no layout measurement while closed — and the document listeners that
 * close it exist only while it is open. A second tap, a tap anywhere else or Escape closes
 * it. The one measurement it makes is on opening: where the button is, so the note can be
 * slid inside the screen rather than hanging off its edge.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ left: 0, width: NOTE_WIDTH });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open && root.current) {
      setPlace(placeNote(root.current.getBoundingClientRect().left, window.innerWidth));
    }
    setOpen((current) => !current);
  };

  return (
    <span ref={root} className={cn("relative inline-flex shrink-0 align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-ink-subtle transition-colors duration-[var(--ov-duration-feedback)] hover:text-ink active:bg-surface-raised",
          open && "text-accent",
        )}
      >
        <Info className="size-4" aria-hidden />
      </button>
      {/* Rendered only while open: a closed tip costs the page nothing but its button. */}
      {open && (
        <span
          id={id}
          role="note"
          style={{ left: place.left, width: place.width }}
          className="absolute top-full z-[var(--ov-z-notice)] mt-1 rounded-card border border-line-strong bg-surface px-3 py-2 text-left text-sm leading-snug font-normal tracking-normal text-ink normal-case shadow-sm"
        >
          {children}
        </span>
      )}
    </span>
  );
}
