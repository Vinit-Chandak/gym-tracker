import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

type PageHeaderProps<T extends string> = {
  title: string;
  /** Renders a back chevron linking here. */
  backHref?: Route<T>;
  /** Optional trailing control, e.g. an "Add" button. */
  action?: ReactNode;
};

export function PageHeader<T extends string>({ title, backHref, action }: PageHeaderProps<T>) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas pt-safe">
      <div className="page-width flex min-h-[var(--header-height)] items-center gap-2 py-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted active:bg-surface-raised"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 text-xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
