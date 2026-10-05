import type { PrintPart, StrengthColumn } from "@/components/art/geometry";
import { modalityGlyph, type GlyphName } from "@/components/ui/glyphs";
import type { ActivitySport } from "@/domain/activity";
import type { StoredPlanExercise } from "@/domain/session-plan";
import { prescription, targetsLine, volumeRange } from "@/components/planned-exercises";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { PlannedExercisePreview, TodayPlan } from "@/server/repositories/schedule";

// ---------- the cycle as squares ----------

export type CycleCell = "done" | "skipped" | "today" | "todo";

/**
 * The programme's position as squares (DESIGN.md: "seven squares, not a sentence"): the days
 * done in ink, a skipped one dashed, the day offered ringed, the rest a hairline.
 */
export function cycleCells(plan: TodayPlan): CycleCell[] {
  const offered = plan.suggestedDay?.dayIndex ?? null;
  return [...plan.cycleDays]
    .sort((a, b) => a.day.dayIndex - b.day.dayIndex)
    .map(({ day, status }) =>
      status === "completed"
        ? "done"
        : status === "skipped"
          ? "skipped"
          : day.dayIndex === offered
            ? "today"
            : "todo",
    );
}

/** How far the programme is behind the calendar: "25 days behind", "1 day behind". */
export function daysBehind(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"} behind`;
}

