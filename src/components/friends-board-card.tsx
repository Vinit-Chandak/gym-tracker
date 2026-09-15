import { LinkButton } from "@/components/ui/button";
import { RankList, type RankRow } from "@/components/ui/rank-list";
import { Section } from "@/components/ui/section";
import { metricLabel, type MetricExercise, type SharedMetric } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import { formatSharedMetric } from "@/lib/format";

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
}: {
  exercise: MetricExercise & { id: string };
  metric: SharedMetric;
  /** Already cut to the top few plus you (`topWithYou`). */
  rows: readonly RankRow[];
  you: string;
  unit: BodyLoadUnit;
}) {
  return (
    <Section
      title="Friends' leaderboard"
      info={`You and the people you follow, ranked by ${metricLabel(metric, exercise).toLowerCase()} over all time, with the day each best was set. Equal values share a rank.`}
    >
      <RankList rows={rows} you={you} format={(value) => formatSharedMetric(metric, value, unit)} />
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
