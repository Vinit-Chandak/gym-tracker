import type { Route } from "next";
import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import type { PrintPart } from "@/components/art/geometry";
import Link from "@/components/ui/app-link";
import { GLYPH_LABELS, Glyph, type GlyphName } from "@/components/ui/glyphs";
import { cn } from "@/lib/utils";

import type { CycleCell, PlanRowModel } from "./today-model";
import { groupRows } from "./today-model";

/**
 * The cycle as squares (DESIGN.md: the programme's position is seven squares, not a sentence):
 * the days done in ink, today ringed, a skipped day dashed, the rest a hairline. They stay
 * wordless; their name, "behind" included, is read aloud.
 */
export function CycleMark({
  cells,
  label,
  href = "/profile/programme",
}: {
  cells: readonly CycleCell[];
  label: string;
  href?: Route;
}) {
  const sq = 9;
  const gap = 4;
  const width = cells.length * sq + (cells.length - 1) * gap;
  return (
    <Link
      href={href}
      aria-label={label}
      className="-mr-0.5 flex min-h-[var(--ov-target-header)] shrink-0 items-center gap-2 px-0.5"
    >
      <svg
        aria-hidden
        width={width}
        height={sq + 2}
        viewBox={`0 0 ${width} ${sq + 2}`}
        className="block text-ink"
      >
        {cells.map((cell, index) => {
          const x = index * (sq + gap);
          switch (cell) {
            case "done":
              return <rect key={index} x={x} y={1} width={sq} height={sq} fill="currentColor" />;
            case "today":
              return (
                <rect
                  key={index}
                  x={x + 1}
                  y={2}
                  width={sq - 2}
                  height={sq - 2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              );
            case "skipped":
              return (
                <rect
                  key={index}
                  x={x + 0.75}
                  y={1.75}
                  width={sq - 1.5}
                  height={sq - 1.5}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  strokeDasharray="2 1.4"
                />
              );
            default:
              return (
                <rect
                  key={index}
                  x={x + 0.5}
                  y={1.5}
                  width={sq - 1}
                  height={sq - 1}
                  fill="none"
                  stroke="var(--ov-control)"
                  strokeWidth={1}
                />
              );
          }
        })}
      </svg>
    </Link>
  );
}

/** The day's print on its paper, the height its screen gives it. */
export function TodayPrint({
  parts,
  label,
  coach = false,
  className,
}: {
  parts: readonly PrintPart[];
  label: string;
  /** A coach's note stands under the title, so the print gives it some height. */
  coach?: boolean;
  className?: string;
}) {
  if (parts.length === 0) return null;
  return (
    <figure className={cn("today-print m-0", className)} data-coach={coach}>
      <Art kind="print" parts={parts} label={label} className="size-full" />
    </figure>
  );
}

/**
 * A meta line: facts, each led by its glyph, in ink 2 (DESIGN.md, Rows and marks). A block
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
 * One exercise row everywhere (DESIGN.md, Rows and marks): the name, and under it the
 * equipment's glyph and the prescription. No mark beside it: its sets are said once here and
 * drawn once in the print. Where it stands is said only when it is news.
 */
export function PlanRow({
  row,
  trailing,
  last = false,
  small = false,
}: {
  row: PlanRowModel;
  trailing?: ReactNode;
  last?: boolean;
  /** Short screens tighten the rows. */
  small?: boolean;
}) {
  return (
    <li className={cn("plan-row", last && "plan-row-last", small && "plan-row-small")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("plan-row-name [overflow-wrap:anywhere]", row.dropped && "text-ink-2")}>
          {row.name}
        </span>
        {row.line && (
          <MetaLine className="plan-row-meta">
            <Fact
              glyph={row.glyph ?? undefined}
              label={row.glyph ? GLYPH_LABELS[row.glyph] : undefined}
            >
              {row.line}
            </Fact>
          </MetaLine>
        )}
        {row.note && (
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
}: {
  rows: readonly PlanRowModel[];
  small?: boolean;
  /** Whether the list ends with these rows (its last row takes no rule). */
  isLast?: boolean;
}) {
  const groups = groupRows(rows);
  return groups.map((group, index) => {
    const lastGroup = isLast !== false && index === groups.length - 1;
    if (group.length === 1) {
      const row = group[0]!;
      return <PlanRow key={row.key} row={row} small={small} last={lastGroup} />;
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
            />
          ))}
        </ul>
        <span role="img" aria-label="Superset" className="superset-bracket" />
      </li>
    );
  });
}
