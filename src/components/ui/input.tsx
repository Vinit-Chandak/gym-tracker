import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export { Field } from "./field";

/**
 * A field (DESIGN.md, Inputs): 52 pt, ground, a 1.5-px control border, 14-px corners, 16-px
 * text. The control border is an essential boundary, 3:1 against the ground; focus inks it.
 * Its insets are lengths, not type: at 200% text the words double and the field grows taller,
 * but the inset stays 16 pt, so the room goes to what is typed ("Tokyo Powerhouse" whole, not
 * "Tokyo Powerho…"). A one-line field's words that still run past its edge (a hint at 200% text)
 * end in an ellipsis rather than being cut mid-letter.
 */
export const INPUT_CLASS =
  "min-h-[calc(52px+var(--ov-grow))] min-w-0 w-full rounded-control border-[1.5px] border-control bg-ground px-[calc(16*var(--ov-u))] text-[length:var(--ov-type-input)] text-ellipsis text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none disabled:text-ink-2";

/** Text input sized for thumbs; 16px text keeps iOS from zooming in on focus. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(INPUT_CLASS, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        INPUT_CLASS,
        "min-h-24 resize-y py-[calc(12*var(--ov-u))] leading-snug",
        className,
      )}
      {...props}
    />
  );
}
