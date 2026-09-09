import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { INPUT_CLASS } from "./input";

/**
 * Native select: iOS opens its own picker, which is the fastest control for long lists.
 * The theme files set `color-scheme` per mode, so that picker is drawn light or dark to
 * match rather than staying on the browser default.
 */
export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block min-w-0", wrapperClassName)}>
      <select className={cn(INPUT_CLASS, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </span>
  );
}
