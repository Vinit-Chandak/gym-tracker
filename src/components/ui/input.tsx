import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export { Field } from "./field";

/**
 * A field (DESIGN.md, Inputs, 24 October 2026): 52 pt, the mode's ground (`field`), a 1-px
 * control edge, 14-px corners, 16-px text, drawn the same on every surface: the ground, a card,
 * a panel and a tray inside a panel. The edge is the field's boundary, 3:1 against what it
 * stands on, so a field is never the tone of what holds it (a lap's distance vanished on its
 * tray); focus inks it and rings it. Its insets are lengths, not type: at 200% text the words
 * double and the field grows taller, but the inset stays 16 pt, so the room goes to what is
 * typed ("Tokyo Powerhouse" whole, not "Tokyo Powerho…"). A one-line field's words that still
 * run past its edge (a hint at 200% text) end in an ellipsis rather than being cut mid-letter.
 *
 * A field that cannot be saved takes the danger tint and a danger edge until it can
 * (`aria-invalid`, which `Field` sets from its error); `ov-input` is its hook for the forms'
 * own marks (forms.css).
 */
export const INPUT_CLASS =
  "ov-input min-h-[calc(52px+var(--ov-grow))] min-w-0 w-full rounded-control border border-control bg-field px-[calc(16*var(--ov-u))] text-[length:var(--ov-type-input)] text-ellipsis text-ink placeholder:text-ink-2 focus:border-ink focus:shadow-[0_0_0_1px_var(--ov-ink)] focus:outline-none disabled:text-ink-2 aria-invalid:border-danger-line aria-invalid:bg-danger-tint aria-invalid:focus:border-danger-line aria-invalid:focus:shadow-[0_0_0_1px_var(--ov-danger-line)]";

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
