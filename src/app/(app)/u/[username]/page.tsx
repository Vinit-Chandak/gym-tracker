import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/follow-button";
import { GraphRangeProvider } from "@/components/graph/graph-range-context";
import { PersonCard } from "@/components/person-card";
import { PeriodRecordsList } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
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
import type { TrainingSport } from "@/domain/sport-scope";
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
} from "@/server/repositories/shared-stats";
import { requireUsername } from "@/server/validation/params";
import { socialWindow } from "@/server/validation/period";
import { parseSport } from "@/server/validation/sport";

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
 * of Edit, or "This is you" on your own. Below it their training, if you may see it — the
 * span's totals for the chosen sport and, for lifting, the shape of their split and their best
 * lifts in the span — or one line saying why not. Your own page shows what a follower sees while you
 * share, and says so: the privacy screen's promise, demonstrated. With sharing off it says
 * that a follower sees the card alone.
 */
export default async function PersonPage(props: PageProps<"/u/[username]">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const sport = parseSport(params.sport);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  // The span every graph shares (ADR 0044), from the viewer's calendar: it is the viewer asking
  // "what did they do lately". It runs to now, so a friend's session dated ahead of the viewer
  // still counts.
  const preset = await rememberedRange();
  const read = readWindowOf({ preset }, todayInTimeZone(viewer.timeZone));
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
                {sharing
                  ? "This is what a follower sees of your training. Change it under Profile › Privacy."
                  : "Sharing is off: followers see only your profile card. Change it under Profile › Privacy."}
              </p>
            )}
            <GraphRangeProvider preset={preset}>
              <SportSpanControls sport={sport} />
            </GraphRangeProvider>
            <Card>
              {/* Three lifting tiles share the row; four running tiles pair up under 440px. */}
              <StatTileRow className={sport === "workout" ? "min-[440px]:grid-cols-3" : undefined}>
                {TILES[sport].map((metric) => {
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
                info="The best of each movement in the span, by what it is measured in: estimated 1RM for barbell and dumbbell lifts, most reps, longest hold or longest carry for the rest. A best in the span is a record only if it beat every earlier session; Records set on Compare counts those. Machine exercises are not listed, since a machine's numbers are its own."
              >
                <Card>
                  {training.records.length > 0 ? (
                    <PeriodRecordsList records={training.records} unit={unit} />
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
              <LinkButton href={`/u/${person.username}/compare?sport=${sport}`} className="w-full">
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
