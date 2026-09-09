import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

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
      className="flex min-h-14 items-center gap-3 py-3 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium [overflow-wrap:anywhere]">{title}</p>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{subtitle}</p>
        )}
      </div>
      {/* Trailing actions keep a reserved column so a long name wraps instead of pushing them out. */}
      {meta && (
        <span className="max-w-[32%] shrink-0 text-right text-xs text-ink-muted tabular-nums">
          {meta}
        </span>
      )}
      <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}

/**
 * Ruled list. Rows are separated by a line and share the page gutters rather than sitting
 * in a panel, so a list of destinations reads as part of the page.
 */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("min-w-0 border-y border-line ruled-list", className)}>{children}</ul>;
}
