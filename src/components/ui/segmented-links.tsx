import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { cn } from "@/lib/utils";

/**
 * Narrowest a segment may be — a little wider than the longest label needs, because this is
 * what decides how many fit per row and five at their own width leave one stranded alone
 * under the first. At this width a phone wraps to a balanced 3 + 2, and the full content
 * column takes all five in one row.
 */
const MIN_SEGMENT = "5.5rem";

export type SegmentedLink = {
  href: string;
  label: string;
  current: boolean;
};

/**
 * A segmented control whose segments are destinations: the same cells on a track as
 * `SegmentedControl`, the current one inked in. Links rather than radios
 * because choosing one navigates — so it works with no JavaScript, can be opened in a new
 * tab, and is announced as the current page.
 */
export function SegmentedLinks({
  label,
  options,
  className,
}: {
  /** What the group is choosing, e.g. "Sport". */
  label: string;
  options: readonly SegmentedLink[];
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        "grid min-w-0 gap-1 rounded-control border border-line bg-surface-raised p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${MIN_SEGMENT}, 1fr))` }}
    >
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href as Route}
          aria-current={option.current ? "page" : undefined}
          className={cn(
            "flex min-h-10 min-w-0 items-center justify-center rounded-control px-2 py-1 text-center text-sm leading-tight font-medium transition-colors duration-[var(--ov-duration-feedback)]",
            "focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            option.current ? "bg-ink text-canvas" : "text-ink-muted active:text-ink",
          )}
        >
          {/* Hyphenate a long word if it must wrap; never split it at an arbitrary letter. */}
          <span className="min-w-0 hyphens-auto">{option.label}</span>
        </Link>
      ))}
    </div>
  );
}
