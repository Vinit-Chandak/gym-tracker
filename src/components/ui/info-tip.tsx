"use client";

import { Info } from "@/components/ui/icons";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  preferredWidth = NOTE_WIDTH,
): { left: number; width: number } {
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - EDGE * 2));
  const left = Math.max(EDGE, Math.min(buttonLeft, viewportWidth - EDGE - width));
  return { left: left - buttonLeft, width };
}

/** Whether the browser can show an element in the top layer (Safari 17, Chrome 114 and later). */
function hasTopLayer(): boolean {
  return (
    typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function"
  );
}

/**
 * Where a short explanation lives, a sentence or two: a small circled "i" that opens a note in
 * place. A longer passage is a `Disclosure`, closed; nothing on a screen explains itself in
 * running text (DESIGN.md, The Need-to-Know Rule).
 *
 * The note is the button's next sibling, so a screen reader meets the button, then the note, then
 * what follows, and opening it leaves focus on the button, which says it is expanded. Where the
 * browser has a top layer the note is shown there as a popover, above a scrolling card's clip and
 * a sheet while staying in place in the page; elsewhere it is drawn fixed in place. It stays
 * inside the visual viewport and grows with the reader's text size, and it closes on the button,
 * Escape, a tap elsewhere or focus moving to another control. No layout is measured while closed.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  // A note longer than the screen allows scrolls, and is then a Tab stop of its own.
  const [scrolls, setScrolls] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const bubble = note.current;
    if (bubble && typeof bubble.showPopover === "function" && !bubble.matches(":popover-open"))
      bubble.showPopover();
    const reposition = () => {
      const anchor = root.current;
      if (!anchor || !bubble) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const rect = anchor.getBoundingClientRect();
      const textSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const place = placeNote(rect.left - viewportLeft, width, textSize * 18);
      bubble.style.width = `${place.width}px`;
      bubble.style.left = `${rect.left + place.left}px`;
      bubble.style.maxHeight = `${Math.max(0, height - EDGE * 2)}px`;
      const noteHeight = bubble.getBoundingClientRect().height;
      const below = rect.bottom + 4;
      const above = rect.top - noteHeight - 4;
      const lastTop = viewportTop + height - EDGE - noteHeight;
      const top = below <= lastTop ? below : above >= viewportTop + EDGE ? above : lastTop;
      bubble.style.top = `${Math.max(viewportTop + EDGE, Math.min(top, lastTop))}px`;
      setScrolls(bubble.scrollHeight > bubble.clientHeight + 1);
    };
    reposition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reposition);
    if (bubble) observer?.observe(bubble);
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Dismiss this note first; the same Escape must not also dismiss its parent sheet.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus({ preventScroll: true });
      }
    };
    const close = () => setOpen(false);
    // A note inside a sheet goes when the sheet does.
    const dialog = root.current?.closest("dialog");
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    dialog?.addEventListener("close", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      dialog?.removeEventListener("close", close);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className={cn("relative inline-flex shrink-0 align-middle", className)}
      onBlur={(event) => {
        // Focus moving to another control closes the note, so it never covers what has focus.
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        // The full target, overhanging the line it sits on rather than heightening it: it takes
        // one em, never more than the words beside it, so a label or a heading with a tip sits
        // where one without sits (DESIGN.md, The Rhythm Rule).
        className={cn(
          "-mx-1.5 my-[calc((1em-var(--ov-target))/2)] flex size-[var(--ov-target)] items-center justify-center rounded-full text-ink-subtle transition-colors duration-[var(--ov-duration-feedback)] hover:text-ink active:bg-surface-raised",
          open && "text-accent",
        )}
      >
        <Info aria-hidden />
      </button>
      {/* Rendered only while open: a closed tip costs the page nothing but its button. */}
      {open && (
        <span
          ref={note}
          id={id}
          role="note"
          popover={hasTopLayer() ? "manual" : undefined}
          tabIndex={scrolls ? 0 : -1}
          className="fixed inset-auto z-[var(--ov-z-notice)] m-0 overflow-y-auto overscroll-contain rounded-card border border-line-strong bg-surface px-3 py-2 text-left text-sm leading-snug font-normal tracking-normal [overflow-wrap:break-word] text-ink normal-case shadow-sm outline-offset-2"
        >
          {children}
        </span>
      )}
    </span>
  );
}
