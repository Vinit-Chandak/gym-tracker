import { DetailList } from "@/components/ui/detail-list";
import { rangeLabel } from "@/lib/labels";
import type { RunTarget } from "@/server/repositories/schedule";

/** "20–25 min · RPE 3–4": how long, and how hard. */
export function runSummary(run: RunTarget): string {
  const duration = rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min");
  return run.rpeMin !== null ? `${duration} · RPE ${rangeLabel(run.rpeMin, run.rpeMax)}` : duration;
}

/** Whether the run says anything beyond how long and how hard. */
export function hasRunGuidance(run: RunTarget): boolean {
  return Boolean(run.paceNote || run.progressionNote || run.shinRule);
}

/** How to run it, once the duration and effort have already been said. */
export function RunPlanDetails({ run }: { run: RunTarget }) {
  return (
    <DetailList
      entries={[
        ["Pace", run.paceNote],
        ["Progression", run.progressionNote],
        ["Shins", run.shinRule],
      ]}
    />
  );
}
