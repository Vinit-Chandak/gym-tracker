import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

type PageHeaderProps<T extends string> = {
  title: string;
  /** One line of context under the title, when the title alone leaves a question open. */
  context?: string;
  /** Renders a back chevron linking here. */
  backHref?: Route<T>;
  /** Label for the back control, when "Back" is vaguer than the destination. */
  backLabel?: string;
  /** Optional trailing control, e.g. an "Add" button. */
  action?: ReactNode;
};

export function PageHeader<T extends string>({
  title,
  context,
  backHref,
  backLabel = "Back",
  action,
}: PageHeaderProps<T>) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-safe">
      <div className="page-width flex min-h-[var(--header-height)] items-center gap-2 py-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted active:bg-surface-raised"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl [overflow-wrap:anywhere]">{title}</h1>
          {context && (
            <p className="mt-0.5 truncate text-xs text-ink-muted" title={context}>
              {context}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
