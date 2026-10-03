import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export { Field } from "./field";

/**
 * A field (DESIGN.md, Inputs): 52 pt, ground, a 1.5-px control border, 14-px corners, 16-px
 * text. The control border is an essential boundary, 3:1 against the ground; focus inks it.
 */
export const INPUT_CLASS =
  "min-h-[calc(52px+var(--ov-grow))] min-w-0 w-full rounded-control border-[1.5px] border-control bg-ground px-4 text-[length:var(--ov-type-input)] text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none disabled:text-ink-2";

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