/** What the squares say aloud, and where they go. */
export function cycleLabel(plan: TodayPlan): string {
  const cycle = plan.suggestion?.slot.cycleIndex;
  const day = plan.suggestedDay?.dayIndex;
  const parts = [
    cycle ? `Cycle ${cycle} of ${plan.program.weeks}` : null,
    day ? `day ${day} of ${plan.cycleDays.length}` : null,
    plan.behind > 0 ? daysBehind(plan.behind) : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. Open the programme`;
}

const PRINT_SPORT: Record<Exclude<ActivitySport, "strength">, "run" | "ride" | "swim"> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

// ---------- the exercises, as rows ----------

export type PlanRowModel = {
  key: string;
  name: string;
  glyph: GlyphName | null;
  /** The prescription, or the coach's line for it. */
  line: string;
  /** The coach's own words for this exercise. */
  note: string | null;
  /** Dropped by the coach: kept in its place, said to be skipped. */
  dropped: boolean;
  /** The sets it asks for, for its column in the print. */
  sets: number;
  supersetGroup: string | null;
};

/**
 * A slot's prescription as a row says it: "3 × 8–12 @ 1–2 RIR". RIR is written for sets counted
 * in reps; a carry or a hold is rated by RPE as it is logged, so its line is the work alone
 * ("3 × 20–40 m").
 */
export function rowPrescription(slot: PlannedExercisePreview): string {
  if (slot.prescriptionType === "reps") return prescription(slot);
  return `${slot.sets} × ${volumeRange(slot)}${slot.perSide ? " per side" : ""}`;
}

/** The programme's exercises, or the coach's plan for them, in the programme's order. */
export function planRows(
  planned: readonly PlannedExercisePreview[],
  coach: { exercises: readonly StoredPlanExercise[] } | null,
  unit: string,
): PlanRowModel[] {
  const fromSlot = (slot: PlannedExercisePreview): PlanRowModel => ({
    key: slot.programExerciseId,
    name: slot.name,
    glyph: modalityGlyph(slot.modality),
    line: rowPrescription(slot),
    note: null,
    dropped: false,
    sets: slot.sets,
    supersetGroup: slot.supersetGroup,
  });
  if (!coach) return planned.map(fromSlot);
  const rows = coach.exercises.map((entry, index): PlanRowModel => {
    const slot = entry.slotId ? planned.find((p) => p.programExerciseId === entry.slotId) : null;
    const dropped = entry.action === "drop";
    const line = targetsLine(
      entry.sets,
      entry.unit ?? unit,
      entry.perSide ?? slot?.perSide ?? false,
    );
    const working = entry.sets.filter((set) => set.setType !== "warmup").length;
    return {
      key: `${entry.slotId ?? "added"}-${index}`,
      name: dropped ? (slot?.name ?? entry.exerciseName) : entry.exerciseName,
      glyph: modalityGlyph(slot?.modality),
      line: dropped
        ? slot
          ? prescription(slot)
          : ""
        : `${line ?? (slot ? prescription(slot) : "By the rule")}${
            entry.equipmentInstanceName ? ` · ${entry.equipmentInstanceName}` : ""
          }`,
      note: entry.note || null,
      dropped,
      sets: working > 0 ? working : (slot?.sets ?? 0),
      // As the session will have it: the plan's grouping wins, and a dropped one stands alone.
      supersetGroup: dropped ? null : (entry.supersetGroup ?? slot?.supersetGroup ?? null),
    };
  });
  // Slots the coach left alone keep the programme's word.
  const untouched = planned
    .filter((slot) => !coach.exercises.some((entry) => entry.slotId === slot.programExerciseId))
    .map(fromSlot);
  return [...rows, ...untouched];
}

/** Rows grouped as they stand: a superset's members together, under one bracket. */
export function groupRows<T extends { supersetGroup: string | null }>(rows: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (row.supersetGroup && last?.[0]?.supersetGroup === row.supersetGroup) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

// ---------- the day's print ----------

/**
 * The day's plan as a print (DESIGN.md, Prints): its parts in the order of the rows under it.
 * The programme's own endurance first, as the day is written; then the exercises, a column of
 * sets each, a superset's two standing closer; then anything else dated today.
 */
export function todayParts({
  programme,
  rows,
  standalone,
  restDrills,
  lifted = false,
}: {
  programme: readonly ScheduledOccurrence[];
  rows: readonly PlanRowModel[];
  standalone: readonly ScheduledOccurrence[];
  /** A rest day's mobility: its drills as the fan's blades. */
  restDrills?: number;
  /** The day's workout is logged: its columns print full. */
  lifted?: boolean;
}): PrintPart[] {
  const endurance = (occurrence: ScheduledOccurrence): PrintPart | null =>
    occurrence.sport === "strength"
      ? null
      : {
          kind: PRINT_SPORT[occurrence.sport],
          state:
            occurrence.disposition === "skipped"
              ? "skipped"
              : occurrence.resolution.kind === "logged"
                ? "done"
                : "todo",
        };
  const columns: StrengthColumn[] = [];
  rows.forEach((row, index) => {
    if (row.sets <= 0) return;
    const next = rows[index + 1];
    columns.push({
      sets: row.sets,
      done: lifted && !row.dropped ? row.sets : 0,
      skipped: row.dropped,
      pair:
        row.supersetGroup !== null &&
        next !== undefined &&
        next.supersetGroup === row.supersetGroup,
    });
  });
  return [
    ...(restDrills ? [{ kind: "mobility" as const, segments: restDrills, modules: 3 }] : []),
    ...programme.map(endurance),
    ...(columns.length > 0 ? [{ kind: "strength" as const, columns }] : []),
    ...standalone.map(endurance),
  ].filter((part): part is PrintPart => part !== null);
}

const PART_NAMES = { run: "a run", ride: "a ride", swim: "a swim", walk: "a walk" } as const;

/**
 * What the day's print draws, said in its order for a screen reader: "Easy Run + Arms: a run to
 * do, then 4 exercises as columns of their sets, to do". Each part says where it stands, so the
 * label never claims nothing is done once something is.
 */
export function printLabel(dayName: string, parts: readonly PrintPart[]): string {
  const said = parts.map((part) => {
    if (part.kind === "strength") {
      const done = part.columns.every((column) => column.skipped || column.done >= column.sets);
      return `${part.columns.length} ${part.columns.length === 1 ? "exercise" : "exercises"} as columns of their sets, ${done ? "done" : "to do"}`;
    }
    const name =
      part.kind === "mobility"
        ? "the mobility"
        : (PART_NAMES[part.kind as keyof typeof PART_NAMES] ?? "a session");
    const state = part.state === "done" ? "done" : part.state === "skipped" ? "skipped" : "to do";
    return `${name} ${state}`;
  });
  return `${dayName}: ${said.join(", then ")}.`;
}
