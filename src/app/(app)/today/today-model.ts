import { modalityGlyph, typeGlyph, type GlyphName } from "@/components/ui/glyphs";
import type { StoredPlanExercise } from "@/domain/session-plan";
import { prescription, targetsLine, volumeRange } from "@/components/planned-exercises";
import type { SetLengthUnit } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import type { PlanMachineType } from "@/server/repositories/coach-plans";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

// ---------- the exercises, as rows ----------

export type PlanRowModel = {
  key: string;
  /** The programme's slot it stands for; null for one the coach added. */
  slotId: string | null;
  /** The exercise it asks for, which an added one is found by in the workout started from it. */
  exerciseId: string;
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
  /** What it becomes at the athlete's gym, where that is news (a programme day's page). */
  at?: string | null;
};

/**
 * A slot's prescription as a row says it: "3 × 8–12 @ 1–2 RIR". RIR is written for sets counted
 * in reps; a carry or a hold is rated by RPE as it is logged, so its line is the work alone
 * ("3 × 20–40 m", or "3 × 22–44 yd" for an athlete in yards).
 */
export function rowPrescription(slot: PlannedExercisePreview, length: SetLengthUnit): string {
  if (slot.prescriptionType === "reps") return prescription(slot, length);
  return `${slot.sets} × ${volumeRange(slot, length)}${slot.perSide ? " per side" : ""}`;
}

/**
 * The programme's exercises, or the coach's plan for them, in the programme's order. A coach's
 * row names its machine when it chose one, and is led by that machine's glyph where its type has
 * one of its own (`typeGlyph`: an accessory, a cardio machine, the Smith machine), as the
 * workout's row will be (`equipmentGlyph`); otherwise by what loads the movement.
 */
export function planRows(
  planned: readonly PlannedExercisePreview[],
  coach: {
    exercises: readonly StoredPlanExercise[];
    /** The type of each machine the plan names, keyed by the machine. */
    machines?: Readonly<Record<string, PlanMachineType>>;
  } | null,
  unit: string,
  /** What a carry reads in: the athlete's metres or yards. */
  length: SetLengthUnit,
): PlanRowModel[] {
  const fromSlot = (slot: PlannedExercisePreview): PlanRowModel => ({
    key: slot.programExerciseId,
    slotId: slot.programExerciseId,
    exerciseId: slot.exerciseId,
    name: slot.name,
    glyph: modalityGlyph(slot.modality),
    line: rowPrescription(slot, length),
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
      length,
      entry.perSide ?? slot?.perSide ?? false,
    );
    const working = entry.sets.filter((set) => set.setType !== "warmup").length;
    const machine =
      !dropped && entry.equipmentInstanceId ? coach.machines?.[entry.equipmentInstanceId] : null;
    return {
      key: `${entry.slotId ?? "added"}-${index}`,
      slotId: entry.slotId,
      exerciseId: entry.exerciseId,
      name: dropped ? (slot?.name ?? entry.exerciseName) : entry.exerciseName,
      glyph: (machine ? typeGlyph(machine) : null) ?? modalityGlyph(slot?.modality),
      // An exercise the coach added with no sets has no line of its own but its machine: its
      // loads are suggested as it is logged, as any exercise's are.
      line: dropped
        ? slot
          ? prescription(slot, length)
          : ""
        : joinFacts([
            line ?? (slot ? prescription(slot, length) : null),
            entry.equipmentInstanceName,
          ]),
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
