import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import type { DayOperation, DiffField } from "@/domain/program-diff";
import {
  weeksLabel,
  type ChangeSummary,
  type DaySummary,
  type RunSummary,
  type SummaryLine,
} from "@/domain/program-change-summary";
import { WEEKDAY_NAMES } from "@/lib/labels";

/**
 * A programme change, as the difference it actually is.
 *
 * Only the changed days, once per cycle: a lifting day is the same every cycle, and a day's
 * runs are one entry across the weeks still to come rather than a row per week. Instructions
 * the coach rewrote are there, folded, because they are read on the run itself; the targets
 * that decide whether to say yes are not.
 *
 * Each day is a section under an ink rule (board Programme change), and each change in it says
 * what happened in a word led by its glyph, then what it changes: a value that changes reads
 * "old → new", the old struck and the new in ink, and both are said aloud.
 */

type Names = Readonly<Record<string, string>>;

const nameOf = (names: Names, slug: string) => names[slug] ?? slug;

/** Slot fields that are instructions in prose: the new wording is what matters, not the old. */
const PROSE = new Set(["targetLoadNote", "progressionNotes", "keyCue", "notes"]);

/** A field as the athlete reads it: exercise names rather than slugs, prose without its past. */
function readable(field: DiffField, names: Names): SummaryLine {
  if (field.field === "fallbacks") {
    const list = (value: string) =>
      value === "None"
        ? "none"
        : value
            .split(", ")
            .map((slug) => nameOf(names, slug))
            .join(", ");
    return { field: field.field, label: "If unavailable", from: null, to: list(field.to) };
  }
  if (PROSE.has(field.field))
    return {
      field: field.field,
      label: field.label,
      from: null,
      to: field.to === "—" ? "Removed" : field.to,
    };
  return { field: field.field, label: field.label, from: field.from, to: field.to };
}

/** "Sets 3 → 4", the old struck and the new in ink; prose is its new wording alone. */
function Lines({ lines }: { lines: readonly SummaryLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="diff-lines">
      {lines.map((line) =>
        line.from !== null ? (
          <li key={line.field} className="diff-line">
            <span>{line.label}</span> <span className="sr-only">was </span>
            <span className="line-through">{line.from}</span>
            <Glyph name="arrowRight" className="diff-arrow glyph-15" />
            <span className="sr-only">, becomes </span>
            <span className="diff-new">{line.to}</span>
          </li>
        ) : (
          <li key={line.field} className="diff-note">
            <span>{line.label}:</span> {line.to}
          </li>
        ),
      )}
    </ul>
  );
}

/** What happened, in a word led by its glyph, then what it happened to and why. */
function Operation({
  glyph,
  mark,
  label,
  reason,
  children,
}: {
  glyph?: GlyphName;
  /** A sport's mark in place of a glyph: a run's weeks. */
  mark?: ReactNode;
  label: string;
  /** Which ask this line answers, shown under it, inside the same row. */
  reason?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="diff-op">
      <p className="diff-op-kind">
        <span aria-hidden className="grid">
          {mark ?? (glyph && <Glyph name={glyph} className="glyph-14" />)}
        </span>
        {label}
      </p>
      <div className="min-w-0">{children}</div>
      {reason && <div className="diff-reason">{reason}</div>}
    </li>
  );
}

/** An exercise's name, and what it asks for when that is the news. */
function Named({
  name,
  targets,
  gone = false,
}: {
  name: ReactNode;
  targets?: string;
  gone?: boolean;
}) {
  return (
    <>
      <p className={gone ? "diff-name text-ink-2" : "diff-name"}>{name}</p>
      {targets && <p className="diff-targets">{targets}</p>}
    </>
  );
}

function OperationRow({
  operation,
  names,
  reason,
}: {
  operation: DayOperation;
  names: Names;
  reason?: ReactNode;
}) {
  const op = { reason };
  const fields = (list: readonly DiffField[]) => (
    <Lines lines={list.map((field) => readable(field, names))} />
  );
  switch (operation.kind) {
    case "added":
      return (
        <Operation glyph="plus" label="Added" {...op}>
          <Named name={nameOf(names, operation.to.exerciseSlug)} targets={operation.to.targets} />
        </Operation>
      );
    case "removed":
      return (
        <Operation glyph="minus" label="Removed" {...op}>
          <Named
            name={nameOf(names, operation.from.exerciseSlug)}
            targets={operation.from.targets}
            gone
          />
        </Operation>
      );
    case "replaced":
      return (
        <Operation glyph="swap" label="Replaced" {...op}>
          <p className="diff-name">
            <span>{nameOf(names, operation.from.exerciseSlug)}</span>
            <Glyph name="arrowRight" className="diff-arrow glyph-15" />
            <span className="sr-only">, becomes </span>
            <span>{nameOf(names, operation.to.exerciseSlug)}</span>
          </p>
          {fields(operation.fields)}
        </Operation>
      );
    case "retargeted":
      return (
        <Operation glyph="edit" label="Changed" {...op}>
          <Named name={nameOf(names, operation.to.exerciseSlug)} />
          {fields(operation.fields)}
        </Operation>
      );
    case "reordered":
      return (
        <Operation glyph="swap" label="Moved" {...op}>
          <Named name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="diff-targets">
            Position {operation.from.position} → {operation.to.position} in this day
          </p>
        </Operation>
      );
    case "moved_out":
      return (
        <Operation glyph="arrowRight" label="Moved to another day" {...op}>
          <Named name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="diff-note">Now on {operation.otherDayName}</p>
          {fields(operation.fields)}
        </Operation>
      );
    case "moved_in":
      return (
        <Operation glyph="arrowRight" label="Moved here" {...op}>
          <Named name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="diff-note">Was on {operation.otherDayName}</p>
          {fields(operation.fields)}
        </Operation>
      );
    default:
      // Run weeks never reach here: a day's runs are summarised as one entry below.
      return null;
  }
}

