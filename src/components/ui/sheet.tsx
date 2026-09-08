"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Bottom sheet built on the native <dialog>: focus trapping and Escape come for free. */
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
      <div className="rounded-t-card border border-line bg-surface p-4 pb-safe">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        <div className="max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
