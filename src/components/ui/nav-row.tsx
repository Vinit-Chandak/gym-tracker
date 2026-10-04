import type { Route } from "next";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import Link from "./app-link";
import { Glyph, type GlyphName } from "./glyphs";

/**
 * A row that opens a page, or holds a setting (boards Training, Profile): its glyph in the mark
 * column, its name, what it is set to, then a chevron, or the control itself at the end. One
 * hairline between rows in a list, none after the last.
 */
export function NavRow<T extends string>({
  href,
  glyph,
  lead,
  label,
  sub,
  value,
  badge,
  tag,
  trailing,
  prefetch,
  className,
}: {
  /** Where the row goes; without it the row only holds `trailing`, a switch. */
  href?: Route<T>;
  glyph?: GlyphName;
  /** Something other than a glyph in the mark column: a Phosphor icon (Install). */
  lead?: ReactNode;
  label: ReactNode;
  /** A second line under the name: "33 available", "93 machines". */
  sub?: ReactNode;
  /** What it is set to, in ink 2 before the chevron: "System". */
  value?: ReactNode;
  /** Something waiting there, in an ink pill: "1 request". */
  badge?: ReactNode;
  /** What marks it out, in an ink outline: "Default". */
  tag?: ReactNode;
  /** A control in place of the chevron: the rest timer's switch. */
  trailing?: ReactNode;
  prefetch?: "intent";
  className?: string;
}) {
  const content = (
    <>
      {(glyph || lead) && (
        <span className="mark-cell">
          {glyph ? <Glyph name={glyph} className="glyph-20" /> : lead}
        </span>
      )}
      {sub ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="nav-row-label nav-row-label-bold">{label}</span>
          <span className="nav-row-sub">{sub}</span>
        </span>
      ) : (
        <span className="nav-row-label">{label}</span>
      )}
      {badge && <span className="nav-row-badge">{badge}</span>}
      {tag && <span className="nav-row-tag">{tag}</span>}
      {value && <span className="nav-row-value">{value}</span>}
      {trailing ??
        (href && <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />)}
    </>
  );
  return (
    <li className={cn("nav-row-item", className)}>
      {href ? (
        <Link href={href} prefetch={prefetch} className="nav-row">
          {content}
        </Link>
      ) : (
        <div className="nav-row">{content}</div>
      )}
    </li>
  );
}