/**
 * A day's runs across the weeks still to come, as one entry.
 *
 * The targets are what the decision is about; the rewritten instructions are folded behind
 * them, because they are read on the run itself and are the long part.
 */
function RunEntry({ runs, reason }: { runs: RunSummary; reason?: ReactNode }) {
  // The weeks it names are the weeks that change: "weeks 3–8", or "weeks 3, 5 and 7" when the
  // weeks between are left as they were.
  const label = `${runs.weeks.length === 1 ? "Run" : "Runs"} · ${weeksLabel(runs.weeks)}`;
  return (
    <Operation mark={<Art kind="mark" sport="run" size={14} />} label={label} reason={reason}>
      {runs.lines.length > 0 ? (
        <Lines lines={runs.lines} />
      ) : (
        <p className="diff-targets">Instructions only</p>
      )}
      {runs.notes.length > 0 && (
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center type-meta-small font-bold">
            {runs.notes.length === 1
              ? `New ${runs.notes[0]!.label.toLowerCase()} note`
              : `New run notes (${runs.notes.map((note) => note.label.toLowerCase()).join(", ")})`}
          </summary>
          <Lines lines={runs.notes} />
        </details>
      )}
    </Operation>
  );
}

const DAY_STATUS: Record<DaySummary["status"], string | null> = {
  changed: null,
  added: "New day",
  removed: "Day removed",
};

function DayGroup({
  day,
  names,
  reasons,
}: {
  day: DaySummary;
  names: Names;
  reasons: Readonly<Record<string, ReactNode>>;
}) {
  const weekday = day.dayOfWeek ? WEEKDAY_NAMES[day.dayOfWeek] : null;
  const status = DAY_STATUS[day.status];
  const runReason = day.runs?.ids.map((id) => reasons[id]).find(Boolean);
  // A day added, removed or renamed for an ask carries the ask's words, as a slot does.
  const dayReason = reasons[`day:${day.key}`];
  return (
    <section className="diff-section">
      <h3 className="diff-section-head">
        <span className="min-w-0 [overflow-wrap:anywhere]">{day.name}</span>
        <span className="diff-section-when">
          {[weekday, status].filter(Boolean).join(" · ") || "Changed"}
        </span>
      </h3>
      {dayReason && <div className="diff-reason mb-1.5">{dayReason}</div>}
      {day.fields.length > 0 && (
        <div className="pb-1.5">
          <Lines lines={day.fields.map((field) => readable(field, names))} />
        </div>
      )}
      {(day.operations.length > 0 || day.runs) && (
        <ul className="diff-ops">
          {day.operations.map((operation) => (
            <OperationRow
              key={`${operation.kind}:${operation.id}`}
              operation={operation}
              names={names}
              reason={reasons[operation.id]}
            />
          ))}
          {day.runs && <RunEntry runs={day.runs} reason={runReason} />}
        </ul>
      )}
    </section>
  );
}

export function ProgramDiffView({
  summary,
  names,
  reasons = {},
  emptyReason,
}: {
  summary: ChangeSummary;
  /** Exercise slug to the name the athlete sees; unknown slugs fall back to the slug. */
  names: Names;
  /** A short tag to show beside one operation, keyed by its ID. */
  reasons?: Readonly<Record<string, ReactNode>>;
  /** What to say when nothing differs; the review's own reason belongs here. */
  emptyReason?: ReactNode;
}) {
  if (summary.empty)
    return (
      <section className="diff-section">
        <h3 className="diff-section-head">
          {summary.descriptionChanged
            ? "Only the programme's description changes"
            : "No programme changes"}
        </h3>
        {emptyReason && <div className="type-meta [overflow-wrap:anywhere]">{emptyReason}</div>}
      </section>
    );
  // A longer block or a new name made for an ask: the ask's words, once, under the change.
  const programReason = summary.program
    .map((field) => reasons[`program:${field.field}`])
    .find(Boolean);
  return (
    <div>
      {summary.program.length > 0 && (
        <section className="diff-section">
          <h3 className="diff-section-head">Programme</h3>
          <Lines lines={summary.program.map((field) => readable(field, names))} />
          {programReason && <div className="diff-reason">{programReason}</div>}
        </section>
      )}
      {summary.days.map((day) => (
        <DayGroup key={day.key} day={day} names={names} reasons={reasons} />
      ))}
    </div>
  );
}
