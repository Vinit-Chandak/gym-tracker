import type { Route } from "next";
import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import type { PrintPart } from "@/components/art/geometry";
import Link from "@/components/ui/app-link";
import { GLYPH_LABELS, Glyph, type GlyphName } from "@/components/ui/glyphs";
import { cn } from "@/lib/utils";

import type { CycleCell, PlanRowModel } from "./today-model";
import { daysBehind, groupRows } from "./today-model";

/**
 * The cycle as squares (DESIGN.md: the programme's position is seven squares, not a sentence):
 * the days done in ink, today ringed, a skipped day dashed, the rest a hairline. They stay
 * wordless while the programme is on track. Behind is news, so it is said beside them in days
 * ("25 days behind"; the feature inventory's Today status); their name says it too.
 */
export function CycleMark({
  cells,
  label,
  behind = 0,
  href = "/profile/programme",
}: {
  cells: readonly CycleCell[];
  label: string;
  /** Days the programme is behind, said beside the squares when there are any. */
  behind?: number;
  href?: Route;
}) {
  const sq = 9;
  const gap = 4;
  const width = cells.length * sq + (cells.length - 1) * gap;
  return (
    <Link
      href={href}
      aria-label={label}
      className="-mr-0.5 ml-auto flex min-h-[var(--ov-target-header)] shrink-0 items-center gap-2 px-0.5"
    >
      {behind > 0 && (
        <span className="type-meta-small whitespace-nowrap text-ink-2 tabular-nums">
          {daysBehind(behind)}
        </span>
      )}
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

/**
 * The day's print on its paper: a band over the day's cards (DESIGN.md, Today), the whole day
 * at a glance, as tall as its screen gives a band.
 */
export function TodayPrint({
  parts,
  label,
  className,
}: {
  parts: readonly PrintPart[];
  label: string;
  className?: string;
}) {
  if (parts.length === 0) return null;
  return (
    <figure className={cn("today-print m-0", className)}>
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
  notes = "full",
}: {
  row: PlanRowModel;
  trailing?: ReactNode;
  last?: boolean;
  /** Short screens tighten the rows. */
  small?: boolean;
  /**
   * `glyph` where the coach's note is said elsewhere (Today's card: the exercise's own screen
   * has it whole): the speech glyph at the row's end says there is one, nothing is cut.
   */
  notes?: "full" | "glyph";
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
        {row.note && notes === "full" && (
          <span className="plan-row-note">
            <Glyph name="coach" label="Coach:" className="mt-0.5 glyph-15" />
            <span className="line-clamp-2 min-w-0">{row.note}</span>
          </span>
        )}
      </span>
      {row.dropped ? (
        <span className="shrink-0 type-meta-small font-semibold text-ink-2">Skipped</span>
      ) : row.note && notes === "glyph" ? (
        <Glyph
          name="coach"
          label="The coach wrote a note for this exercise"
          className="glyph-18 shrink-0 text-ink-2"
        />
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
  notes?: "full" | "glyph";
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
