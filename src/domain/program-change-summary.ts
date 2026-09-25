import type { DayDiff, DayOperation, DiffField, ProgramDiff } from "./program-diff";

/**
 * A programme difference, as little as the athlete needs to read to decide on it.
 *
 * `diffPrograms` is exhaustive on purpose: it is what the server checks a coach's claims
 * against, so every field of every run week is an operation of its own. Printed as it stands,
 * that is eight "Run changed · week n" rows for one decision — "shorter easy runs" — each
 * repeating the same pace and stop-rule paragraphs, with the weeks already run at the top.
 *
 * A programme repeats. The lifting days are the same every cycle, so they are shown once
 * already; only the runs are written a week at a time, and those are folded here into one
 * entry per run day: what changes from the first week still to come, and how it moves after
 * that. Weeks already behind the athlete are not a change to anything they will do, so they
 * are left out. Nothing is dropped from the data — the full programme is one tap away.
 */

/** Programme-wide fields the athlete does not review: the coach's own description of the block and its identity. */
const QUIET_PROGRAM_FIELDS = new Set(["notes", "slug"]);
/** Run fields that are instructions in prose rather than targets. */
const RUN_PROSE = new Set(["paceNote", "progressionNote", "stopRule", "comment"]);
/** Run fields that are numbers, which can build or ease from week to week. */
const RUN_NUMERIC = new Set(["duration", "distanceKm", "rpe"]);

/** One line of a summarised change: an optional old value struck through, then the new one. */
export type SummaryLine = {
  field: string;
  label: string;
  /** The value before, or null when only the new value is worth reading. */
  from: string | null;
  to: string;
};

export type RunSummary = {
  /** Every diff operation this entry stands for, so a request tag can find it. */
  ids: string[];
  /** Every week the entry covers, in order, once finished weeks are left out. */
  weeks: number[];
  /** Targets: minutes, distance, effort, and weeks added or removed. */
  lines: SummaryLine[];
  /** Rewritten instructions — pace, progression, stop rule — shown folded. */
  notes: SummaryLine[];
};

export type DaySummary = Omit<DayDiff, "operations"> & {
  /** The lifting rows, which already describe one cycle. */
  operations: DayOperation[];
  /** This day's runs across the weeks still to come, or null when none of them change. */
  runs: RunSummary | null;
};

export type ChangeSummary = {
  /** Programme-wide changes worth reading: its name and its length. */
  program: DiffField[];
  days: DaySummary[];
  /** True when the only differences are ones this view does not print. */
  empty: boolean;
  /** The coach rewrote the programme's description; said in a line, not printed. */
  descriptionChanged: boolean;
};

