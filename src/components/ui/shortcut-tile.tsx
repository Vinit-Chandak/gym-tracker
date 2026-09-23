import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import type { AppIcon } from "@/components/ui/icons";

/**
 * A destination drawn as a small box: an icon and a name on one line, the way Hevy's
 * dashboard does it. The name is the whole explanation; a destination that needs a sentence
 * under its name is a row, not a tile. Two sit side by side on a 320px screen, and a badge
 * wraps under the name rather than squeezing it.
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
      className="flex min-h-14 box items-center gap-2.5 px-3 py-2 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      <Icon scale="row" className="text-accent" aria-hidden />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{label}</span>
        {badge}
      </span>
    </Link>
  );
}

/** Tiles two to a row, as a list of destinations so a screen reader counts them. */
export function ShortcutGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-2 gap-3">{children}</ul>
    </nav>
  );
}
