"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      tabIndex={-1}
      className="rounded-control border border-danger bg-transparent px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

/**
 * Submit button that disables itself while the surrounding form's action is running.
 * Full width by default, for the stacked forms that are the common case; pass
 * `className="w-auto"` when it shares a row with another control, so it doesn't
 * claim the whole line and squeeze its sibling.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  disabled,
  className,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      const form = ref.current?.form;
      const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target =
        invalid?.querySelector<HTMLElement>("input, select, textarea") ??
        invalid ??
        form?.querySelector<HTMLElement>('[role="alert"]');
      target?.focus();
      target?.scrollIntoView?.({ block: "center" });
    }
    wasPending.current = pending;
  }, [pending]);
  return (
    <Button
      ref={ref}
      type="submit"
      size="lg"
      {...props}
      className={cn("w-full", className)}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
