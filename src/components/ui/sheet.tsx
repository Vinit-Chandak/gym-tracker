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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
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
      <div className="sheet-panel rounded-t-sheet border-t border-line-strong bg-surface panel-padding pb-[max(var(--panel-padding),env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <h2 className="mb-3 text-lg font-medium">{title}</h2>
        <div className="max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
