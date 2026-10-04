import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { UNPLANNED_SESSION } from "@/lib/labels";
import { startSessionAction, type StartRequest } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { lastSleepHours } from "@/server/repositories/recovery-history";
import { getSchedule } from "@/server/repositories/schedule";

import { CheckInForm } from "../check-in-form";

export const metadata: Metadata = { title: "Check-in" };

type Search = Record<string, string | string[] | undefined>;

const one = (value: Search[string]) => (typeof value === "string" ? value : undefined);
const whole = (value: Search[string]) => {
  const text = one(value);
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined;
};

/**
 * What Start asked for, as its address says it: ?gym= for an unplanned session, with ?day= and
 * ?index= (and ?cycle=, from Train another day) for a programme day. The action checks it again.
 */
function startRequest(search: Search): StartRequest | null {
  const gymId = one(search.gym);
  if (!gymId) return null;
  const programDayId = one(search.day);
  if (programDayId === undefined) return { kind: "unplanned", gymId };
  const dayIndex = whole(search.index);
  if (dayIndex === undefined) return null;
  return { kind: "planned", gymId, programDayId, dayIndex, fromCycleIndex: whole(search.cycle) };
}

const EMPTY = { sleepHours: "", sleepQuality: "", fatigue: "", soreness: "" };

/**
 * Before the workout (board Check-in), with no session yet: Save and start or Skip check-in
 * is what creates it, so going back from here leaves nothing behind (DESIGN.md, The session).
 * An open session is the one to go back to instead, as Start would have opened it.
 */
export default async function StartPage(props: PageProps<"/workouts/start">) {
  const user = await requireUser();
  const start = startRequest(await props.searchParams);
  if (!start) redirect("/today");
  const [open, { schedule, sleep }] = await Promise.all([
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const [schedule, sleep] = await Promise.all([
          start.kind === "planned" ? getSchedule(tx, user.id) : null,
          lastSleepHours(tx, user.id),
        ]);
        return { schedule, sleep };
      },
      { readOnly: true },
    ),
  ]);
  if (open) redirect(`/workouts/${open.id}`);
  const name =
    start.kind === "planned"
      ? schedule?.days.find((day) => day.id === start.programDayId)?.name
      : UNPLANNED_SESSION;
  if (!name) redirect("/today");

  return (
    <SessionPage
      title="How are you today?"
      meta={`Before ${name} · Optional`}
      back={{ href: "/today", label: "Today" }}
    >
      <CheckInForm
        action={startSessionAction.bind(null, start)}
        initial={EMPTY}
        mode="start"
        lastSleepHours={sleep}
      />
    </SessionPage>
  );
}
