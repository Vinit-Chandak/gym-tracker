import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { chooseRange, listWindowOf } from "@/domain/graph-range";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { readHistory } from "@/server/repositories/history";
import { unitsBySport } from "@/server/repositories/sport-preferences";
import { dateWindow } from "@/server/validation/date-range";
import {
  enduranceItem,
  historyClock,
  newestFirst,
  recoveryItem,
  runItem,
  workoutItem,
} from "./history-items";
import { HistoryView } from "./history-view";

export const metadata: Metadata = { title: "History" };

/**
 * Coming back to this section within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/**
 * History: every workout, run, ride, swim and recovery reading, newest first, ten to a page
 * (ADR 0044). It was a tab of its own until Food took its place (ADR 0034), then a section of
 * Progress; now Overview lists the latest ten under its month, and this page, one tap behind
 * them, holds every entry (ADR 0045). A list has no span: it reads back as far as it goes, or
 * over the dates chosen by hand behind the funnel.
 */
export default async function HistoryPage(props: PageProps<"/progress/history">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await getRequestProfile(user.id, user.email);
  // Dates in the URL, when they make a range; else everything there is, newest first.
  const today = todayInTimeZone(profile.timeZone);
  const date = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const { choice, error: rangeError } = chooseRange(
    "all",
    { from: date("from"), to: date("to") },
    today,
  );
  // Dates chosen by hand are read as chosen, not widened to a whole first week or month as a
  // graph's are: the list never holds a day before the From over it.
  const read = listWindowOf(choice, today);
  const range = dateWindow(read.from, read.to, profile.timeZone);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [training, gyms, units] = await Promise.all([
        readHistory(tx, user.id, range),
        listGyms(tx, user.id),
        unitsBySport(tx, user.id),
      ]);
      return { training, gyms, units };
    },
    { readOnly: true },
  );
  const clock = historyClock(profile.timeZone, data.units);
  const workouts = data.training.workouts.map((w) => workoutItem(w, clock));
  const runs = data.training.runs.map((r) => runItem(r, clock));
  const endurance = data.training.endurance.map((activity) => enduranceItem(activity, clock));
  const items = [
    ...workouts,
    ...runs,
    ...endurance,
    ...data.training.recovery.map(recoveryItem),
  ].sort(newestFirst);
  // A reader that stopped short of the range leaves the days before its oldest row incomplete:
  // the other kinds would run on alone. So the list stops after the last whole day, for every
  // kind, and says where; dates chosen behind the funnel read further back.
  const stops = [
    data.training.workoutsTruncated ? workouts.at(-1)?.day : undefined,
    data.training.runsTruncated ? runs.at(-1)?.day : undefined,
    data.training.enduranceTruncated ? endurance.at(-1)?.day : undefined,
  ].flatMap((day) => (day ? [day] : []));
  const partialDay = stops.sort().at(-1) ?? null;
  const listed = partialDay ? items.filter((item) => item.day > partialDay) : items;
  return (
    <HistoryView
      error={rangeError}
      today={today}
      // The dates the list covers: those chosen, else its first entry's day to today.
      range={choice.custom ?? { from: listed.at(-1)?.day ?? today, to: today }}
      items={listed}
      gyms={data.gyms.map((g) => ({ id: g.id, name: g.name }))}
      stopsAfter={listed.length < items.length ? (listed.at(-1)?.day ?? null) : null}
    />
  );
}
