import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { PersonCard } from "@/components/person-card";
import { PeriodRecordsList } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { InfoTip } from "@/components/ui/info-tip";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { SportPeriodControls } from "@/components/ui/sport-period-controls";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { sportOfLegacy } from "@/domain/activity";
import { ACTIVITY_METRIC_LABELS, activityValue, type ActivityMetric } from "@/domain/leaderboard";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { PERIOD_LABELS } from "@/domain/period";
import { SPORT_LABELS, type TrainingSport } from "@/domain/sport-scope";
import { formatActivityMetric } from "@/lib/format";
import { SPORT_TONE } from "@/lib/sport-tone";
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

import { HiddenTraining } from "./hidden-training";

export const metadata: Metadata = { title: "Person" };

/**
 * What each sport shows of a period (plan §3.14, §3.16): the count that leads, then the
 * figures under it.
 */
const TILES: Record<TrainingSport, readonly [LeadMetric, ...ActivityMetric[]]> = {
  workout: ["workouts", "working_sets", "volume"],
  run: ["runs", "distance", "time", "best_pace"],
  // Participation, and nothing that claims a performance: a shared ride does not say how
  // fast it was, because indoors, outdoors and assisted are not one another (SOCIAL-01).
  cycle: ["sessions", "active_days", "time", "distance"],
  swim: ["sessions", "active_days", "time", "distance"],
};

/** The counts a sport's figures open with, and what one and several of them are called. */
type LeadMetric = "workouts" | "runs" | "sessions";
const LEAD_NOUN: Record<LeadMetric, readonly [string, string]> = {
  workouts: ["workout", "workouts"],
  runs: ["run", "runs"],
  sessions: ["session", "sessions"],
};

/**
 * A person as others see them (plan §3.14): who they are, with the follow button beside
 * them, or Edit profile on your own. Below it their training, if you may see it — the
 * period's figures for the chosen sport, filled with that sport's colour and leading to the
 * comparison, then for lifting the shape of their split and their records — or one line
 * saying why not. Your own page shows exactly what a follower would see, and says so: the
 * privacy screen's promise, demonstrated.
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
  const [lead, ...figures] = TILES[sport];
  const SportIcon = SPORT_ICON[sportOfLegacy(sport)];

  return (
    <>
      {/* Your own page is opened from your Profile card; anyone else's from Friends. */}
      <PageHeader
        title={name}
        backHref={relation ? "/profile/friends" : "/profile"}
        backLabel={relation ? "Friends" : undefined}
      />
      <PageContent>
        <PersonCard person={person} counts={person}>
          {relation ? (
            <FollowButton
              personId={person.id}
              username={person.username}
              relation={relation}
              className="flex flex-col items-end"
            />
          ) : (
            <LinkButton href="/profile/edit" variant="secondary" size="sm">
              Edit profile
            </LinkButton>
          )}
        </PersonCard>

        {training ? (
          <>
            {!relation && (
              <p className="flex items-center gap-1 px-1 text-sm text-ink-muted">
                This is your page as a follower sees it.
                <InfoTip label="About your page" className="-my-2">
                  Change what followers see of your training under Profile, then Privacy.
                </InfoTip>
              </p>
            )}
            <SportPeriodControls sport={sport} period={period} />

            {/* The period in the chosen sport's colour: the count leads, the rest under it. */}
            <HeroCard tone={SPORT_TONE[sportOfLegacy(sport)]}>
              <p className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink-muted">
                <SportIcon aria-hidden />
                {SPORT_LABELS[sport]}, last {PERIOD_LABELS[period]}
              </p>
              <p className="tabular-nums">
                <span className="font-display text-display-xl">
                  {activityValue(training.totals, lead) ?? 0}
                </span>{" "}
                <span className="text-headline font-semibold">
                  {LEAD_NOUN[lead][activityValue(training.totals, lead) === 1 ? 0 : 1]}
                </span>
              </p>
              <StatTileRow
                className={
                  figures.length === 2 ? "@min-[27rem]:grid-cols-2" : "@min-[27rem]:grid-cols-3"
                }
              >
                {figures.map((metric) => {
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
              {relation && (
                // Keep the same sport and period when opening the comparison.
                <LinkButton
                  href={`/u/${person.username}/compare?sport=${sport}&period=${period}`}
                  size="lg"
                  className="w-full"
                >
                  Compare
                </LinkButton>
              )}
            </HeroCard>

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
          </>
        ) : (
          <HiddenTraining
            line={hiddenTrainingLine({ them: person, relation: relation ?? { outgoing: null } })}
          />
        )}
      </PageContent>
    </>
  );
}
