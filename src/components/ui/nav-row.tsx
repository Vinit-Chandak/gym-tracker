import type { Route } from "next";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import Link from "./app-link";
import { Figures } from "./figures";
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
  strong = false,
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
  /** Something waiting there, in ink as news: "1 request". */
  badge?: ReactNode;
  /** What marks it out, in an ink outline: "Default". */
  tag?: ReactNode;
  /** A control in place of the chevron: the rest timer's switch. */
  trailing?: ReactNode;
  /** A row naming a thing done or to do (Upper A) rather than a setting: its name at 600. */
  strong?: boolean;
  prefetch?: "intent";
  className?: string;
}) {
  const marks = (
    <>
      {badge && <span className="nav-row-badge">{badge}</span>}
      {tag && <span className="nav-row-tag">{tag}</span>}
    </>
  );
  const content = (
    <>
      {(glyph || lead) && (
        <span className="mark-cell">
          {glyph ? <Glyph name={glyph} className="glyph-20" /> : lead}
        </span>
      )}
      {/* The name and what marks it share a line while the name keeps room for a word beside
          them, and the mark goes under the name before it would break a word (large text). */}
      <span className="nav-row-main">
        {sub ? (
          <span className="nav-row-text">
            {/* The mark stands beside the name alone: the line under it keeps the row's
                width, so "Machine · Chest, Front delts" is not broken for a Per machine tag. */}
            <span className="nav-row-head">
              <span className="nav-row-label nav-row-label-bold">{label}</span>
              {marks}
            </span>
            {/* "101 machines": its figures tabular (DESIGN.md, The One
                Voices Rule); a sentence has none, and is left as it is. */}
            <span className="nav-row-sub">
              {typeof sub === "string" ? <Figures>{sub}</Figures> : sub}
            </span>
          </span>
        ) : (
          <>
            <span className={cn("nav-row-label", strong && "nav-row-label-bold")}>{label}</span>
            {marks}
          </>
        )}
      </span>
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
