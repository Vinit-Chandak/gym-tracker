import { LinkButton } from "@/components/ui/button";
import { RankList, type RankRow } from "@/components/ui/rank-list";
import { Section } from "@/components/ui/section";
import { metricLabel, type MetricExercise, type SharedMetric } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import type { SetLengthUnit } from "@/lib/distance-units";
import { formatSharedMetric } from "@/lib/format";

/** A metric's name inside a sentence: "top weight", but "est. 1RM", its initialism kept. */
function inSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * The Friends' leaderboard card (plan §3.11–3.12): the top of the board for one movement on
 * its primary metric, your own row kept in view, and the way to the full board with the
 * movement preselected. On an exercise's own page and under its head to head — the most
 * natural way anyone finds the leaderboard at all.
 */
export function FriendsBoardCard({
  exercise,
  metric,
  rows,
  you,
  unit,
  length,
  currentYear,
}: {
  exercise: MetricExercise & { id: string };
  metric: SharedMetric;
  /** Already cut to the top few plus you (`topWithYou`). */
  rows: readonly RankRow[];
  you: string;
  unit: BodyLoadUnit;
  /** What a carry reads in: the viewer's metres or yards. */
  length: SetLengthUnit;
  /** The year it is in the viewer's zone: a best set in it does not name it. */
  currentYear?: string;
}) {
  return (
    <Section
      title="Friends' leaderboard"
      info={`You and the people you follow, ranked by ${inSentence(metricLabel(metric, exercise))} over all time. Ties share a rank.`}
    >
      <RankList
        rows={rows}
        you={you}
        format={(value) => formatSharedMetric(metric, value, unit, length)}
        currentYear={currentYear}
      />
      <LinkButton
        href={`/profile/friends/leaderboard?mode=exercise&exercise=${exercise.id}`}
        variant="ghost"
        size="sm"
        className="w-full"
      >
        Full leaderboard
      </LinkButton>
    </Section>
  );
}
