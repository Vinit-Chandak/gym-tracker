"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Set while the figure as it stands is still to be typed over. */
const REPLACING = "data-replacing";

/**
 * A figure typed over (DESIGN.md, Typing): a load, reps, an effort, an amount. Focused, the
 * figure as it stands shows selected, in ink, and the first key replaces it (a delete clears
 * it); the keys after that edit what was typed. There is no caret: the field being typed is the
 * one over the solid rule.
 *
 * The replacing is done here rather than left to a selection made on focus, which iOS does not
 * always honour: the caret then stood after the figure and a key was added to it, "12" and 5
 * making 125.
 */
export function FigureInput({
  className,
  onFocus,
  onChange,
  onBlur,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="text"
      autoComplete="off"
      {...props}
      className={cn("figure-input", className)}
      onFocus={(event) => {
        const input = event.currentTarget;
        input.toggleAttribute(REPLACING, input.value !== "");
        // Anything not typed over (a paste) goes after the figure, never into it.
        input.setSelectionRange(input.value.length, input.value.length);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        if (input.hasAttribute(REPLACING)) {
          input.removeAttribute(REPLACING);
          const { inputType, data } = event.nativeEvent as Partial<InputEvent>;
          if (data) input.value = data;
          else if (inputType?.startsWith("delete")) input.value = "";
        }
        onChange?.(event);
      }}
      onBlur={(event) => {
        event.currentTarget.removeAttribute(REPLACING);
        onBlur?.(event);
      }}
    />
  );
}
