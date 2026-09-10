import { prescription } from "@/components/planned-exercises";
import { planLine, type StoredPlanExercise } from "@/domain/session-plan";
import { cn } from "@/lib/utils";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

/** "6 exercises · 15 sets" for a coach plan: what it keeps, and the sets it asks for. */
export function coachPlanSummary(
  entries: readonly StoredPlanExercise[],
  planned: readonly PlannedExercisePreview[],
): string {
  const kept = entries.filter((entry) => entry.action !== "drop");
  const sets = kept.reduce((total, entry) => {
    if (entry.sets.length > 0)
      return total + entry.sets.filter((s) => s.setType !== "warmup").length;
    // An entry without sets leaves the rule's prefill in place, so it costs what the programme says.
    return total + (planned.find((p) => p.programExerciseId === entry.slotId)?.sets ?? 0);
  }, 0);
  return `${kept.length} ${kept.length === 1 ? "exercise" : "exercises"} · ${sets} sets`;
}

/**
 * The coach's plan for the day, in the same rhythm as the programme's list: the name over
 * its targets, every entry the same shape. The machine follows the name when the coach chose
 * one, the coach's line comes third only when there is one, and a dropped exercise stays in
 * its place, struck through, so the day still reads in programme order.
 */
export function CoachPlanList({
  entries,
  planned,
  unit,
}: {
  entries: readonly StoredPlanExercise[];
  planned: readonly PlannedExercisePreview[];
  unit: string;
}) {
  return (
    <ul className="space-y-2.5">
      {entries.map((entry, index) => {
        const slot = entry.slotId
          ? planned.find((p) => p.programExerciseId === entry.slotId)
          : undefined;
        const dropped = entry.action === "drop";
        const name = dropped ? (slot?.name ?? entry.exerciseName) : entry.exerciseName;
        const machine = !dropped ? entry.equipmentInstanceName : null;
        const targets = dropped
          ? "Skipped today"
          : (planLine(entry, unit) ?? (slot ? prescription(slot) : "By the rule"));
        return (
          <li key={`${entry.slotId ?? "added"}-${index}`} className="min-w-0">
            <p
              className={cn(
                "text-sm [overflow-wrap:anywhere]",
                dropped && "text-ink-subtle line-through",
              )}
            >
              {name}
              {machine && <span className="text-ink-muted"> · {machine}</span>}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{targets}</p>
            {entry.note && <p className="mt-0.5 text-xs text-ink-muted">{entry.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
