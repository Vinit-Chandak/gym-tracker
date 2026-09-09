import type { SetLike } from "@/domain/sets";
import { SET_TYPE_LABELS } from "@/lib/labels";

/**
 * Recorded sets, read only. The same columns as the logger's grid — set, load, reps or
 * seconds, RIR — so a finished workout reads as the one being logged, minus the controls.
 * Used by the completed-session view and by History, which must agree exactly.
 */
export function SetTable({ sets, unitLabel }: { sets: readonly SetLike[]; unitLabel: string }) {
  if (sets.length === 0) return <p className="text-sm text-ink-muted">No sets logged.</p>;
  const timed = sets.some((set) => set.durationSeconds !== null && set.reps === null);
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
            {timed ? "Seconds" : "Reps"}
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
              {timed ? (set.durationSeconds ?? "—") : (set.reps ?? "—")}
            </td>
            <td className="py-1.5 text-center">{set.rir ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
