import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
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
      className="flex min-h-14 items-center gap-3 px-[var(--panel-padding)] py-3 transition-colors hover:bg-surface-raised/60 active:bg-surface-raised"
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
      {meta && (
        <span className="max-w-[32%] shrink-0 text-right text-xs text-ink-muted tabular-nums">
          {meta}
        </span>
      )}
      <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="min-w-0 divide-y divide-line/60 overflow-hidden rounded-card bg-surface ring-1 ring-line/50 ring-inset">
      {children}
    </ul>
  );
}
