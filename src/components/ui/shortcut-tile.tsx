import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import type { AppIcon } from "@/components/ui/icons";

/**
 * A destination drawn as a small pinned panel: an icon in the pen's blue and a name on one
 * line. The name is the whole explanation; a destination that needs a sentence under its name
 * is a row, not a tile. Two sit side by side on a 320px screen at normal text size; enlarged
 * text gets one column. A badge wraps under the name rather than squeezing it.
 */
export function ShortcutTile<T extends string>({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: Route<T>;
  icon: AppIcon;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-full min-h-14 panel min-w-0 items-center gap-2.5 px-3 py-2 transition-[background-color,transform] duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] active:scale-[0.98] active:bg-surface-raised"
    >
      <Icon scale="row" className="text-pen" aria-hidden />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{label}</span>
        {badge}
      </span>
    </Link>
  );
}

/** Up to two tiles per row, wrapping for enlarged text; a list so a screen reader counts them. */
export function ShortcutGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(8.5rem,45%)),1fr))] gap-3">
        {children}
      </ul>
    </nav>
  );
}
