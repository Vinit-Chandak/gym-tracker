import {
  programBlueprintSchema,
  type BlueprintDay,
  type BlueprintExercise,
  type BlueprintRun,
  type ProgramBlueprint,
} from "./program-blueprint";
import { rangeLabel, restLabel, WEEKDAY_NAMES } from "@/lib/labels";

/**
 * What actually differs between two versions of a programme.
 *
 * The authority assessment in `program-change.ts` answers a different question — whether the
 * server may apply a change without asking — and it answers it from thresholds. This answers
 * "what changed", from the stored data alone, so that a review can show the athlete the six
 * lines that moved instead of two complete programmes and a set of muscle totals that were
 * identical on both sides.
 *
 * Nothing here reads the coach's prose. A model that says it added direct core work and did
 * not is caught by comparing the blueprints, which is the point: a request is only answered
 * by an operation that exists.
 */

/** One changed field, already formatted, with its units and unknowns preserved. */
export type DiffField = { field: string; label: string; from: string; to: string };

export type DiffExercise = {
  exerciseSlug: string;
  /** Slot identity across versions; null when this version does not carry one. */
  lineageId: string | null;
  /** 1-based position within its day, as stored. */
  position: number;
  /** "3 × 8–12 reps · RIR 1–2 · rest 90 s", for a row that names no individual field. */
  targets: string;
};

export type DayOperation =
  | { id: string; kind: "added"; to: DiffExercise }
  | { id: string; kind: "removed"; from: DiffExercise }
  | { id: string; kind: "replaced"; from: DiffExercise; to: DiffExercise; fields: DiffField[] }
  | { id: string; kind: "retargeted"; from: DiffExercise; to: DiffExercise; fields: DiffField[] }
  | {
      id: string;
      kind: "reordered";
      from: DiffExercise;
      to: DiffExercise;
      fields: DiffField[];
    }
  | {
      id: string;
      kind: "moved_out";
      from: DiffExercise;
      to: DiffExercise;
      /** The day it went to, named as the athlete sees it. */
      otherDayIndex: number;
      otherDayName: string;
      fields: DiffField[];
    }
  | {
      id: string;
      kind: "moved_in";
      from: DiffExercise;
      to: DiffExercise;
      otherDayIndex: number;
      otherDayName: string;
      fields: DiffField[];
    }
  | { id: string; kind: "run_added"; weekIndex: number; to: string }
  | { id: string; kind: "run_removed"; weekIndex: number; from: string }
  | { id: string; kind: "run_changed"; weekIndex: number; fields: DiffField[] };

export type DayDiff = {
  /** Stable key for lists; a run-only group has no programme day of its own. */
  key: string;
  dayIndex: number | null;
  dayOfWeek: number | null;
  /** The day's name after the change, or its old name when the day is being removed. */
  name: string;
  status: "changed" | "added" | "removed";
  fields: DiffField[];
  operations: DayOperation[];
};

export type ProgramDiff = {
  /** Name, length and other programme-wide fields that belong to no exercise row. */
  program: DiffField[];
  days: DayDiff[];
  counts: {
    added: number;
    removed: number;
    replaced: number;
    retargeted: number;
    moved: number;
    reordered: number;
    runs: number;
    days: number;
  };
  /** True when nothing the athlete can see differs. Shared by the server and the screen. */
  empty: boolean;
};

const text = (value: string | undefined | null) => (value ?? "").trim();
const DASH = "—";

function span(range: readonly [number, number] | null | undefined, suffix = ""): string {
  if (!range) return DASH;
  return rangeLabel(range[0], range[1], suffix);
}

/** What a slot asks for, on one line, in the words the rest of the app uses. */
export function exerciseTargets(exercise: BlueprintExercise): string {
  const measure = exercise.duration
    ? span(exercise.duration, " s")
    : exercise.distance
      ? span(exercise.distance, " m")
      : `${span(exercise.reps)} reps`;
  const effort =
    exercise.duration || exercise.distance
      ? "report RPE"
      : `RIR ${exercise.rir ? span(exercise.rir) : "unspecified"}`;
  return [
    `${exercise.sets} × ${measure}${exercise.perSide ? " per side" : ""}`,
    effort,
    `rest ${restLabel(exercise.rest[0], exercise.rest[1])}`,
  ].join(" · ");
}

