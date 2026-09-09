import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DisclosureProps = {
  summary: string;
  /** Trailing text on the summary row, so the state is readable without opening it. */
  meta?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Progressive disclosure on a native <details>: it works before hydration, is findable by
 * the browser's find-on-page in supporting browsers, and takes only its summary row when
 * closed. That last part is the point — a collapsed section must not reserve a tall blank
 * panel for content nobody has asked for.
 */
export function Disclosure({
  summary,
  meta,
  defaultOpen = false,
  className,
  children,
}: DisclosureProps) {
  return (
    <details open={defaultOpen} className={cn("group min-w-0 border-y border-line", className)}>
      <summary className="flex min-h-11 list-none items-center gap-2 py-2 text-sm font-medium">
        <ChevronDown
          className="size-4 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{summary}</span>
        {meta && <span className="shrink-0 text-xs text-ink-muted tabular-nums">{meta}</span>}
      </summary>
      <div className="pt-1 pb-3">{children}</div>
    </details>
  );
}
