import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { GraphRangeProvider } from "@/components/graph/graph-range-context";
import { PersonCard } from "@/components/person-card";
import { PeriodRecordsList } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { SportSpanControls } from "@/components/ui/sport-span-controls";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_METRIC_LABELS, activityValue, type ActivityMetric } from "@/domain/leaderboard";
import { RANGE_PRESET_WORDS, readWindowOf } from "@/domain/graph-range";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { todayInTimeZone } from "@/domain/program-calendar";
import { sportsOnOffer, type TrainingSport } from "@/domain/sport-scope";
import { setLengthFor } from "@/lib/distance-units";
import { formatActivityMetric } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { rememberedRange } from "@/server/queries/graph-range";
import { hiddenTrainingLine } from "@/server/queries/head-to-head";
import { readProfile } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";
import { followState } from "@/server/repositories/follows";
import { getDirectoryProfile } from "@/server/repositories/people";
import {
  canViewTraining,
  EMPTY_TOTALS,
  readDistanceUnits,
  readGroupSets,
  readPeriodTotals,
  readRecords,
  readSharedSports,
} from "@/server/repositories/shared-stats";
import { requireUsername } from "@/server/validation/params";
import { socialWindow } from "@/server/validation/period";
import { askedSport } from "@/server/validation/sport";

export const metadata: Metadata = { title: "Person" };

/** The tiles each sport shows of a span (plan §3.14, §3.16). */
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
 * of Edit, or Edit profile on your own. Below it their training, if you may see it — the
 * span's totals for the chosen sport and, for lifting, the shape of their split and their best
 * lifts in the span — or one line saying why not. Your own page shows what a follower sees
 * while you share, and says so: the privacy screen's promise, demonstrated. With sharing off it
 * says that a follower sees the card alone.
 */
export default async function PersonPage(props: PageProps<"/u/[username]">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const asked = askedSport(params.sport);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  // The span every graph shares (ADR 0044), from the viewer's calendar: it is the viewer asking
  // "what did they do lately". It runs to now, so a friend's session dated ahead of the viewer
  // still counts.
  const preset = await rememberedRange();
  const today = todayInTimeZone(viewer.timeZone);
  const read = readWindowOf({ preset }, today);
  const range = socialWindow(read.from, read.to, viewer.timeZone);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const person = await getDirectoryProfile(tx, handle);
      if (!person) return null;
      const self = person.id === user.id;
      const [relation, visible, sharing] = await Promise.all([
        self ? null : followState(tx, user.id, person),
        // The same function the policies run: what it says is what the rows will say.
        self ? true : canViewTraining(tx, person.id),
        // Your own switch, read here rather than from a profile cached on another device.
        self ? readProfile(tx, user.id).then((profile) => profile?.shareTraining ?? true) : true,
      ]);
      if (!visible) return { person, relation, sharing, training: null };
      // Their sports, as a follower can see them: a sport they do not share, or have never
      // done, has no tab (on your own page either, since a follower would not see it).
      const sports = sportsOnOffer(await readSharedSports(tx, [person.id]), asked);
      const sport = asked ?? sports[0]!;
      const lifting = sport === "workout";
      const [totals, groupSets, records, distanceUnits] = await Promise.all([
        readPeriodTotals(tx, [person.id], sport, range),
        lifting ? readGroupSets(tx, person.id, range) : {},
        lifting ? readRecords(tx, person.id, range) : null,
        lifting ? null : readDistanceUnits(tx, user.id),
      ]);
      return {
        person,
        relation,
        sharing,
        training: {
          sport,
          sports,
          totals: totals.get(person.id) ?? EMPTY_TOTALS,
          split: muscleSplit(groupSets),
          trained: Object.keys(groupSets).length > 0,
          records,
          // Distances read in the viewer's own unit for the sport, as their own do.
          distanceUnit: sport !== "workout" && distanceUnits ? distanceUnits[sport] : undefined,
        },
      };
    },
    { readOnly: true },
  );
  if (!found) notFound();
  const { person, relation, sharing, training } = found;
  const name = person.displayName || person.username;

  return (
    <>
      {/* Your own page is opened from your Profile card; anyone else's from Friends. */}
      <PageHeader title={name} backHref={relation ? "/profile/friends" : "/profile"} />
      <PageContent>
        {/* The title names them; the card goes on from the handle. */}
        <PersonCard person={person} counts={person} named={false}>
          {relation ? (
            <FollowButton
              personId={person.id}
              username={person.username}
              relation={relation}
              size="md"
              className="[&>button]:w-full"
            />
          ) : (
            // Your own page says so by its action, where someone else's has Follow.
            <LinkButton href="/profile/edit" variant="secondary" size="md" className="w-full">
              Edit profile
            </LinkButton>
          )}
        </PersonCard>

        {training ? (
          <>
            {!relation && (
              // Where it is changed is a link, not directions to it.
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-ink-muted">
                <span className="min-w-0">
                  {sharing
                    ? "As your followers see it."
                    : "Sharing is off: followers see only your profile card."}
                </span>
                <Link
                  href="/profile/privacy"
                  className="tap-area font-bold text-ink underline underline-offset-2"
                >
                  Privacy
                </Link>
              </p>
            )}
            <GraphRangeProvider preset={preset}>
              <SportSpanControls sport={training.sport} sports={training.sports} />
            </GraphRangeProvider>
            <Card>
              {/* Three lifting tiles share the row; four running tiles pair up under 440px. */}
              <StatTileRow
                className={training.sport === "workout" ? "min-[440px]:grid-cols-3" : undefined}
              >
                {TILES[training.sport].map((metric) => {
                  const value = activityValue(training.totals, metric);
                  return (
                    <StatTile
                      key={metric}
                      label={ACTIVITY_METRIC_LABELS[metric]}
                      value={
                        value === null
                          ? "—"
                          : formatActivityMetric(metric, value, unit, training.distanceUnit)
                      }
                      info={
                        metric === "best_pace"
                          ? "The fastest average pace over a run of at least 1 km in the span."
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
                      // Lifting is always series 1; named here because a client module's
                      // exports do not cross into a server component.
                      color: "var(--color-series-1)",
                      values: SPLIT_GROUPS.map((group) => training.split[group]),
                    },
                  ]}
                />
              </Card>
            )}
            {training.records && (
              // The span's bests, as the plan built them (§3.13, as built), not records: a record
              // beats every earlier session, and Compare's "Records set" counts those. Called
              // "Records", a best below an older one read as a record Compare said was not set.
              <Section
                title="Best lifts"
                info="Each movement's best in the span: est. 1RM for barbells and dumbbells, else reps, hold or carry. Machine exercises are not listed."
              >
                <Card>
                  {training.records.length > 0 ? (
                    <PeriodRecordsList
                      records={training.records}
                      unit={unit}
                      length={setLengthFor(viewer)}
                      currentYear={today.slice(0, 4)}
                    />
                  ) : (
                    <p className="text-sm text-ink-muted">
                      {preset === "all"
                        ? "No comparable lifts yet."
                        : `No comparable lifts in ${RANGE_PRESET_WORDS[preset]}.`}
                    </p>
                  )}
                </Card>
              </Section>
            )}
            {relation && (
              // Keep the same sport when opening the comparison; the span is remembered anyway.
              <LinkButton
                href={`/u/${person.username}/compare?sport=${training.sport}`}
                className="w-full"
              >
                Compare
              </LinkButton>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            {hiddenTrainingLine({ them: person, relation: relation ?? { outgoing: null } })}
          </p>
        )}
      </PageContent>
    </>
  );
}
