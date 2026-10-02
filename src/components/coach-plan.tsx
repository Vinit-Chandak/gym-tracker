import { PlanRow, prescription } from "@/components/planned-exercises";
import type { PlanWarning } from "@/domain/coach-review";
import { warningsForSport } from "@/domain/sport-scope";
import { DetailList } from "@/components/ui/detail-list";
import { Warning } from "@/components/ui/icons";
import { planLine, type PlanRun, type StoredPlanExercise } from "@/domain/session-plan";
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
 * The coach's plan for the day, in the same rows as the programme's list: numbered, the name
 * over its targets, the coach's own line in pen beneath. The machine follows the name when
 * the coach chose one, and a dropped exercise stays in its place, struck through, so the day
 * still reads in programme order.
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
  const unmentioned = planned.filter(
    (slot) => !entries.some((entry) => entry.slotId === slot.programExerciseId),
  );
  const shown = warningsForSport(warnings, "workout");
  return (
    <>
      <ol className="min-w-0 ruled-list">
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
            <PlanRow
              key={`${entry.slotId ?? "added"}-${index}`}
              number={index + 1}
              name={
                <>
                  {name}
                  {machine && <span className="font-normal text-ink-muted"> · {machine}</span>}
                </>
              }
              detail={targets}
              note={entry.note}
              struck={dropped}
            />
          );
        })}
        {unmentioned.map((slot, index) => (
          <PlanRow
            key={slot.programExerciseId}
            number={entries.length + index + 1}
            name={slot.name}
            detail={prescription(slot)}
          />
        ))}
      </ol>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {shown.map((warning, index) => (
            <li
              key={`${warning.code}-${index}`}
              className="flex gap-2 text-sm [overflow-wrap:anywhere] text-warning"
            >
              <Warning className="mt-0.5 shrink-0" aria-hidden />
              <span>{warning.message}</span>
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
 * knowing how this week has actually gone.
 */
export function CoachRunDetails({ run, programme }: { run: PlanRun; programme: RunTarget | null }) {
  return (
    <DetailList
      entries={[
        ["Why", run.note],
        ["Pace", run.paceNote || programme?.paceNote],
        ["Stop if", run.stopRule || programme?.stopRule],
        ["Where", run.mode === "treadmill" ? "Treadmill" : "Outdoor"],
      ]}
    />
  );
}
