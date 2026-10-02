"use client";

import { Info } from "@/components/ui/icons";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

/**
 * The one place an explanation lives: a small circled "i" that opens a short note in
 * place. Nothing else on a screen explains itself in running text.
 *
 * The note stays inside the visual viewport and grows with the reader's text size. It is
 * portalled outside scrolling cards; inside a modal it stays in that dialog so it remains
 * interactive while the rest of the page is inert. No layout is measured while closed.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const anchor = root.current;
      const bubble = note.current;
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
    };
    reposition();
    // Long notes can scroll with a keyboard as well as touch. Escape returns focus
    // to their explanation button instead of leaving it on the document body.
    note.current?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reposition);
    if (note.current) observer?.observe(note.current);
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
      if (
        !root.current?.contains(event.target as Node) &&
        !note.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Dismiss this note first; the same Escape must not also dismiss its parent sheet.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        root.current?.querySelector("button")?.focus({ preventScroll: true });
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    target?.addEventListener("close", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      target?.removeEventListener("close", close);
    };
  }, [open, target]);

  const toggle = () => {
    if (!open && root.current) {
      setTarget(root.current.closest("dialog") ?? document.body);
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
        aria-describedby={open ? id : undefined}
        onClick={toggle}
        className={cn(
          "-m-1.5 flex size-11 items-center justify-center rounded-full text-ink-subtle transition-colors duration-[var(--ov-duration-feedback)] hover:text-ink active:bg-surface-raised",
          open && "text-pen",
        )}
      >
        <Info aria-hidden />
      </button>
      {/* Rendered only while open: a closed tip costs the page nothing but its button. */}
      {open &&
        target &&
        createPortal(
          <span
            ref={note}
            id={id}
            role="note"
            tabIndex={0}
            className="fixed z-[var(--ov-z-notice)] overflow-y-auto overscroll-contain rounded-card border border-line-strong bg-surface px-3 py-2 text-left text-sm leading-snug font-normal tracking-normal [overflow-wrap:anywhere] text-ink normal-case shadow-[0_4px_16px_rgb(0_0_0/0.14)]"
          >
            {children}
          </span>,
          target,
        )}
    </span>
  );
}
