"use client";

import { ChevronDown } from "@/components/ui/icons";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { INPUT_CLASS } from "./input";

/**
 * Native select: iOS opens its own picker, which is the fastest control for long lists.
 * Keep this boundary on the client so Field can attach its generated id to the select,
 * rather than to an already-rendered wrapper received from a Server Component.
 * The theme files set `color-scheme` per mode, so that picker is drawn light or dark to
 * match rather than staying on the browser default.
 *
 * What is chosen is never cut off: where it is longer than the field ("Lat pulldown · Gold's
 * Gym Andheri" on a 320-pt phone, any long choice at 200% text) it wraps between its words and
 * the field grows a line. A browser that keeps a select's text on one line ends it in an
 * ellipsis instead of cutting a word. The chevron keeps the field's inset from the edge and the
 * words keep 8 pt from it, so only the chevron itself grows with the text.
 */
export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block min-w-0", wrapperClassName)}>
      <select
        className={cn(
          INPUT_CLASS,
          "appearance-none py-[calc(8*var(--ov-u))] pr-[calc(20*var(--ov-u)+var(--ov-icon-control))] leading-snug whitespace-normal",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-[calc(12*var(--ov-u))] -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </span>
  );
}
