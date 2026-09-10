import { measureOf, type SetLike } from "@/domain/sets";
import { MEASURE_COLUMN_LABELS, SET_TYPE_LABELS } from "@/lib/labels";

/**
 * Recorded sets, read only. The same columns as the logger's grid — set, load, reps or
 * seconds, RIR — so a finished workout reads as the one being logged, minus the controls.
 * Used by the completed-session view and by History, which must agree exactly.
 */
export function SetTable({ sets, unitLabel }: { sets: readonly SetLike[]; unitLabel: string }) {
  if (sets.length === 0) return <p className="text-sm text-ink-muted">No sets logged.</p>;
  // The recorded sets say what they counted; the plan that asked for them is not in scope here.
  const measure = measureOf(sets.find((set) => set.reps === null) ?? sets[0]!);
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-line text-xs text-ink-muted">
          <th scope="col" className="w-11 py-1 text-center font-medium">
            Set
          </th>
          <th scope="col" className="py-1 text-center font-medium">
            {unitLabel}
          </th>
          <th scope="col" className="py-1 text-center font-medium">
            {MEASURE_COLUMN_LABELS[measure]}
          </th>
          <th scope="col" className="py-1 text-center font-medium">
            RIR
          </th>
        </tr>
      </thead>
      <tbody>
        {sets.map((set) => (
          <tr key={set.setIndex} className="border-b border-line last:border-0">
            <th scope="row" className="py-1.5 text-center font-medium">
              {set.setIndex}
              {set.setType !== "working" && (
                <span className="block text-[0.625rem] leading-none font-normal text-ink-muted">
                  {SET_TYPE_LABELS[set.setType]}
                </span>
              )}
            </th>
            {/* An em dash, not a zero: nothing recorded is not the same as none. */}
            <td className="py-1.5 text-center">{set.weight ?? "—"}</td>
            <td className="py-1.5 text-center">
              {measure === "duration"
                ? (set.durationSeconds ?? "—")
                : measure === "distance"
                  ? (set.distanceMeters ?? "—")
                  : (set.reps ?? "—")}
            </td>
            <td className="py-1.5 text-center">{set.rir ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
