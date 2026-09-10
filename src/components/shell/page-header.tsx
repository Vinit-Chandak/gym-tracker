import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

import { sectionLabel } from "@/lib/nav";

type PageHeaderProps<T extends string> = {
  title: string;
  /** One line of context above the title, when the title alone leaves a question open. */
  context?: string;
  /** Renders a back chevron linking here. */
  backHref?: Route<T>;
  /** Label for the back control, when "Back" is vaguer than the destination. */
  backLabel?: string;
  /** Optional trailing control, e.g. an "Add" button. */
  action?: ReactNode;
};

/**
 * Every screen's opening block: where you are, then what this is.
 *
 * The small line runs above the title rather than under it, in the same letterspaced
 * uppercase a card uses for its own eyebrow, so the two read as one device throughout the
 * app. It carries the screen's context where there is one — the range History and Progress
 * are drawn over, the date Today is — and otherwise the section the back chevron leads to,
 * which is the trail a lone chevron only hints at. The rule underneath separates the header
 * from content scrolling beneath it, which a colour alone cannot do while both are canvas.
 */
export function PageHeader<T extends string>({
  title,
  context,
  backHref,
  backLabel = "Back",
  action,
}: PageHeaderProps<T>) {
  const eyebrow = context ?? (backHref ? sectionLabel(backHref) : undefined);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-safe">
      <div className="page-width flex min-h-[var(--header-height)] items-center gap-2 py-2.5">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className="truncate text-xs font-semibold tracking-[0.1em] text-ink-muted uppercase"
              title={eyebrow}
            >
              {eyebrow}
            </p>
          )}
          <h1 className="mt-0.5 text-xl [overflow-wrap:anywhere]">{title}</h1>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