function runSummary(run: BlueprintRun): string {
  return [
    run.distanceKm ? span(run.distanceKm, " km") : null,
    `${span(run.duration)} min`,
    // Out of five since 0034, and asked for as "effort" everywhere else a run is.
    `effort ${span(run.rpe)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** How a slot's measurement reads, so a reps→seconds change is one field and not two. */
function measureOf(exercise: BlueprintExercise): { label: string; value: string } {
  if (exercise.duration) return { label: "Time", value: span(exercise.duration, " s") };
  if (exercise.distance) return { label: "Distance", value: span(exercise.distance, " m") };
  return { label: "Reps", value: span(exercise.reps) };
}

function progressionRuleLabel(rule: BlueprintExercise["progressionRule"]): string {
  if (!rule) return DASH;
  if (rule.kind === "time_first") return "Time first";
  if (rule.kind === "double_progression")
    return `Double progression${rule.loadIncrement === null ? "" : `, +${rule.loadIncrement}`}`;
  return `Conservative strength, +${rule.loadIncrement} after ${rule.repsRequired} reps`;
}

function fallbacksLabel(fallbacks: BlueprintExercise["fallbacks"]): string {
  if (!fallbacks?.length) return "None";
  return [...fallbacks]
    .sort((a, b) => a.rank - b.rank || a.exerciseSlug.localeCompare(b.exerciseSlug))
    .map((fallback) => fallback.exerciseSlug)
    .join(", ");
}

function push(fields: DiffField[], field: string, label: string, from: string, to: string) {
  if (from !== to) fields.push({ field, label, from, to });
}

/**
 * Every persisted field of a slot the athlete could care about.
 *
 * Slot lineage is identity rather than prescription, so it is not compared; everything else
 * is, including the instruction fields. A coach that rewrites only a progression note has
 * changed the programme, and "No programme changes" would be a lie.
 */
function exerciseFields(before: BlueprintExercise, after: BlueprintExercise): DiffField[] {
  const fields: DiffField[] = [];
  push(fields, "sets", "Sets", String(before.sets), String(after.sets));
  const from = measureOf(before);
  const to = measureOf(after);
  push(
    fields,
    "target",
    from.label === to.label ? to.label : "Target",
    from.label === to.label ? from.value : `${from.value} (${from.label.toLowerCase()})`,
    from.label === to.label ? to.value : `${to.value} (${to.label.toLowerCase()})`,
  );
  push(fields, "perSide", "Per side", before.perSide ? "Yes" : "No", after.perSide ? "Yes" : "No");
  push(
    fields,
    "rir",
    "Effort (RIR)",
    before.rir ? span(before.rir) : "Unspecified",
    after.rir ? span(after.rir) : "Unspecified",
  );
  push(
    fields,
    "rest",
    "Rest",
    restLabel(before.rest[0], before.rest[1]),
    restLabel(after.rest[0], after.rest[1]),
  );
  push(
    fields,
    "supersetGroup",
    "Superset",
    text(before.supersetGroup) || "None",
    text(after.supersetGroup) || "None",
  );
  push(
    fields,
    "targetLoadNote",
    "Load note",
    text(before.targetLoadNote) || DASH,
    text(after.targetLoadNote) || DASH,
  );
  push(
    fields,
    "progressionRule",
    "Progression rule",
    progressionRuleLabel(before.progressionRule),
    progressionRuleLabel(after.progressionRule),
  );
  push(
    fields,
    "progressionNotes",
    "Progression",
    text(before.progressionNotes) || DASH,
    text(after.progressionNotes) || DASH,
  );
  push(fields, "keyCue", "Cue", text(before.keyCue) || DASH, text(after.keyCue) || DASH);
  push(fields, "notes", "Notes", text(before.notes) || DASH, text(after.notes) || DASH);
  push(
    fields,
    "fallbacks",
    "Fallbacks",
    fallbacksLabel(before.fallbacks),
    fallbacksLabel(after.fallbacks),
  );
  return fields;
}

function dayFields(before: BlueprintDay, after: BlueprintDay): DiffField[] {
  const fields: DiffField[] = [];
  push(fields, "name", "Name", before.name, after.name);
  push(
    fields,
    "dayOfWeek",
    "Weekday",
    WEEKDAY_NAMES[before.dayOfWeek] ?? String(before.dayOfWeek),
    WEEKDAY_NAMES[after.dayOfWeek] ?? String(after.dayOfWeek),
  );
  push(fields, "focus", "Focus", text(before.focus) || DASH, text(after.focus) || DASH);
  push(fields, "timeNote", "Time", text(before.timeNote) || DASH, text(after.timeNote) || DASH);
  push(
    fields,
    "effortNote",
    "Effort",
    text(before.effortNote) || DASH,
    text(after.effortNote) || DASH,
  );
  push(
    fields,
    "warmupSlug",
    "Warm-up",
    text(before.warmupSlug) || "None",
    text(after.warmupSlug) || "None",
  );
  push(
    fields,
    "includesLifting",
    "Lifting",
    before.includesLifting ? "Yes" : "No",
    after.includesLifting ? "Yes" : "No",
  );
  push(
    fields,
    "includesRun",
    "Running",
    before.includesRun ? "Yes" : "No",
    after.includesRun ? "Yes" : "No",
  );
  push(fields, "notes", "Notes", text(before.notes) || DASH, text(after.notes) || DASH);
  return fields;
}

function runFields(before: BlueprintRun, after: BlueprintRun): DiffField[] {
  const fields: DiffField[] = [];
  push(fields, "duration", "Minutes", span(before.duration), span(after.duration));
  push(
    fields,
    "distanceKm",
    "Distance",
    before.distanceKm ? span(before.distanceKm, " km") : DASH,
    after.distanceKm ? span(after.distanceKm, " km") : DASH,
  );
  push(fields, "rpe", "Effort", span(before.rpe), span(after.rpe));
  push(fields, "paceNote", "Pace", text(before.paceNote) || DASH, text(after.paceNote) || DASH);
  push(
    fields,
    "progressionNote",
    "Progression",
    text(before.progressionNote) || DASH,
    text(after.progressionNote) || DASH,
  );
  push(
    fields,
    "stopRule",
    "Stop rule",
    text(before.stopRule) || DASH,
    text(after.stopRule) || DASH,
  );
  push(fields, "comment", "Comment", text(before.comment) || DASH, text(after.comment) || DASH);
  return fields;
}

function programFields(before: ProgramBlueprint, after: ProgramBlueprint): DiffField[] {
  const fields: DiffField[] = [];
  push(fields, "name", "Name", before.name, after.name);
  push(
    fields,
    "weeks",
    "Length",
    `${before.weeks} ${before.weeks === 1 ? "week" : "weeks"}`,
    `${after.weeks} ${after.weeks === 1 ? "week" : "weeks"}`,
  );
  push(fields, "notes", "Notes", text(before.notes) || DASH, text(after.notes) || DASH);
  push(fields, "slug", "Programme identity", before.slug, after.slug);
  return fields;
}

type Slot = { day: BlueprintDay; exercise: BlueprintExercise; position: number };

function slotsOf(plan: ProgramBlueprint): Slot[] {
  return plan.days.flatMap((day) =>
    day.exercises.map((exercise, index) => ({ day, exercise, position: index + 1 })),
  );
}

function reference(slot: Slot): DiffExercise {
  return {
    exerciseSlug: slot.exercise.exerciseSlug,
    lineageId: slot.exercise.lineageId ?? null,
    position: slot.position,
    targets: exerciseTargets(slot.exercise),
  };
}

/**
 * Which retained slots genuinely moved within their day.
 *
 * Inserting one exercise at the top shifts every later index by one, and reporting all of
 * them as moved buries the single row that changed. The longest common subsequence of the
 * retained slots is the order that was kept; only what falls outside it actually moved.
 */
function movedWithinDay(before: readonly string[], after: readonly string[]): Set<string> {
  const rows = before.length,
    columns = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(columns + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      table[i]![j] =
        before[i] === after[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const kept = new Set<string>();
  let i = 0,
    j = 0;
  while (i < rows && j < columns) {
    if (before[i] === after[j]) {
      kept.add(before[i]!);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return new Set(after.filter((key) => !kept.has(key)));
}

function normalise(input: unknown): ProgramBlueprint {
  const plan = programBlueprintSchema.parse(input);
  plan.days.sort((a, b) => a.dayIndex - b.dayIndex);
  plan.runs.sort((a, b) => a.weekIndex - b.weekIndex || a.dayOfWeek - b.dayOfWeek);
  return plan;
}

/**
 * Compares a stored base version with a proposed or applied version.
 *
 * Slots are matched by lineage and never by name, slug or array position: the same exercise
 * can appear twice in a day, and guessing a replacement pair from adjacent positions invents
 * an operation nobody performed. A slot whose lineage the proposal did not carry over is an
 * addition beside a removal, which is the honest reading of what the data says.
 */
export function diffPrograms(base: unknown, proposed: unknown): ProgramDiff {
  const before = normalise(base);
  const after = normalise(proposed);
  const program = programFields(before, after);

  const beforeSlots = slotsOf(before);
  const afterSlots = slotsOf(after);
  const beforeByLineage = new Map<string, Slot>();
  for (const slot of beforeSlots)
    if (slot.exercise.lineageId) beforeByLineage.set(slot.exercise.lineageId, slot);
  const afterByLineage = new Map<string, Slot>();
  for (const slot of afterSlots)
    if (slot.exercise.lineageId) afterByLineage.set(slot.exercise.lineageId, slot);

  const beforeDays = new Map(before.days.map((day) => [day.dayIndex, day]));
  const afterDays = new Map(after.days.map((day) => [day.dayIndex, day]));
  const groups = new Map<string, DayDiff>();
  const counts = {
    added: 0,
    removed: 0,
    replaced: 0,
    retargeted: 0,
    moved: 0,
    reordered: 0,
    runs: 0,
    days: 0,
  };

  const groupFor = (dayIndex: number | null, dayOfWeek: number | null): DayDiff => {
    const key = dayIndex === null ? `weekday-${dayOfWeek ?? 0}` : `day-${dayIndex}`;
    const existing = groups.get(key);
    if (existing) return existing;
    const day =
      dayIndex === null ? undefined : (afterDays.get(dayIndex) ?? beforeDays.get(dayIndex));
    const created: DayDiff = {
      key,
      dayIndex,
      dayOfWeek: day?.dayOfWeek ?? dayOfWeek,
      name: day?.name ?? (dayOfWeek ? `${WEEKDAY_NAMES[dayOfWeek] ?? "Running"} runs` : "Running"),
      status:
        dayIndex === null
          ? "changed"
          : !beforeDays.has(dayIndex)
            ? "added"
            : !afterDays.has(dayIndex)
              ? "removed"
              : "changed",
      fields: [],
      operations: [],
    };
    groups.set(key, created);
    return created;
  };

  // Days added or removed outright, plus the day-level fields of the days that stayed.
  for (const day of after.days) {
    const old = beforeDays.get(day.dayIndex);
    if (!old) {
      const group = groupFor(day.dayIndex, day.dayOfWeek);
      group.status = "added";
      counts.days += 1;
      continue;
    }
    const fields = dayFields(old, day);
    if (fields.length) {
      groupFor(day.dayIndex, day.dayOfWeek).fields = fields;
      counts.days += 1;
    }
  }
  for (const day of before.days)
    if (!afterDays.has(day.dayIndex)) {
      const group = groupFor(day.dayIndex, day.dayOfWeek);
      group.status = "removed";
      group.name = day.name;
      counts.days += 1;
    }

  // Slots the proposal carried over: a changed exercise is a replacement, a changed day is a
  // move, and a change to neither is a target change.
  for (const slot of afterSlots) {
    const lineage = slot.exercise.lineageId;
    const old = lineage ? beforeByLineage.get(lineage) : undefined;
    if (!old) continue;
    const fields = exerciseFields(old.exercise, slot.exercise);
    const id = `slot:${lineage}`;
    if (old.day.dayIndex !== slot.day.dayIndex) {
      groupFor(old.day.dayIndex, old.day.dayOfWeek).operations.push({
        id,
        kind: "moved_out",
        from: reference(old),
        to: reference(slot),
        otherDayIndex: slot.day.dayIndex,
        otherDayName: slot.day.name,
        fields,
      });
      groupFor(slot.day.dayIndex, slot.day.dayOfWeek).operations.push({
        id,
        kind: "moved_in",
        from: reference(old),
        to: reference(slot),
        otherDayIndex: old.day.dayIndex,
        otherDayName: old.day.name,
        fields,
      });
      counts.moved += 1;
      continue;
    }
    if (old.exercise.exerciseSlug !== slot.exercise.exerciseSlug) {
      groupFor(slot.day.dayIndex, slot.day.dayOfWeek).operations.push({
        id,
        kind: "replaced",
        from: reference(old),
        to: reference(slot),
        fields,
      });
      counts.replaced += 1;
      continue;
    }
    if (fields.length) {
      groupFor(slot.day.dayIndex, slot.day.dayOfWeek).operations.push({
        id,
        kind: "retargeted",
        from: reference(old),
        to: reference(slot),
        fields,
      });
      counts.retargeted += 1;
    }
  }

  for (const slot of afterSlots) {
    const lineage = slot.exercise.lineageId;
    if (lineage && beforeByLineage.has(lineage)) continue;
    groupFor(slot.day.dayIndex, slot.day.dayOfWeek).operations.push({
      id: `add:${slot.day.dayIndex}:${slot.position}:${slot.exercise.exerciseSlug}`,
      kind: "added",
      to: reference(slot),
    });
    counts.added += 1;
  }
  for (const slot of beforeSlots) {
    const lineage = slot.exercise.lineageId;
    if (lineage && afterByLineage.has(lineage)) continue;
    groupFor(slot.day.dayIndex, slot.day.dayOfWeek).operations.push({
      id: `remove:${slot.day.dayIndex}:${slot.position}:${slot.exercise.exerciseSlug}`,
      kind: "removed",
      from: reference(slot),
    });
    counts.removed += 1;
  }

  // Order, read only over the slots both versions keep in the same day, so an insertion does
  // not report every row beneath it as moved.
  for (const day of after.days) {
    const old = beforeDays.get(day.dayIndex);
    if (!old) continue;
    const retained = (exercises: readonly BlueprintExercise[], other: Map<string, Slot>) =>
      exercises
        .map((exercise) => exercise.lineageId)
        .filter(
          (lineage): lineage is string =>
            !!lineage && other.has(lineage) && other.get(lineage)!.day.dayIndex === day.dayIndex,
        );
    const beforeOrder = retained(old.exercises, afterByLineage);
    const afterOrder = retained(day.exercises, beforeByLineage);
    const moved = movedWithinDay(beforeOrder, afterOrder);
    if (!moved.size) continue;
    const group = groupFor(day.dayIndex, day.dayOfWeek);
    for (const lineage of afterOrder) {
      if (!moved.has(lineage)) continue;
      const to = afterByLineage.get(lineage)!;
      const from = beforeByLineage.get(lineage)!;
      const existing = group.operations.find((operation) => operation.id === `slot:${lineage}`);
      if (existing) continue;
      group.operations.push({
        id: `slot:${lineage}`,
        kind: "reordered",
        from: reference(from),
        to: reference(to),
        fields: [],
      });
      counts.reordered += 1;
    }
  }

  // Runs, matched by their supported identity — the week and weekday they occur on.
  const runKey = (run: BlueprintRun) => `${run.weekIndex}:${run.dayOfWeek}`;
  const beforeRuns = new Map(before.runs.map((run) => [runKey(run), run]));
  const afterRuns = new Map(after.runs.map((run) => [runKey(run), run]));
  const runDayFor = (dayOfWeek: number) => {
    const day =
      after.days.find((entry) => entry.dayOfWeek === dayOfWeek && entry.includesRun) ??
      after.days.find((entry) => entry.dayOfWeek === dayOfWeek) ??
      before.days.find((entry) => entry.dayOfWeek === dayOfWeek);
    return groupFor(day ? day.dayIndex : null, dayOfWeek);
  };
  for (const [key, run] of afterRuns) {
    const old = beforeRuns.get(key);
    if (!old) {
      runDayFor(run.dayOfWeek).operations.push({
        id: `run:add:${key}`,
        kind: "run_added",
        weekIndex: run.weekIndex,
        to: runSummary(run),
      });
      counts.runs += 1;
      continue;
    }
    const fields = runFields(old, run);
    if (!fields.length) continue;
    runDayFor(run.dayOfWeek).operations.push({
      id: `run:${key}`,
      kind: "run_changed",
      weekIndex: run.weekIndex,
      fields,
    });
    counts.runs += 1;
  }
  for (const [key, run] of beforeRuns) {
    if (afterRuns.has(key)) continue;
    runDayFor(run.dayOfWeek).operations.push({
      id: `run:remove:${key}`,
      kind: "run_removed",
      weekIndex: run.weekIndex,
      from: runSummary(run),
    });
    counts.runs += 1;
  }

  // Lifting rows first, in the order the day performs them; run occurrences after, by week.
  const rank = (operation: DayOperation): [number, number] =>
    "weekIndex" in operation
      ? [1, operation.weekIndex]
      : [0, operation.kind === "removed" ? operation.from.position : operation.to.position];
  const order = (group: DayDiff) => group.dayIndex ?? 1000 + (group.dayOfWeek ?? 0);
  const days = [...groups.values()]
    .filter((group) => group.fields.length || group.operations.length || group.status !== "changed")
    .sort((a, b) => order(a) - order(b));
  for (const group of days)
    group.operations.sort((a, b) => {
      const [aGroup, aIndex] = rank(a);
      const [bGroup, bIndex] = rank(b);
      return aGroup - bGroup || aIndex - bIndex;
    });
  return {
    program,
    days,
    counts,
    empty: program.length === 0 && days.length === 0,
  };
}

/**
 * Every operation ID a diff contains, for checking a claim against the data.
 *
 * A decision that says it added direct core work names the operations it produced; if the
 * blueprint does not contain them, the claim is rejected rather than shown to the athlete.
 * Programme-level fields get an ID too, so a change to the block length can be cited.
 */
export function diffOperationIds(diff: ProgramDiff): Set<string> {
  return new Set([
    ...diff.program.map((field) => `program:${field.field}`),
    ...diff.days.flatMap((day) => [
      ...(day.fields.length || day.status !== "changed" ? [`day:${day.key}`] : []),
      ...day.operations.map((operation) => operation.id),
    ]),
  ]);
}

/**
 * Whether a proposal differs from its base in any way the athlete could see.
 *
 * Persistence and presentation share this one definition, so a review cannot leave behind a
 * draft that offers to apply nothing. The independent authority checks are unaffected: this
 * says whether there is a change at all, never whether one may be applied without asking.
 */
export function hasProgramChange(base: unknown, proposed: unknown): boolean {
  return !diffPrograms(base, proposed).empty;
}

/** "2 added, 1 replaced across 2 days" — enough for a list row to be worth tapping. */
export function programDiffSummary(diff: ProgramDiff): string {
  if (diff.empty) return "No programme changes";
  const parts: string[] = [];
  const say = (count: number, word: string) => {
    if (count > 0) parts.push(`${count} ${word}`);
  };
  say(diff.counts.added, "added");
  say(diff.counts.removed, "removed");
  say(diff.counts.replaced, diff.counts.replaced === 1 ? "replacement" : "replacements");
  say(diff.counts.retargeted, diff.counts.retargeted === 1 ? "target change" : "target changes");
  say(diff.counts.moved, "moved");
  say(diff.counts.reordered, "reordered");
  say(diff.counts.runs, diff.counts.runs === 1 ? "run change" : "run changes");
  if (!parts.length && (diff.program.length || diff.counts.days))
    parts.push("programme details changed");
  const days = diff.days.filter((day) => day.dayIndex !== null).length;
  const scope = days > 0 ? ` across ${days} ${days === 1 ? "day" : "days"}` : "";
  return `${parts.join(", ")}${scope}`;
}

/**
 * Every operation's exact content, keyed by its ID.
 *
 * Two proposals written against the same base make the same change exactly when they share
 * an ID and a signature. That is what lets an ask travel from a proposal to the one that took
 * its place — or to the programme the athlete approved instead — without a model having to
 * say so, and without an ask being called granted by a change that only resembles it.
 */
export function diffOperationSignatures(diff: ProgramDiff): Map<string, string> {
  const signatures = new Map<string, string>();
  for (const field of diff.program) signatures.set(`program:${field.field}`, JSON.stringify(field));
  for (const day of diff.days) {
    if (day.fields.length || day.status !== "changed")
      signatures.set(`day:${day.key}`, JSON.stringify({ status: day.status, fields: day.fields }));
    for (const operation of day.operations) {
      // A cross-day move appears in both of its days as one operation; either half says it.
      if (operation.kind === "moved_in") continue;
      signatures.set(operation.id, JSON.stringify(operation));
    }
  }
  return signatures;
}

/** The fields whose values are amounts, and so can move up or down. */
const AMOUNTS = new Set([
  "sets",
  "target",
  "rir",
  "rest",
  "weeks",
  "duration",
  "distanceKm",
  "rpe",
]);

/**
 * A formatted amount as the low and high end of its range, in one unit.
 *
 * Rest reads in seconds below two minutes and in minutes above, so "150–180 s" and "3 min" are
 * put on seconds before they are compared. A change of measure — reps to seconds, which the
 * diff writes with the measure in brackets — is not bigger or smaller, only different.
 */
function amount(value: string): [number, number] | null {
  if (value.includes("(")) return null;
  const numbers = value.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length > 2) return null;
  const scale = /\bmin\b/.test(value) ? 60 : 1;
  return [Number(numbers[0]) * scale, Number(numbers[numbers.length - 1]) * scale];
}

/**
 * Which way an amount moved: "up" or "down" when both ends of its range moved that way (or
 * held), "changed" when they split — a range widened or narrowed — or when it is not an amount.
 */
function direction(field: string, from: string, to: string): "up" | "down" | "changed" {
  if (!AMOUNTS.has(field)) return "changed";
  const before = amount(from);
  const after = amount(to);
  if (!before || !after) return "changed";
  const [low, high] = [after[0] - before[0], after[1] - before[1]];
  if (low >= 0 && high >= 0 && (low > 0 || high > 0)) return "up";
  if (low <= 0 && high <= 0 && (low < 0 || high < 0)) return "down";
  return "changed";
}

/**
 * What a change is *about*, independent of its exact numbers and of the week it lands in.
 *
 * "Shorter Thursday runs" is one idea whether it is written 14–16 or 15–17 minutes, for weeks
 * 3–8 or 4–8. A fingerprint names the thing changed and the way it moved, so a change the
 * athlete declined is recognised when it comes back in slightly different words, and a
 * change in the opposite direction is not mistaken for it. The coach's own description of
 * the block is not a change anybody declines, so it has none.
 */
export function changeFingerprints(diff: ProgramDiff): Map<string, string> {
  const prints = new Map<string, string>();
  const note = (key: string, label: string) => {
    if (!prints.has(key)) prints.set(key, label);
  };
  for (const field of diff.program)
    if (field.field !== "notes" && field.field !== "slug")
      note(
        `program:${field.field}:${direction(field.field, field.from, field.to)}`,
        `${field.label}: ${field.from} → ${field.to}`,
      );
  for (const day of diff.days) {
    const where = day.name;
    if (day.status !== "changed")
      note(`day:${day.key}:${day.status}`, `${where}: day ${day.status}`);
    for (const field of day.fields)
      note(`day:${day.key}:${field.field}`, `${where}: ${field.label.toLowerCase()} changed`);
    for (const operation of day.operations) {
      switch (operation.kind) {
        case "added":
          note(
            `add:${day.key}:${operation.to.exerciseSlug}`,
            `${where}: add ${operation.to.exerciseSlug}`,
          );
          break;
        case "removed":
          note(
            `remove:${operation.from.lineageId ?? `${day.key}:${operation.from.exerciseSlug}`}`,
            `${where}: remove ${operation.from.exerciseSlug}`,
          );
          break;
        case "replaced":
          note(
            `${operation.id}:exercise:${operation.to.exerciseSlug}`,
            `${where}: ${operation.from.exerciseSlug} → ${operation.to.exerciseSlug}`,
          );
          for (const field of operation.fields)
            note(
              `${operation.id}:${field.field}:${direction(field.field, field.from, field.to)}`,
              `${where}: ${field.label.toLowerCase()} ${field.from} → ${field.to}`,
            );
          break;
        case "retargeted":
        case "moved_out":
          if (operation.kind === "moved_out")
            note(
              `${operation.id}:day:${operation.otherDayIndex}`,
              `${where}: ${operation.to.exerciseSlug} moves to ${operation.otherDayName}`,
            );
          for (const field of operation.fields)
            note(
              `${operation.id}:${field.field}:${direction(field.field, field.from, field.to)}`,
              `${operation.to.exerciseSlug}: ${field.label.toLowerCase()} ${field.from} → ${field.to}`,
            );
          break;
        case "reordered":
          note(`${operation.id}:order`, `${where}: ${operation.to.exerciseSlug} reordered`);
          break;
        case "run_added":
          note(`run:${day.dayOfWeek ?? day.key}:added`, `${where}: runs added`);
          break;
        case "run_removed":
          note(`run:${day.dayOfWeek ?? day.key}:removed`, `${where}: runs removed`);
          break;
        case "run_changed":
          for (const field of operation.fields)
            note(
              `run:${day.dayOfWeek ?? day.key}:${field.field}:${direction(field.field, field.from, field.to)}`,
              `${where} runs: ${field.label.toLowerCase()} ${field.from} → ${field.to}`,
            );
          break;
        case "moved_in":
          break;
      }
    }
  }
  return prints;
}
