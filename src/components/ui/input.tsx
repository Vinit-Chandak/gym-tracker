import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * `line-strong` rather than `line`: this is an essential control boundary, which needs 3:1
 * against the surface behind it, while a separator between rows does not.
 */
export const INPUT_CLASS =
  "h-11 min-w-0 w-full rounded-control border border-line-strong bg-surface px-3 text-[length:var(--ov-text-input)] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none disabled:opacity-50";

/** Text input sized for thumbs; 16px text keeps iOS from zooming in on focus. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(INPUT_CLASS, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(INPUT_CLASS, "min-h-24 resize-y py-3 leading-snug", className)}
      {...props}
    />
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
};

export function Field({ label, children, error, hint }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-sm text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-ink-subtle">{hint}</span>
      ) : null}
    </label>
  );
}
