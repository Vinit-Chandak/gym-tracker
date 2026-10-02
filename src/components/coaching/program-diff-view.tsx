import type { ReactNode } from "react";

import { Footprints, type AppIcon } from "@/components/ui/icons";
import type { DayOperation, DiffField } from "@/domain/program-diff";
import {
  weeksLabel,
  type ChangeSummary,
  type DaySummary,
  type RunSummary,
  type SummaryLine,
} from "@/domain/program-change-summary";
import { WEEKDAY_NAMES } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { AskLine } from "./sheet-bits";

/**
 * A programme change, as the pen layer over the programme.
 *
 * Only the changed days, once per cycle: a lifting day is the same every cycle, and a day's
 * runs are one entry across the weeks still to come rather than a row per week. An added
 * line is written in pen with a leading "+"; a removed one is struck through; a changed
 * value reads "2 → 3" in the data voice. Instructions the coach rewrote are there, folded,
 * because they are read on the run itself; the targets that decide whether to say yes are not.
 *
 * Every row says what happened in a word as well as in a mark, because a mark alone is not a
 * sentence — not to somebody who cannot tell the pens apart, and not in forced-colours mode,
 * where the palette collapses to two inks by design.
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

/** "Sets: 2 → 3" in the data voice, or just the new wording where the old is not worth reading. */
function Lines({ lines }: { lines: readonly SummaryLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {lines.map((line) => (
        <li key={line.field} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
          <span className="text-ink">{line.label}:</span>{" "}
          {line.from !== null && (
            <>
              <span className="font-data text-ink-subtle line-through tabular-nums">
                {line.from}
              </span>{" "}
              <span aria-hidden>→</span>
              <span className="sr-only">changes to</span>{" "}
            </>
          )}
          <span className="font-data font-semibold text-ink tabular-nums">{line.to}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One exercise line of the diff: added in pen with a "+", removed struck through with a "−".
 * The mark is decorative; the row's word says the same thing.
 */
function ExerciseLine({
  tone,
  name,
  targets,
}: {
  tone: "added" | "removed" | "plain";
  name: string;
  targets?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-2",
        tone === "added" && "text-pen",
        tone === "removed" && "text-ink-subtle",
      )}
    >
      {tone !== "plain" && (
        <span aria-hidden className="w-3 shrink-0 font-data font-semibold">
          {tone === "added" ? "+" : "−"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium [overflow-wrap:anywhere]",
            tone === "removed" && "line-through decoration-ink-subtle",
          )}
        >
          {name}
        </p>
        {targets && (
          <p
            className={cn(
              "mt-0.5 font-data text-sm tabular-nums",
              tone === "plain" && "text-ink-muted",
              tone === "removed" && "line-through decoration-ink-subtle",
            )}
          >
            {targets}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One row of the diff: what happened, in a word, then the lines, then the ask that produced
 * it in the athlete's own words.
 */
function Operation({
  icon: Icon,
  label,
  reason,
  children,
}: {
  icon?: AppIcon;
  label: string;
  /** Which ask this line answers, shown under it and aligned with it rather than with the row. */
  reason?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="min-w-0 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
        {Icon && <Icon className="!size-4 shrink-0" aria-hidden />}
        {label}
      </p>
      <div className="mt-1.5 min-w-0">{children}</div>
      {reason && <AskLine className="mt-1.5">{reason}</AskLine>}
    </li>
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
        <Operation label="Added" {...op}>
          <ExerciseLine
            tone="added"
            name={nameOf(names, operation.to.exerciseSlug)}
            targets={operation.to.targets}
          />
        </Operation>
      );
    case "removed":
      return (
        <Operation label="Removed" {...op}>
          <ExerciseLine
            tone="removed"
            name={nameOf(names, operation.from.exerciseSlug)}
            targets={operation.from.targets}
          />
        </Operation>
      );
    case "replaced":
      return (
        <Operation label="Replaced" {...op}>
          <div className="space-y-1.5">
            <ExerciseLine
              tone="removed"
              name={nameOf(names, operation.from.exerciseSlug)}
              targets={operation.from.targets}
            />
            <ExerciseLine
              tone="added"
              name={nameOf(names, operation.to.exerciseSlug)}
              targets={operation.to.targets}
            />
          </div>
          {fields(operation.fields)}
        </Operation>
      );
    case "retargeted":
      return (
        <Operation label="Changed" {...op}>
          <ExerciseLine tone="plain" name={nameOf(names, operation.to.exerciseSlug)} />
          {fields(operation.fields)}
        </Operation>
      );
    case "reordered":
      return (
        <Operation label="Moved" {...op}>
          <ExerciseLine tone="plain" name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="mt-0.5 font-data text-sm text-ink-muted tabular-nums">
            Position {operation.from.position} → {operation.to.position} in this day
          </p>
        </Operation>
      );
    case "moved_out":
      return (
        <Operation label="Moved to another day" {...op}>
          <ExerciseLine tone="plain" name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
            Now on {operation.otherDayName}
          </p>
          {fields(operation.fields)}
        </Operation>
      );
    case "moved_in":
      return (
        <Operation label="Moved here" {...op}>
          <ExerciseLine tone="plain" name={nameOf(names, operation.to.exerciseSlug)} />
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
            Was on {operation.otherDayName}
          </p>
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
    <Operation icon={Footprints} label={label} reason={reason}>
      {runs.lines.length > 0 ? (
        <Lines lines={runs.lines} />
      ) : (
        <p className="text-sm text-ink-muted">Instructions only</p>
      )}
      {runs.notes.length > 0 && (
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-pen underline-offset-4 hover:underline">
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
    <li className="min-w-0 py-4">
      <div>
        <h3 className="text-lg [overflow-wrap:anywhere]">{day.name}</h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          {[weekday, status].filter(Boolean).join(" · ") || "Changed"}
        </p>
        {dayReason && <AskLine className="mt-1.5">{dayReason}</AskLine>}
      </div>
      {day.fields.length > 0 && <Lines lines={day.fields.map((field) => readable(field, names))} />}
      {(day.operations.length > 0 || day.runs) && (
        <ul className="mt-2 ruled-list">
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
    </li>
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
      <section className="box space-y-2 py-4">
        <h3 className="text-lg">
          {summary.descriptionChanged
            ? "Only the programme's description changes"
            : "No programme changes"}
        </h3>
        {emptyReason && <div className="text-sm [overflow-wrap:anywhere]">{emptyReason}</div>}
      </section>
    );
  // A longer block or a new name made for an ask: the ask's words, once, under the change.
  const programReason = summary.program
    .map((field) => reasons[`program:${field.field}`])
    .find(Boolean);
  return (
    <ul className="box-rows">
      {summary.program.length > 0 && (
        <li className="min-w-0 py-4">
          <h3 className="text-lg">Programme</h3>
          <Lines lines={summary.program.map((field) => readable(field, names))} />
          {programReason && <AskLine className="mt-1.5">{programReason}</AskLine>}
        </li>
      )}
      {summary.days.map((day) => (
        <DayGroup key={day.key} day={day} names={names} reasons={reasons} />
      ))}
    </ul>
  );
}
