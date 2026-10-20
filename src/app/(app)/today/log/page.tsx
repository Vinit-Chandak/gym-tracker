import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Art } from "@/components/art/art";
import { enduranceName } from "@/components/activities/endurance-line";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import { NavRow } from "@/components/ui/nav-row";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, isActivitySport, type ActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { occurrencesBetween } from "@/server/repositories/occurrences";
import { getSchedule, getTodayPlan } from "@/server/repositories/schedule";
import { enabledSportsFor, readSportUnits } from "@/server/repositories/sport-preferences";

import { liftingStartOption } from "../start-option";
import {
  EARLY_DAYS,
  inOrder,
  liftingCounts,
  liftingSub,
  MISSED_DAYS,
  parseLifting,
  standing,
} from "./log-choices";

export const metadata: Metadata = { title: "Log a session" };

const MARK = { strength: "strength", running: "run", cycling: "ride", swimming: "swim" } as const;

/** "Workout", "Run", "Ride", "Swim": what was done, as the buttons that start or log it say. */
function noun(sport: ActivitySport): string {
  return sport === "strength" ? "Workout" : enduranceName(sport);
}

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/**
 * Log (ADR 0058): anything Today's cards do not already offer, in three short steps. What was
 * done; which planned session it counts as, if any, from the last two weeks to the coming week,
 * or none; and when. The training date and the session it answers are separate questions, so a
 * long run missed on Saturday and done on Tuesday counts as Saturday's, logged on Tuesday.
 * Nothing is matched implicitly: the athlete names the session, or names none.
 */
