import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

type LinkRowProps<T extends string> = {
  href: Route<T>;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  meta?: string;
};

/** Tappable list row with a chevron; at least 56px tall for gym use. */
export function LinkRow<T extends string>({ href, title, subtitle, badge, meta }: LinkRowProps<T>) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-surface-raised"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{title}</p>
          {badge}
        </div>
        {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {meta && <span className="shrink-0 text-sm text-ink-muted tabular-nums">{meta}</span>}
      <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {children}
    </ul>
  );
}
