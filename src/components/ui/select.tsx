import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { INPUT_CLASS } from "./input";

/** Native select: iOS opens its own picker, which is the fastest control for long lists. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select className={cn(INPUT_CLASS, "appearance-none pr-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </span>
  );
}
