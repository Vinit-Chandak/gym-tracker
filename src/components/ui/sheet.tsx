"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Close } from "./icons";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Kept in view under the content, which scrolls on its own above it: what a list being built
   * adds up to, and the button that saves it. A sheet with a footer grows to the dialog's full
   * height before its content scrolls, so the footer is never pushed off the screen.
   */
  footer?: ReactNode;
  dismissible?: boolean;
};

/**
 * Bottom sheet built on the native <dialog>: focus trapping, Escape and returning focus to
 * the control that opened it all come for free. Use it for a short decision that fits; a
 * long catalogue or a form belongs in a full-height view with one scroll region.
 */
export function Sheet({ open, onClose, title, children, footer, dismissible = true }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const resize = () => {
      const dialog = ref.current;
      const content = panel.current;
      if (!dialog || !content) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const available = height * 0.94;
      dialog.style.setProperty("--sheet-height", `${available}px`);
      dialog.style.setProperty(
        "--sheet-bottom",
        `${Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))}px`,
      );
      const padding =
        parseFloat(getComputedStyle(content).paddingTop) +
        parseFloat(getComputedStyle(content).paddingBottom);
      const minimumBody = parseFloat(getComputedStyle(document.documentElement).fontSize) * 6;
      // A tall footer must not shrink the fields to zero. Short screens use one scroll area.
      content.dataset.compact = String(
        Boolean(bottom.current) &&
          bottom.current!.offsetHeight +
            (heading.current?.offsetHeight ?? 0) +
            padding +
            minimumBody >
            available,
      );
    };
    resize();
    let frame = 0;
    // Measuring a footer and changing its layout in the same observer delivery can trigger
    // WebKit's ResizeObserver loop error. Apply the layout in the next animation frame.
    const scheduleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleResize);
    if (heading.current) observer?.observe(heading.current);
    if (bottom.current) observer?.observe(bottom.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      /*
       * Opening a dialog otherwise focuses its first tappable child, which paints a focus
       * ring on whichever row happens to be first — a highlight nobody asked for, on a row
       * nobody chose. The panel takes the focus instead: the sheet is still announced and
       * Escape still closes it, and the first Tab goes to that same first row.
       */
      panel.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      onClick={(event) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "sheet-panel rounded-t-sheet bg-surface panel-padding pb-[max(var(--panel-padding),env(safe-area-inset-bottom))] focus:outline-none",
          footer && "sheet-with-footer",
        )}
      >
        <div ref={heading} className="shrink-0">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-lg font-medium">{title}</h2>
            <button
              type="button"
              aria-label="Close sheet"
              disabled={!dismissible}
              onClick={onClose}
              className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted disabled:opacity-45"
            >
              <Close aria-hidden />
            </button>
          </div>
        </div>
        <div
          className={cn(
            "sheet-body overflow-y-auto overscroll-contain",
            footer ? "min-h-0 flex-1" : "max-h-[70dvh]",
          )}
        >
          {children}
        </div>
        {footer && (
          <div
            ref={bottom}
            className="sheet-footer -mx-[var(--panel-padding)] mt-3 shrink-0 border-t border-line px-[var(--panel-padding)] pt-3"
          >
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
