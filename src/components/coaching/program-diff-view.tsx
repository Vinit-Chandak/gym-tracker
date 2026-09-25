import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowsDownUp,
  Footprints,
  Minus,
  Plus,
  SlidersHorizontal,
  type AppIcon,
} from "@/components/ui/icons";
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

/**
 * A programme change, as the difference it actually is.
 *
 * Only the changed days, once per cycle: a lifting day is the same every cycle, and a day's
 * runs are one entry across the weeks still to come rather than a row per week. Instructions
 * the coach rewrote are there, folded, because they are read on the run itself; the targets
 * that decide whether to say yes are not.
 *
 * Every row says what happened in a word as well as in a colour, because a colour alone is
 * not a sentence — not to somebody who cannot tell these two apart, and not in forced-colours
 * mode, where the palette collapses to two inks by design.
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

/** "Sets: 2 → 3", or just the new wording where the old one is not worth reading. */
function Lines({ lines }: { lines: readonly SummaryLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {lines.map((line) => (
        <li key={line.field} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
          <span className="text-ink">{line.label}:</span>{" "}
          {line.from !== null && (
            <>
              <span className="line-through decoration-ink-subtle">{line.from}</span>{" "}
              <span aria-hidden>→</span>
              <span className="sr-only">changes to</span>{" "}
            </>
          )}
          <span className="text-ink">{line.to}</span>
        </li>
      ))}
    </ul>
  );
}

type Tone = "added" | "removed" | "plain";

/**
 * One side of a change: a ruled edge in its semantic colour, on the ordinary surface.
 *
 * The name itself stays in ordinary ink, because it is the thing being read, and the removed
 * side is simply quieter.
 */
function Side({ tone, name, targets }: { tone: Tone; name: string; targets?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-control border-l-2 bg-surface-raised px-2.5 py-1.5",
        tone === "added" && "border-success",
        tone === "removed" && "border-danger",
        tone === "plain" && "border-line-strong",
      )}
    >
      <p
        className={cn(
          "font-medium [overflow-wrap:anywhere]",
          tone === "removed" && "text-ink-muted",
        )}
      >
        {name}
      </p>
      {targets && (
        <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{targets}</p>
      )}
    </div>
  );
}

/**
 * What happened, in a word above it.
 *
 * The word comes first and is never optional: in forced-colours mode the whole palette
 * collapses to two inks by design, and a row that says only "green" has said nothing.
 */
function Operation({
  icon: Icon,
  label,
  tone = "plain",
  reason,
  children,
}: {
  icon: AppIcon;
  label: string;
  tone?: Tone;
  /** Which ask this line answers, shown under it and aligned with it rather than with the row. */
  reason?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 gap-3 py-3 first:pt-0 last:pb-0">
      <Icon
        scale="row"
        className={cn(
          "mt-0.5 shrink-0",
          tone === "added" ? "text-success" : tone === "removed" ? "text-danger" : "text-ink-muted",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-medium tracking-wide uppercase",
            tone === "added"
              ? "text-success"
              : tone === "removed"
                ? "text-danger"
                : "text-ink-muted",
          )}
        >
          {label}
        </p>
        <div className="mt-1 min-w-0">{children}</div>
        {reason && <div className="mt-1.5 min-w-0 text-sm text-ink-muted">{reason}</div>}
      </div>
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
        <Operation icon={Plus} label="Added" tone="added" {...op}>
          <Side
            tone="added"
            name={nameOf(names, operation.to.exerciseSlug)}
            targets={operation.to.targets}
          />
        </Operation>
      );
    case "removed":
      return (
        <Operation icon={Minus} label="Removed" tone="removed" {...op}>
          <Side
            tone="removed"
            name={nameOf(names, operation.from.exerciseSlug)}
            targets={operation.from.targets}
          />
        </Operation>
      );
    case "replaced":
      return (
        <Operation icon={ArrowRight} label="Replaced" {...op}>
          {/* Stacked on a phone, side by side once there is room for both names. */}
          <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <Side
              tone="removed"
              name={nameOf(names, operation.from.exerciseSlug)}
              targets={operation.from.targets}
            />
            <ArrowRight
              className="mx-auto shrink-0 rotate-90 text-ink-subtle sm:rotate-0"
              aria-hidden
            />
            <Side
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
        <Operation icon={SlidersHorizontal} label="Changed" {...op}>
          <p className="font-medium [overflow-wrap:anywhere]">
            {nameOf(names, operation.to.exerciseSlug)}
          </p>
          {fields(operation.fields)}
        </Operation>
      );
    case "reordered":
      return (
        <Operation icon={ArrowsDownUp} label="Moved" {...op}>
          <p className="font-medium [overflow-wrap:anywhere]">
            {nameOf(names, operation.to.exerciseSlug)}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
            Position {operation.from.position} → {operation.to.position} in this day
          </p>
        </Operation>
      );
    case "moved_out":
      return (
        <Operation icon={ArrowRight} label="Moved to another day" {...op}>
          <p className="font-medium [overflow-wrap:anywhere]">
            {nameOf(names, operation.to.exerciseSlug)}
          </p>
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
            Now on {operation.otherDayName}
          </p>
          {fields(operation.fields)}
        </Operation>
      );
    case "moved_in":
      return (
        <Operation icon={ArrowRight} label="Moved here" {...op}>
          <p className="font-medium [overflow-wrap:anywhere]">
            {nameOf(names, operation.to.exerciseSlug)}
          </p>
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
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-ink-muted underline-offset-4 hover:underline">
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
    <Card>
      <div>
        <h3 className="font-medium [overflow-wrap:anywhere]">{day.name}</h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          {[weekday, status].filter(Boolean).join(" · ") || "Changed"}
        </p>
        {dayReason && <div className="mt-1.5">{dayReason}</div>}
      </div>
      {day.fields.length > 0 && <Lines lines={day.fields.map((field) => readable(field, names))} />}
      {(day.operations.length > 0 || day.runs) && (
        <ul className="ruled-list">
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
    </Card>
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
      <Card>
        <h3 className="font-medium">
          {summary.descriptionChanged
            ? "Only the programme's description changes"
            : "No programme changes"}
        </h3>
        {emptyReason && <div className="text-sm [overflow-wrap:anywhere]">{emptyReason}</div>}
      </Card>
    );
  // A longer block or a new name made for an ask: the ask's words, once, under the change.
  const programReason = summary.program
    .map((field) => reasons[`program:${field.field}`])
    .find(Boolean);
  return (
    <div className="space-y-3">
      {summary.program.length > 0 && (
        <Card>
          <h3 className="font-medium">Programme</h3>
          <Lines lines={summary.program.map((field) => readable(field, names))} />
          {programReason && <div>{programReason}</div>}
        </Card>
      )}
      {summary.days.map((day) => (
        <DayGroup key={day.key} day={day} names={names} reasons={reasons} />
      ))}
    </div>
  );
}
