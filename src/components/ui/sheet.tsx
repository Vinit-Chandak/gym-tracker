"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Bottom sheet built on the native <dialog>: focus trapping, Escape and returning focus to
 * the control that opened it all come for free. Use it for a short decision that fits; a
 * long catalogue or a form belongs in a full-height view with one scroll region.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);

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
      onClick={(event) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="sheet-panel rounded-t-sheet bg-surface panel-padding pb-[max(var(--panel-padding),env(safe-area-inset-bottom))] focus:outline-none"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <h2 className="mb-3 text-lg font-medium">{title}</h2>
        <div className="max-h-[70dvh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </dialog>
  );
}
