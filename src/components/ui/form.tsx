"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "./button";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

/** Submit button that disables itself while the surrounding form's action is running. */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
