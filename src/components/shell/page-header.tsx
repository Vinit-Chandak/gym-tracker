import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
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
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 pt-safe backdrop-blur-md">
      <div className="mx-auto flex h-header max-w-lg items-center gap-1 px-4">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-surface-raised"
          >
            <ChevronLeft className="size-7" aria-hidden />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{title}</h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
