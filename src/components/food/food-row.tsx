import type { ReactNode } from "react";

import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { formatWholeKcal } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The one food row (owner, 8 October 2026; DESIGN.md, Rows and marks), wherever food is listed:
 * a meal's page, My foods, a saved meal, a meal being built, the Food tab's meals and a
 * macronutrient's foods. A round tile leads it; its name keeps one line and what is under it one
 * more, each ending in an ellipsis rather than wrapping, so every row stands the same height; what
 * it comes to stands at its end in a column four digits wide (`RowFigure`). The row itself, a
 * button, a link or a list item, is the caller's, with the class `food-row`.
 */
export function FoodRowText({
  name,
  tile,
  meta,
  wraps = false,
}: {
  name: ReactNode;
  /** Drawn in front of the name and read after it, so a screen reader starts with the name. */
  tile: ReactNode;
  /** What is under the name. Without it the name is centred on its tile. */
  meta?: ReactNode;
  /** A line that says what the row does (Quick add's) wraps at large text rather than being cut. */
  wraps?: boolean;
}) {
  return (
    // The spaces are for the row's name, which a screen reader reads as one string; beside grid
    // items they take no room on the screen.
    <span className="food-row-text food-row-led">
      <span className="food-row-name">{name}</span>
      {tile}
      {meta !== undefined && (
        <>
          {" "}
          <span className={cn("food-row-meta", wraps && "food-row-hint")}>{meta}</span>
        </>
      )}
    </span>
  );
}

/** A tile's glyph: Quick add's bolt, a saved meal's star, a food's bowl, something new's plus. */
export function RowGlyph({ name, label }: { name: GlyphName; label?: string }) {
  return <Glyph name={name} label={label} className="food-row-glyph glyph-16" />;
}

/** What a row comes to, in Jost, over its unit, both centred in the column. */
export function RowFigure({ figure, unit }: { figure: ReactNode; unit: string }) {
  return (
    <span className="food-row-figure">
      <span className="type-figure">{figure}</span> <span className="food-row-unit">{unit}</span>
    </span>
  );
}

/** A food's or a meal's energy, to the nearest whole kcal. */
export function RowKcal({ kcal }: { kcal: number }) {
  return <RowFigure figure={formatWholeKcal(kcal)} unit="kcal" />;
}
