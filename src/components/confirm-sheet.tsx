"use client";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * One question, one sentence, one button: the sheet a destructive tap opens before anything
 * happens. Closing it, by Escape, the backdrop or "Keep", does nothing.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{description}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button variant="ghost" size="lg" className="w-full" disabled={pending} onClick={onClose}>
          Keep
        </Button>
      </div>
    </Sheet>
  );
}
