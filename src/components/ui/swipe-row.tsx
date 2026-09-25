"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** How far a finger may wander before it counts as a swipe or a scroll, in CSS pixels. */
const SLOP = 8;

/** How long after a swipe ends a click is taken to be the swipe's own, in milliseconds. */
const SWIPE_CLICK_MS = 400;

/**
 * A row that slides aside to show one action behind it, the way a mail app's list does: drag it
 * towards the start and the action is there, drag it back or tap the row and it is gone again.
 *
 * Swiping only reveals the action; using it is still a tap. A flick while scrolling can never
 * set it off, and nothing is lost to a swipe that went further than meant. Vertical movement is
 * left to the browser (`touch-action: pan-y`), so the list still scrolls under a thumb that lands
 * on a row.
 *
 * A swipe is a shortcut, never the only way: whatever the row opens must offer the same action,
 * for a keyboard, a switch or a screen reader. Until the row is swiped open its action is inert,
 * out of the tab order and out of the accessibility tree.
 */
export function SwipeRow({
  children,
  action,
  actionLabel,
  onAction,
  disabled = false,
}: {
  children: ReactNode;
  /** What the revealed button says: "Delete". */
  action: string;
  /** Its accessible name, which says what it acts on: "Delete Afternoon meal 1". */
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    from: number;
    swiping: boolean;
  } | null>(null);
  const swipeEndedAt = useRef(-Infinity);
  // Where the row is now: pointer events can arrive faster than it renders, so the end of a
  // swipe reads this rather than the last rendered offset.
  const live = useRef(0);
  const revealed = offset < 0 && !dragging;

  const moveTo = (next: number) => {
    live.current = next;
    setOffset(next);
  };

  // The action's own width is how far the row opens, so a longer label at a larger text size
  // opens it further rather than being clipped.
  const actionWidth = () => actionButton.current?.offsetWidth ?? 88;

  // Touching anything else closes an open row, as a tap anywhere closes an open menu.
  useEffect(() => {
    if (!revealed) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      live.current = 0;
      setOffset(0);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [revealed]);

  const settle = () => {
    const open = live.current < -actionWidth() / 2;
    swipeEndedAt.current = performance.now();
    setDragging(false);
    moveTo(open ? -actionWidth() : 0);
  };

  return (
    <div ref={root} className="relative overflow-hidden">
      <button
        ref={actionButton}
        type="button"
        inert={!revealed}
        aria-label={actionLabel}
        onClick={() => {
          moveTo(0);
          onAction();
        }}
        className="absolute inset-y-0 right-0 flex min-w-[5.5rem] items-center justify-center bg-danger px-4 font-medium text-on-accent focus-visible:-outline-offset-4"
      >
        {action}
      </button>
      <div
        data-swipe-row=""
        className={cn(
          "relative touch-pan-y bg-surface",
          !dragging &&
            "transition-transform duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-standard)]",
        )}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
        onPointerDown={(event) => {
          if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
          gesture.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            from: live.current,
            swiping: false,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.swiping) {
            if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
            // Mostly up or down: a scroll, which is the browser's and not the row's.
            if (Math.abs(dy) >= Math.abs(dx)) {
              gesture.current = null;
              return;
            }
            current.swiping = true;
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }
          // A little past the action and no further, so the row cannot be thrown off screen.
          moveTo(Math.min(0, Math.max(-actionWidth() * 1.25, current.from + dx)));
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointerId !== event.pointerId) return;
          const swiping = gesture.current.swiping;
          gesture.current = null;
          if (swiping) settle();
        }}
        onPointerCancel={(event) => {
          if (gesture.current?.pointerId !== event.pointerId) return;
          const swiping = gesture.current.swiping;
          gesture.current = null;
          if (swiping) settle();
        }}
        onClickCapture={(event) => {
          // The click a mouse sends at the end of a drag is the drag's, not a tap on the row.
          const afterSwipe = performance.now() - swipeEndedAt.current < SWIPE_CLICK_MS;
          if (afterSwipe || revealed) {
            event.preventDefault();
            event.stopPropagation();
            // A tap on a row that is open closes it, and does nothing else.
            if (!afterSwipe) moveTo(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
