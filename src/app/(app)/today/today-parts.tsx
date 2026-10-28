import type { ReactNode } from "react";

import { Figures } from "@/components/ui/figures";
import { GLYPH_LABELS, Glyph, type GlyphName } from "@/components/ui/glyphs";
import { holdFigures } from "@/lib/facts";
import { cn } from "@/lib/utils";

import type { PlanRowModel } from "./today-model";
import { groupRows } from "./today-model";

/**
 * A meta line: facts, each led by its glyph, in ink 2 (DESIGN.md, Rows and signs). A block
 * rather than a paragraph, because a fact can be a choice that opens a sheet.
 */
export function MetaLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("meta-line", className)}>{children}</div>;
}

export function Fact({
  glyph,
  label,
  children,
}: {
  glyph?: GlyphName;
  label?: string;
  children: ReactNode;
}) {
  return (
    <span className="meta-fact">
      {glyph && <Glyph name={glyph} label={label} className="glyph-16" />}
      {children}
    </span>
  );
}

/**
 * One exercise row everywhere (DESIGN.md, Rows and signs): the name, and under it the
 * equipment's glyph and the prescription. No mark beside it: its sets are said once here and
 * drawn once in the print. Where it stands is said only when it is news.
 */
export function PlanRow({
  row,
  trailing,
  last = false,
  small = false,
  notes = "full",
}: {
  row: PlanRowModel;
  trailing?: ReactNode;
  last?: boolean;
  /** Short screens tighten the rows. */
  small?: boolean;
  /**
   * `none` where the coach's note is said elsewhere (Today's card says the coach's summary; the
   * exercise's own screen has its note whole): nothing is cut, and nothing points at a note
   * that cannot be opened from here.
   */
  notes?: "full" | "none";
}) {
  return (
    <li className={cn("plan-row", last && "plan-row-last", small && "plan-row-small")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn("plan-row-name [overflow-wrap:break-word]", row.dropped && "text-ink-2")}
        >
          {row.name}
        </span>
        {row.line && (
          <MetaLine className="plan-row-meta">
            <Fact
              glyph={row.glyph ?? undefined}
              label={row.glyph ? GLYPH_LABELS[row.glyph] : undefined}
            >
              {/* Its figures tabular, as every meta line's are, each range held at its dash and
                  RIR to its figure: "@ 1–" never ends a line. */}
              <Figures>{holdFigures(row.line)}</Figures>
            </Fact>
          </MetaLine>
        )}
        {row.at && (
          <MetaLine className="plan-row-meta">
            <Fact glyph="pin">
              <span className="min-w-0 [overflow-wrap:break-word]">{row.at}</span>
            </Fact>
          </MetaLine>
        )}
        {row.note && notes === "full" && (
          <span className="plan-row-note">
            <Glyph name="coach" label="Coach:" className="mt-0.5 glyph-15" />
            <span className="line-clamp-2 min-w-0">{row.note}</span>
          </span>
        )}
      </span>
      {row.dropped ? (
        <span className="shrink-0 type-meta-small font-semibold text-ink-2">Skipped</span>
      ) : (
        trailing
      )}
    </li>
  );
}

/** The rows, a superset's members under one bracket in the gutter. */
export function PlanRows({
  rows,
  small,
  isLast,
  notes,
}: {
  rows: readonly PlanRowModel[];
  small?: boolean;
  /** Whether the list ends with these rows (its last row takes no rule). */
  isLast?: boolean;
  notes?: "full" | "none";
}) {
  const groups = groupRows(rows);
  return groups.map((group, index) => {
    const lastGroup = isLast !== false && index === groups.length - 1;
    if (group.length === 1) {
      const row = group[0]!;
      return <PlanRow key={row.key} row={row} small={small} last={lastGroup} notes={notes} />;
    }
    return (
      <li key={group[0]!.key} className="superset-group">
        <ul aria-label={`Superset: ${group.map((row) => row.name).join(" and ")}`}>
          {group.map((row, at) => (
            <PlanRow
              key={row.key}
              row={row}
              small={small}
              last={lastGroup && at === group.length - 1}
              notes={notes}
            />
          ))}
        </ul>
        <span role="img" aria-label="Superset" className="superset-bracket" />
      </li>
    );
  });
}
