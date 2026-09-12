import { prescription } from "@/components/planned-exercises";
import type { PlanWarning } from "@/domain/coach-review";
import { DetailList } from "@/components/ui/detail-list";
import { planLine, type PlanRun, type StoredPlanExercise } from "@/domain/session-plan";
import { cn } from "@/lib/utils";
import type { PlannedExercisePreview, RunTarget } from "@/server/repositories/schedule";

/** "6 exercises · 15 sets" for a coach plan: what it keeps, and the sets it asks for. */
export function coachPlanSummary(
  entries: readonly StoredPlanExercise[],
  planned: readonly PlannedExercisePreview[],
): string {
  const kept = entries.filter((entry) => entry.action !== "drop");
  const unchanged = planned.filter(
    (slot) => !entries.some((entry) => entry.slotId === slot.programExerciseId),
  );
  const sets = kept.reduce(
    (total, entry) => {
      if (entry.sets.length > 0)
        return total + entry.sets.filter((s) => s.setType !== "warmup").length;
      // An entry without sets leaves the rule's prefill in place, so it costs what the programme says.
      return total + (planned.find((p) => p.programExerciseId === entry.slotId)?.sets ?? 0);
    },
    unchanged.reduce((total, slot) => total + slot.sets, 0),
  );
  const count = kept.length + unchanged.length;
  return `${count} ${count === 1 ? "exercise" : "exercises"} · ${sets} ${sets === 1 ? "set" : "sets"}`;
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
  warnings = [],
}: {
  entries: readonly StoredPlanExercise[];
  planned: readonly PlannedExercisePreview[];
  unit: string;
  /** What the app noticed about the plan. Advice, under the plan it is about. */
  warnings?: readonly PlanWarning[];
}) {
  return (
    <>
      <ul className="space-y-2.5">
        {entries.map((entry, index) => {
          const slot = entry.slotId
            ? planned.find((p) => p.programExerciseId === entry.slotId)
            : undefined;
          const dropped = entry.action === "drop";
          const name = dropped ? (slot?.name ?? entry.exerciseName) : entry.exerciseName;
          const machine = !dropped ? entry.equipmentInstanceName : null;
          // A slot counted per side stays per side when the coach keeps it, and the line has to
          // say so: "2 × 10" against a per-side movement is half the work it asks for.
          const line = planLine(entry, unit, entry.perSide ?? slot?.perSide ?? false);
          const targets = dropped
            ? "Skipped today"
            : (line ?? (slot ? prescription(slot) : "By the rule"));
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
        {planned
          .filter((slot) => !entries.some((entry) => entry.slotId === slot.programExerciseId))
          .map((slot) => (
            <li key={slot.programExerciseId} className="min-w-0">
              <p className="text-sm [overflow-wrap:anywhere]">{slot.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{prescription(slot)}</p>
            </li>
          ))}
      </ul>
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {warnings.map((warning) => (
            <li key={warning.code} className="text-xs [overflow-wrap:anywhere] text-warning">
              {warning.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * How the coach wants the run run, with anything the programme still says underneath. The
 * coach's own stop rule replaces the programme's when it wrote one, since it was written
 * knowing this week's shins.
 */
export function CoachRunDetails({ run, programme }: { run: PlanRun; programme: RunTarget | null }) {
  return (
    <DetailList
      entries={[
        ["Why", run.note],
        ["Pace", run.paceNote || programme?.paceNote],
        ["Stop if", run.stopRule || programme?.shinRule],
        ["Where", run.mode === "treadmill" ? "Treadmill" : "Outdoor"],
      ]}
    />
  );
}
