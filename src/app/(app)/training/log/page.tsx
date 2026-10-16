import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, ACTIVITY_SPORT_LABELS, isActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { sessionsForLogDate } from "@/server/repositories/sport-programmes";
import { listGyms } from "@/server/repositories/gyms";
import { readSportUnits } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "Log training" };

export default async function LogTrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const date = search.date ?? today;
  if (typeof date !== "string" || !z.iso.date().safeParse(date).success || date > today) notFound();
  const sport = search.sport;
  if (sport !== undefined && (typeof sport !== "string" || !isActivitySport(sport))) notFound();
  const selectedSport = typeof sport === "string" && isActivitySport(sport) ? sport : null;
  const data = selectedSport
    ? await withUser(
        getDb(),
        user.id,
        async (tx) => ({
          sessions: await sessionsForLogDate(tx, user.id, selectedSport, date, today),
          gyms: selectedSport === "strength" ? await listGyms(tx, user.id) : [],
          units: await readSportUnits(tx, user.id),
        }),
        { readOnly: true },
      )
    : null;
  return (
    <>
      <PageHeader
        title={
          selectedSport
            ? `Log ${ACTIVITY_SPORT_LABELS[selectedSport].toLowerCase()}`
            : "Log training"
        }
        backHref="/training"
      />
      <PageContent>
        <form action="/training/log" className="space-y-3">
          {selectedSport && <input type="hidden" name="sport" value={selectedSport} />}
          <Field
            label="Training date"
            hint="Today or any earlier day. Scheduled sessions stay on their original date."
          >
            <Input name="date" type="date" defaultValue={date} max={today} required />
          </Field>
          <Button type="submit" variant="secondary">
            Show sessions
          </Button>
        </form>
        {!selectedSport ? (
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_SPORTS.map((item) => (
              <LinkButton
                key={item}
                href={`/training/log?sport=${item}&date=${date}`}
                variant="secondary"
              >
                {ACTIVITY_SPORT_LABELS[item]}
              </LinkButton>
            ))}
          </div>
        ) : (
          <>
            <section className="space-y-3" aria-labelledby="scheduled-log">
              <h2 id="scheduled-log" className="caption-head">
                Scheduled for {date === today ? "today" : date}
              </h2>
              {data!.sessions.endurance
                .filter((session) => session.loggable)
                .map((session) => (
                  <Card key={session.id}>
                    <h3 className="font-medium">
                      {session.prescription?.title ?? ACTIVITY_SPORT_LABELS[session.sport]}
                    </h3>
                    {session.prescription && (
                      <p className="text-sm text-ink-2">
                        {describePrescription(session.prescription, data!.units)}
                      </p>
                    )}
                    <p className="text-sm text-ink-2">
                      {session.familyId
                        ? "Counts toward this programme."
                        : "Scheduled by you, outside a programme."}
                    </p>
                    <LinkButton
                      href={
                        `/training/new?sport=${selectedSport}&date=${date}&occurrence=${session.id}` as Route
                      }
                    >
                      Log this session
                    </LinkButton>
                  </Card>
                ))}
              {data!.sessions.strength.map((session) => (
                <Card key={`${session.programDayId}:${session.cycleIndex}`}>
                  <h3 className="font-medium">
                    {session.name} · Cycle {session.cycleIndex}
                  </h3>
                  <p className="text-sm text-ink-2">Counts toward your lifting programme.</p>
                  <StrengthStart gyms={data!.gyms} date={date} day={session} />
                </Card>
              ))}
              {!data!.sessions.strength.length &&
                !data!.sessions.endurance.some((session) => session.loggable) && (
                  <p className="text-sm text-ink-2">
                    No outstanding sessions scheduled for this date.
                  </p>
                )}
            </section>
            <section className="space-y-3" aria-labelledby="standalone-log">
              <h2 id="standalone-log" className="caption-head">
                Log another session
              </h2>
              <p className="text-sm text-ink-2">
                An independent session. This will appear in your history and won’t complete a
                programme session.
              </p>
              {selectedSport === "strength" ? (
                <StrengthStart gyms={data!.gyms} date={date} />
              ) : (
                <LinkButton href={`/training/new?sport=${selectedSport}&date=${date}`}>
                  Log a session
                </LinkButton>
              )}
            </section>
          </>
        )}
      </PageContent>
    </>
  );
}

function StrengthStart({
  gyms,
  date,
  day,
}: {
  gyms: Awaited<ReturnType<typeof listGyms>>;
  date: string;
  day?: { programDayId: string; dayIndex: number; cycleIndex: number };
}) {
  const active = gyms.filter((gym) => gym.isActive);
  if (!active.length)
    return (
      <LinkButton href="/gyms/new" variant="secondary">
        Add a training location
      </LinkButton>
    );
  return (
    <form action="/workouts/start" className="space-y-3">
      <input type="hidden" name="origin" value="training" />
      <input type="hidden" name="date" value={date} />
      {day && (
        <>
          <input type="hidden" name="day" value={day.programDayId} />
          <input type="hidden" name="index" value={day.dayIndex} />
          <input type="hidden" name="exactCycle" value={day.cycleIndex} />
        </>
      )}
      <Field label="Location">
        <Select name="gym" defaultValue={(active.find((gym) => gym.isDefault) ?? active[0])!.id}>
          {active.map((gym) => (
            <option key={gym.id} value={gym.id}>
              {gym.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Started at" hint="Enter the time you actually trained.">
        <Input name="time" type="time" required />
      </Field>
      <Button type="submit">{day ? "Log this workout" : "Log a workout"}</Button>
    </form>
  );
}
