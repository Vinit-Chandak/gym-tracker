import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { PersonCard } from "@/components/person-card";
import { PeriodRecordsList } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { SportPeriodControls } from "@/components/ui/sport-period-controls";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_METRIC_LABELS, activityValue, type ActivityMetric } from "@/domain/leaderboard";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { PERIOD_LABELS } from "@/domain/period";
import type { TrainingSport } from "@/domain/sport-scope";
import { formatActivityMetric } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { hiddenTrainingLine } from "@/server/queries/head-to-head";
import { getRequestProfile } from "@/server/queries/request-profile";
import { followState } from "@/server/repositories/follows";
import { getDirectoryProfile } from "@/server/repositories/people";
import {
  canViewTraining,
  EMPTY_TOTALS,
  readMuscleSets,
  readPeriodTotals,
  readRecords,
} from "@/server/repositories/shared-stats";
import { requireUsername } from "@/server/validation/params";
import { parsePeriod, periodRange } from "@/server/validation/period";
import { parseSport } from "@/server/validation/sport";

export const metadata: Metadata = { title: "Person" };

/** The tiles each sport shows of a period (plan §3.14, §3.16). */
const TILES: Record<TrainingSport, readonly ActivityMetric[]> = {
  workout: ["workouts", "working_sets", "volume"],
  run: ["runs", "distance", "time", "best_pace"],
  // Participation, and nothing that claims a performance: a shared ride does not say how
  // fast it was, because indoors, outdoors and assisted are not one another (SOCIAL-01).
  cycle: ["sessions", "active_days", "time", "distance"],
  swim: ["sessions", "active_days", "time", "distance"],
};

/**
 * A person as others see them (plan §3.14): the header card with the follow button in place
 * of Edit, or "This is you" on your own. Below it their training, if you may see it — the
 * period's totals for the chosen sport and, for lifting, the shape of their split and their
 * records — or one line saying why not. Your own page shows exactly what a follower would
 * see, and says so: the privacy screen's promise, demonstrated.
 */
export default async function PersonPage(props: PageProps<"/u/[username]">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const sport = parseSport(params.sport);
  const period = parsePeriod(params.period);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  // The period ends on the viewer's today: it is the viewer asking "what did they do lately".
  const range = periodRange(period, viewer.timeZone);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const person = await getDirectoryProfile(tx, handle);
      if (!person) return null;
      const self = person.id === user.id;
      const [relation, visible] = await Promise.all([
        self ? null : followState(tx, user.id, person),
        // The same function the policies run: what it says is what the rows will say.
        self ? true : canViewTraining(tx, person.id),
      ]);
      if (!visible) return { person, relation, training: null };
      const lifting = sport === "workout";
      const [totals, muscleSets, records] = await Promise.all([
        readPeriodTotals(tx, [person.id], sport, range),
        lifting ? readMuscleSets(tx, person.id, range) : {},
        lifting ? readRecords(tx, person.id, range) : null,
      ]);
      return {
        person,
        relation,
        training: {
          totals: totals.get(person.id) ?? EMPTY_TOTALS,
          split: muscleSplit(muscleSets),
          trained: Object.keys(muscleSets).length > 0,
          records,
        },
      };
    },
    { readOnly: true },
  );
  if (!found) notFound();
  const { person, relation, training } = found;
  const name = person.displayName || person.username;

  return (
    <>
      {/* Your own page is opened from your Profile card; anyone else's from Friends. */}
      <PageHeader title={name} backHref={relation ? "/profile/friends" : "/profile"} />
      <PageContent>
        <PersonCard person={person} counts={person}>
          {relation ? (
            <FollowButton
              personId={person.id}
              username={person.username}
              relation={relation}
              size="md"
              className="[&>button]:w-full"
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">This is you.</p>
              <LinkButton href="/profile/edit" variant="secondary" size="sm">
                Edit profile
              </LinkButton>
            </div>
          )}
        </PersonCard>

        {training ? (
          <>
            {!relation && (
              <p className="px-1 text-sm text-ink-muted">
                This is what a follower sees of your training. Change it under Profile › Privacy.
              </p>
            )}
            <SportPeriodControls sport={sport} period={period} />
            <Card>
              {/* Three lifting tiles share the row; four running tiles pair up under 440px. */}
              <StatTileRow className={sport === "workout" ? "min-[440px]:grid-cols-3" : undefined}>
                {TILES[sport].map((metric) => {
                  const value = activityValue(training.totals, metric);
                  return (
                    <StatTile
                      key={metric}
                      label={ACTIVITY_METRIC_LABELS[metric]}
                      value={value === null ? "—" : formatActivityMetric(metric, value, unit)}
                      info={
                        metric === "best_pace"
                          ? "The fastest average pace over a run of at least 1 km in the period."
                          : undefined
                      }
                    />
                  );
                })}
              </StatTileRow>
            </Card>
            {training.trained && (
              <Card>
                <RadarChart
                  title="Muscle split"
                  axes={SPLIT_GROUPS}
                  series={[
                    {
                      name,
                      // Lifting is always series 1, as on `Chart`; named here because a
                      // client module's exports do not cross into a server component.
                      color: "var(--color-series-1)",
                      values: SPLIT_GROUPS.map((group) => training.split[group]),
                    },
                  ]}
                />
              </Card>
            )}
            {training.records && (
              <Section
                title="Records"
                info="The best of each movement in the period, by what it is measured in: estimated 1RM for barbell and dumbbell lifts, most reps, longest hold or longest carry for the rest. Machine exercises are not listed, since a machine's numbers are its own."
              >
                <Card>
                  {training.records.length > 0 ? (
                    <PeriodRecordsList records={training.records} unit={unit} />
                  ) : (
                    <p className="text-sm text-ink-muted">
                      No comparable lifts in the last {PERIOD_LABELS[period]}.
                    </p>
                  )}
                </Card>
              </Section>
            )}
            {relation && (
              // Keep the same sport and period when opening the comparison.
              <LinkButton
                href={`/u/${person.username}/compare?sport=${sport}&period=${period}`}
                className="w-full"
              >
                Compare
              </LinkButton>
            )}
          </>
        ) : (
          <p className="flex items-center gap-1 px-1 text-sm text-ink-muted">
            {hiddenTrainingLine({ them: person, relation: relation ?? { outgoing: null } })}
            <InfoTip label="About seeing someone's training">
              Their training appears here once they have accepted you as a follower and while they
              share it. With sharing off, the profile card is all a follower sees.
            </InfoTip>
          </p>
        )}
      </PageContent>
    </>
  );
}
