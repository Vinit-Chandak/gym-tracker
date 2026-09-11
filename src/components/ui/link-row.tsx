import { ChevronRight, type AppIcon } from "@/components/ui/icons";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The geometry every row in a box shares, so links, buttons and switches line up. */
export const ROW_CLASS = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";

/**
 * A row that reacts to a tap.
 *
 * Its focus ring is drawn inside the row rather than around it. A row runs the full width
 * of whatever holds it, so an outset ring has nowhere to go: inside a sheet or any other
 * scrolling box it is clipped on three sides, leaving one stray line across the row above.
 */
export const PRESSABLE_ROW_CLASS = cn(
  ROW_CLASS,
  "transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2 active:bg-surface-raised",
);

/** The leading icon of a row, where a screen uses them: Settings and its sub-pages. */
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
}: LinkRowProps<T>) {
  const danger = tone === "danger";
  return (
    <Link href={href} className={PRESSABLE_ROW_CLASS}>
      {icon && <RowIcon icon={icon} className={cn(danger && "text-danger")} />}
      <div className="min-w-0 flex-1">
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
      {/* Trailing actions keep a reserved column so a long name wraps instead of pushing them out. */}
      {meta && (
        <span className="max-w-[32%] shrink-0 text-right text-xs text-ink-muted tabular-nums">
          {meta}
        </span>
      )}
      <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
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
    <div className={cn(ROW_CLASS, className)}>
      {icon && <RowIcon icon={icon} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium [overflow-wrap:anywhere]">{title}</div>
        {subtitle && (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A box of rows. Rows are separated by one hairline that runs the full width of the box,
 * and the box adds no line of its own. `plain` drops the box for a list that already sits
 * inside one, such as the rows under an open disclosure or in a sheet.
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