/** "week 3", "weeks 3–8", "weeks 2, 4 and 6". */
export function weeksLabel(weeks: readonly number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return `week ${sorted[0]}`;
  const contiguous = sorted.every((week, index) => index === 0 || week === sorted[index - 1]! + 1);
  if (contiguous) return `weeks ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `weeks ${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]}`;
}

type Entry = { week: number; from: string; to: string };

const leadingNumber = (value: string) => Number.parseFloat(value.replace(/[^0-9.].*$/, ""));

/**
 * One field across the weeks it changed in.
 *
 * The same change every week is said once. A target that differs week to week is said as
 * where it starts and where it ends up, because that is the shape of a progression and a
 * list of eight ranges is not something anybody reads.
 */
function acrossWeeks(
  field: string,
  label: string,
  entries: readonly Entry[],
  span: readonly number[],
): SummaryLine {
  const ordered = [...entries].sort((a, b) => a.week - b.week);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const weeks = ordered.map((entry) => entry.week);
  const partial = weeks.length < span.length ? ` (${weeksLabel(weeks)})` : "";
  const sameTo = ordered.every((entry) => entry.to === first.to);
  const sameFrom = ordered.every((entry) => entry.from === first.from);

  if (RUN_PROSE.has(field)) {
    if (!sameTo) return { field, label, from: null, to: `New note each week${partial}` };
    if (first.to === "—") return { field, label, from: null, to: `Removed${partial}` };
    return { field, label, from: null, to: `${first.to}${partial}` };
  }
  if (sameTo)
    return { field, label, from: sameFrom ? first.from : null, to: `${first.to}${partial}` };
  return {
    field,
    label,
    from: first.from,
    to: `${first.to} in week ${first.week}, ${progression(first.to, last.to)} ${last.to} by week ${last.week}`,
  };
}

/** How a target that differs week to week gets from its first value to its last. */
function progression(first: string, last: string): string {
  const start = leadingNumber(first);
  const end = leadingNumber(last);
  if (Number.isNaN(start) || Number.isNaN(end) || start === end) return "then";
  return end > start ? "building to" : "easing to";
}

function summariseRuns(operations: readonly DayOperation[], fromWeek: number): RunSummary | null {
  const runs = operations.filter(
    (operation): operation is Extract<DayOperation, { weekIndex: number }> =>
      "weekIndex" in operation && operation.weekIndex >= fromWeek,
  );
  if (runs.length === 0) return null;
  const weeks = runs.map((operation) => operation.weekIndex);
  const changedWeeks = [
    ...new Set(runs.filter((run) => run.kind === "run_changed").map((run) => run.weekIndex)),
  ];
  const byField = new Map<string, { label: string; entries: Entry[] }>();
  for (const run of runs) {
    if (run.kind !== "run_changed") continue;
    for (const field of run.fields) {
      const bucket = byField.get(field.field) ?? { label: field.label, entries: [] };
      bucket.entries.push({ week: run.weekIndex, from: field.from, to: field.to });
      byField.set(field.field, bucket);
    }
  }
  const lines: SummaryLine[] = [];
  const notes: SummaryLine[] = [];
  for (const [field, { label, entries }] of byField) {
    const line = acrossWeeks(field, label, entries, changedWeeks);
    if (RUN_NUMERIC.has(field)) lines.push(line);
    else notes.push(line);
  }
  const added = runs
    .filter((run) => run.kind === "run_added")
    .sort((a, b) => a.weekIndex - b.weekIndex);
  if (added.length) {
    // A new run that builds week to week is said as where it starts and where it ends up.
    const first = added[0]!;
    const last = added[added.length - 1]!;
    const weeks = added.map((run) => run.weekIndex);
    const gaps = weeks.some((week, index) => index > 0 && week !== weeks[index - 1]! + 1);
    lines.push({
      field: "added",
      label: "Runs added",
      from: null,
      to: added.every((run) => run.to === first.to)
        ? `${weeksLabel(weeks)} · ${first.to}`
        : // "In week 3 … by week 8" already says which weeks, unless some between are skipped.
          `${gaps ? `${weeksLabel(weeks)} · ` : ""}${first.to} in week ${first.weekIndex}, ${progression(first.to, last.to)} ${last.to} by week ${last.weekIndex}`,
    });
  }
  const removed = runs.filter((run) => run.kind === "run_removed");
  if (removed.length)
    lines.push({
      field: "removed",
      label: "Runs removed",
      from: null,
      to: weeksLabel(removed.map((run) => run.weekIndex)),
    });
  const order = ["duration", "distanceKm", "rpe", "added", "removed"];
  lines.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
  return {
    ids: runs.map((run) => run.id),
    weeks: [...new Set(weeks)].sort((a, b) => a - b),
    lines,
    notes,
  };
}

/**
 * The difference to show, from `fromWeek` on.
 *
 * `fromWeek` is the cycle the athlete is in: a proposal waiting for approval cannot alter a
 * week already trained, so those weeks are not part of what they are deciding. A settled
 * change is shown from week 1, as the record of what it did.
 */
export function summariseProgramDiff(
  diff: ProgramDiff,
  options: { fromWeek?: number } = {},
): ChangeSummary {
  const fromWeek = Math.max(1, options.fromWeek ?? 1);
  const program = diff.program.filter((field) => !QUIET_PROGRAM_FIELDS.has(field.field));
  const descriptionChanged = diff.program.some((field) => field.field === "notes");
  const days: DaySummary[] = [];
  for (const day of diff.days) {
    const operations = day.operations.filter((operation) => !("weekIndex" in operation));
    const runs = summariseRuns(day.operations, fromWeek);
    if (!operations.length && !runs && !day.fields.length && day.status === "changed") continue;
    days.push({ ...day, operations, runs });
  }
  return { program, days, empty: program.length === 0 && days.length === 0, descriptionChanged };
}

/**
 * "Adds 1 exercise · runs on 2 days" — the list row for a change, when it has no headline.
 *
 * Runs are counted by the days they fall on, not by the weeks: sixteen "run changes" was one
 * decision about two easy runs.
 */
export function changeSummaryLine(summary: ChangeSummary): string {
  if (summary.empty)
    return summary.descriptionChanged ? "Programme description updated" : "No programme changes";
  const operations = summary.days.flatMap((day) => day.operations);
  const count = (kinds: readonly DayOperation["kind"][]) =>
    operations.filter((operation) => kinds.includes(operation.kind)).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  const added = count(["added"]);
  const removed = count(["removed"]);
  const replaced = count(["replaced"]);
  const changed = count(["retargeted", "reordered"]);
  const moved = count(["moved_in"]);
  if (added) parts.push(`adds ${plural(added, "exercise")}`);
  if (removed) parts.push(`removes ${plural(removed, "exercise")}`);
  if (replaced) parts.push(`swaps ${plural(replaced, "exercise")}`);
  if (moved) parts.push(`moves ${plural(moved, "exercise")}`);
  if (changed) parts.push(`changes ${plural(changed, "exercise")}`);
  const runDays = summary.days.filter((day) => day.runs).length;
  if (runDays) parts.push(`changes runs on ${plural(runDays, "day")}`);
  if (summary.program.length) parts.push("changes the programme's length or name");
  if (!parts.length) parts.push("changes day details");
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
