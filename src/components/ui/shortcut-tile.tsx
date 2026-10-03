import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";

import { Glyph, type GlyphName } from "./glyphs";

/**
 * A destination drawn as a tile (board Friends): its glyph top left, its name bottom left, on
 * surface; something waiting there in an ink pill at the top right. The name is the whole
 * explanation; a destination that needs a sentence under its name is a row, not a tile.
 */
export function ShortcutTile<T extends string>({
  href,
  glyph,
  label,
  badge,
}: {
  href: Route<T>;
  glyph: GlyphName;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <Link href={href} className="shortcut-tile">
      <Glyph name={glyph} className="glyph-24" />
      <span className="shortcut-tile-word">{label}</span>
      {badge && <span className="shortcut-tile-badge">{badge}</span>}
    </Link>
  );
}

/** Two to a row, one under another once the words would not fit; a list a screen reader counts. */
export function ShortcutGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="shortcut-grid">{children}</ul>
    </nav>
  );
}
