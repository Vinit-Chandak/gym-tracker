import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export { Field } from "./field";

/**
 * A field is a cell on the sheet: an opaque white box inside a hairline strong enough to be
 * a boundary (3:1 against the sheet), with the pen's blue on focus. 16px text keeps iOS
 * from zooming in on focus.
 */
export const INPUT_CLASS =
  "h-11 min-w-0 w-full rounded-control border border-line-strong bg-surface px-3 text-[length:var(--ov-text-input)] text-ink placeholder:text-ink-ghost focus:border-pen focus:ring-1 focus:ring-pen focus:outline-none disabled:opacity-50 aria-invalid:border-danger";

/** Text input sized for thumbs. */
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