export default async function LogPage(props: PageProps<"/today/log">) {
  const user = await requireUser();
  const search = await props.searchParams;
  const asked = single(search.sport);
  if (asked !== undefined && !isActivitySport(asked)) notFound();
  const sport = asked && isActivitySport(asked) ? asked : null;
  const counts = single(search.counts);
  if (
    counts !== undefined &&
    counts !== "unplanned" &&
    !z.uuid().safeParse(counts).success &&
    !parseLifting(counts)
  )
    notFound();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const sports = await enabledSportsFor(tx, user.id);
        if (sport === null) return { sports, sessions: [], plan: null, gyms: [], units: null };
        if (sport !== "strength") {
          const [sessions, units] = await Promise.all([
            occurrencesBetween(
              tx,
              user.id,
              addDays(today, -MISSED_DAYS),
              addDays(today, EARLY_DAYS + 1),
            ),
            readSportUnits(tx, user.id),
          ]);
          return {
            sports,
            sessions: sessions.filter((session) => session.sport === sport && session.loggable),
            plan: null,
            gyms: [],
            units,
          };
        }
        const [schedule, gyms] = await Promise.all([
          getSchedule(tx, user.id),
          listGyms(tx, user.id),
        ]);
        return {
          sports,
          sessions: [],
          plan: schedule
            ? {
                today: await getTodayPlan(tx, user.id, profile.timeZone, schedule),
                state: schedule.state,
              }
            : null,
          gyms: gyms.filter((gym) => gym.isActive),
          units: null,
        };
      },
      { readOnly: true },
    ),
  ]);

  // ---------- what was done ----------
  if (sport === null) {
    const offered = ACTIVITY_SPORTS.filter((item) => data.sports.includes(item));
    return (
      <>
        <PageHeader title="Log a session" backHref="/today" />
        <PageContent>
          <ul>
            {(offered.length > 0 ? offered : ACTIVITY_SPORTS).map((item) => (
              <NavRow
                key={item}
                href={`/today/log?sport=${item}` as Route}
                lead={<Art kind="mark" sport={MARK[item]} size={20} />}
                label={noun(item)}
              />
            ))}
          </ul>
        </PageContent>
      </>
    );
  }

  // ---------- which planned session it counts as ----------
  const lifting =
    sport === "strength" && data.plan?.today?.suggestion
      ? data.plan.today.cycleDays.flatMap(({ day, cycleIndex }) => {
          const option = liftingStartOption(data.plan!.state, cycleIndex, day.dayIndex);
          return option
            ? [
                {
                  key: liftingCounts({
                    programDayId: day.id,
                    dayIndex: day.dayIndex,
                    cycleIndex: option.cycleIndex,
                  }),
                  name: day.name,
                  next: day.id === data.plan!.today!.suggestedDay?.id,
                  label: option.label,
                  cycleIndex: option.cycleIndex,
                },
              ]
            : [];
        })
      : [];
  const sessions = inOrder(data.sessions, today);
  const planned = sport === "strength" ? lifting.length > 0 : sessions.length > 0;
  // With nothing planned to count it as, there is no question to ask: it is unplanned.
  const choice = counts ?? (planned ? undefined : "unplanned");
  const title = `Log a ${noun(sport).toLowerCase()}`;
  if (choice === undefined)
    return (
      <>
        <PageHeader title={title} meta="Counts as" backHref="/today/log" />
        <PageContent>
          <ul>
            {sport === "strength"
              ? [...lifting]
                  .sort((a, b) => Number(b.next) - Number(a.next))
                  .map((option) => (
                    <NavRow
                      key={option.key}
                      href={`/today/log?sport=strength&counts=${option.key}` as Route}
                      lead={<Art kind="mark" sport="strength" size={20} />}
                      label={holdHyphens(option.name)}
                      sub={liftingSub(option)}
                    />
                  ))
              : sessions.map((session) => (
                  <NavRow
                    key={session.id}
                    href={`/today/log?sport=${sport}&counts=${session.id}` as Route}
                    lead={<Art kind="mark" sport={MARK[sport]} size={20} />}
                    label={holdHyphens(session.prescription?.title ?? noun(sport))}
                    sub={joinFacts([
                      standing(session, today),
                      session.prescription &&
                        describePrescription(session.prescription, data.units!),
                    ])}
                  />
                ))}
            <NavRow
              href={`/today/log?sport=${sport}&counts=unplanned` as Route}
              glyph="plus"
              label={`Unplanned ${noun(sport).toLowerCase()}`}
            />
          </ul>
        </PageContent>
      </>
    );

  // ---------- when ----------
  const back = (planned ? `/today/log?sport=${sport}` : "/today/log") as Route;
  if (sport !== "strength") {
    const session = sessions.find((entry) => entry.id === choice) ?? null;
    if (choice !== "unplanned" && !session) notFound();
    return (
      <>
        <PageHeader
          title={title}
          meta={
            session
              ? `Counts as ${session.prescription?.title ?? noun(sport)} · ${formatIsoDate(session.scheduledOn, today.slice(0, 4))}`
              : "Unplanned"
          }
          backHref={back}
        />
        <PageContent>
          <form action="/training/new" className="space-y-4">
            <input type="hidden" name="sport" value={sport} />
            {session && <input type="hidden" name="occurrence" value={session.id} />}
            <input type="hidden" name="from" value="today" />
            <Field
              label="When"
              hint={
                session && session.scheduledOn < today
                  ? `Planned for ${formatIsoDate(session.scheduledOn, today.slice(0, 4))}.`
                  : undefined
              }
            >
              <Input name="date" type="date" defaultValue={today} max={today} required />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              Continue
            </Button>
          </form>
        </PageContent>
      </>
    );
  }

  const day = choice === "unplanned" ? null : parseLifting(choice);
  const named = day ? lifting.find((option) => option.key === choice) : null;
  if (day && !named) notFound();
  const gymDefault = (data.gyms.find((gym) => gym.isDefault) ?? data.gyms[0])?.id;
  const dayFields = day && (
    <>
      <input type="hidden" name="day" value={day.programDayId} />
      <input type="hidden" name="index" value={day.dayIndex} />
      <input type="hidden" name="exactCycle" value={day.cycleIndex} />
    </>
  );
  const gymField = (id: string) => (
    <Field label="Gym">
      <Select id={id} name="gym" defaultValue={gymDefault}>
        {data.gyms.map((gym) => (
          <option key={gym.id} value={gym.id}>
            {gym.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <>
      <PageHeader
        title={title}
        meta={named ? `Counts as ${named.name}` : "Unplanned"}
        backHref={back}
      />
      <PageContent>
        {inProgress ? (
          // One unfinished workout at a time (Must survive): the open one is the way on.
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Finish or discard your open workout first.</p>
            <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
              Resume
            </LinkButton>
          </div>
        ) : data.gyms.length === 0 ? (
          <LinkButton href="/gyms/new" size="lg" className="w-full">
            Add your first gym
          </LinkButton>
        ) : (
          <div className="space-y-4">
            <form action="/workouts/start" className="space-y-4">
              {dayFields}
              {gymField("log-gym-now")}
              <Button type="submit" size="lg" className="w-full">
                Start workout
              </Button>
            </form>
            {/* Done already: its time is asked for, and it opens without a rest timer. */}
            <Disclosure summary="Done earlier" variant="inline">
              <form action="/workouts/start" className="space-y-4 pt-2">
                {dayFields}
                {gymField("log-gym-earlier")}
                <Field label="Date">
                  <Input name="date" type="date" defaultValue={today} max={today} required />
                </Field>
                <Field label="Started at">
                  <Input name="time" type="time" required />
                </Field>
                <Button type="submit" variant="secondary" size="lg" className="w-full">
                  Log this workout
                </Button>
              </form>
            </Disclosure>
          </div>
        )}
      </PageContent>
    </>
  );
}
