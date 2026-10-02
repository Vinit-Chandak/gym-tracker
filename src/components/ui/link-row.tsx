import { ChevronRight, type AppIcon } from "@/components/ui/icons";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The geometry every row in a block shares, so links, buttons and switches line up. Rows run
 * flush with the rules above and below them: the sheet is one column, and its text starts
 * where its rules start.
 */
export const ROW_CLASS = "flex min-h-14 w-full items-center gap-3 px-0 py-3 text-left";

/**
 * A row that reacts to a tap.
 *
 * Its focus ring is drawn inside the row rather than around it. A row runs the full width
 * of whatever holds it, so an outset ring has nowhere to go.
 */
export const PRESSABLE_ROW_CLASS = cn(
  ROW_CLASS,
  "transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2 active:bg-surface-raised",
);

/** The leading icon of a row, where a screen uses them: Profile and its sub-pages. */
export function RowIcon({ icon: Icon, className }: { icon: AppIcon; className?: string }) {
  return <Icon scale="row" className={cn("shrink-0 text-ink-muted", className)} aria-hidden />;
}

type LinkRowProps<T extends string> = {
  href: Route<T>;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  meta?: string;
  icon?: AppIcon;
  /** `danger` for a destination that destroys something, so the row says so before it is opened. */
  tone?: "default" | "danger";
  /** `"intent"` for rows in long lists: prefetch on touch rather than on scrolling into view. */
  prefetch?: "intent";
};

/** Tappable row with a chevron; at least 56px tall for gym use. */
export function LinkRow<T extends string>({
  href,
  title,
  subtitle,
  badge,
  meta,
  icon,
  tone = "default",
  prefetch,
}: LinkRowProps<T>) {
  const danger = tone === "danger";
  return (
    <Link
      href={href}
      prefetch={prefetch}
      // A row leads one level deeper, so the next sheet slides in from the right.
      transitionTypes={["nav-forward"]}
      className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}
    >
      <div className="flex min-w-0 flex-[1_1_10rem] flex-wrap items-center gap-x-3 gap-y-1">
        {icon && <RowIcon icon={icon} className={cn(danger && "text-danger")} />}
        <div className="min-w-0 flex-[1_1_8rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={cn("font-medium [overflow-wrap:anywhere]", danger && "text-danger")}>
              {title}
            </p>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {/* Move secondary content below the label before it squeezes words into letter stacks. */}
      <div className="ml-auto flex max-w-full items-center gap-2">
        {meta && (
          <span className="min-w-0 text-right text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
            {meta}
          </span>
        )}
        <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
      </div>
    </Link>
  );
}

/**
 * A row that leads nowhere: a switch, a value, a form. The same geometry as a link row,
 * with whatever sits at the trailing edge passed as children.
 */
export function Row({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon?: AppIcon;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(ROW_CLASS, "flex-wrap", className)}>
      <div className="flex min-w-0 flex-[1_1_10rem] flex-wrap items-center gap-x-3 gap-y-1">
        {icon && <RowIcon icon={icon} />}
        <div className="min-w-0 flex-[1_1_8rem]">
          <div className="flex flex-wrap items-center gap-1 font-medium [overflow-wrap:anywhere]">
            {title}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * A block of rows, ruled above, below and between. `plain` drops the outer rules for a list
 * that already sits inside a ruled block, a disclosure or a sheet.
 */
export function List({
  children,
  className,
  plain = false,
}: {
  children: ReactNode;
  className?: string;
  plain?: boolean;
}) {
  return <ul className={cn(plain ? "min-w-0 ruled-list" : "box-rows", className)}>{children}</ul>;
}
