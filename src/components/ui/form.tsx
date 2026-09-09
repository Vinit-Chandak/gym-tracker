"use client";

import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
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
  return (
    <Button
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
