import type { Route } from "next";

import Link from "./app-link";
import { Glyph } from "./glyphs";

/**
 * A link inside a card, as tall as a target (See what you logged, Skip or move, Programme fit):
 * in ink and bold, led on by its chevron. The chevron is held to the label's last word, so a
 * label that wraps at large text ends "logged ›" under its first words rather than leaving the
 * chevron at the card's far edge, beside the gap between its lines (year audit, October 2026).
 */
export function CardLink<T extends string>({
  href,
  children: label,
}: {
  href: Route<T>;
  /** The label, whose last word keeps the chevron. */
  children: string;
}) {
  const at = label.lastIndexOf(" ") + 1;
  return (
    <Link href={href} className="activity-card-link">
      {label.slice(0, at)}
      <span className="activity-card-link-end">
        {label.slice(at)}
        <Glyph name="chevronRight" className="glyph-18" />
      </span>
    </Link>
  );
}
