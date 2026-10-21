import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { programDays } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { FIXTURE_START_DATE, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { WeekSession } from "@/domain/plan-week";
import { addDays } from "@/domain/program-calendar";
import { pickUpFromToday } from "@/domain/schedule";
import { resetReferenceCache } from "@/server/queries/reference";

import { planWeek } from "./plan-week";
import { getSchedule, PICKED_UP_FROM_TODAY, recordSlotEvent, skipSlotPart } from "./schedule";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterAll(async () => {
  await t.close();
});

const MONDAY = "2026-10-19";
const TODAY = "2026-10-20";

/**
 * An athlete on the seeded programme, a day a slot from Tuesday 8 September, who trained its
 * first cycle, each day on its own date, and nothing since.
 */
async function trainedFirstCycle(email: string) {
  const user = await t.createAuthUser(email);
  const { programId } = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  const days = await t.db
    .select({ id: programDays.id, dayIndex: programDays.dayIndex, name: programDays.name })
    .from(programDays)
    .where(eq(programDays.programId, programId));
  await withUser(t.db, user.id, async (tx) => {
    for (const day of days)
      await recordSlotEvent(
        tx,
        user.id,
        programId,
        { cycleIndex: 1, dayIndex: day.dayIndex },
        "session",
        "completed",
        { occurredOn: addDays(FIXTURE_START_DATE, day.dayIndex - 1) },
      );
  });
  const week = (monday: string) =>
    withUser(t.db, user.id, async (tx) =>
      (await planWeek(tx, user.id, monday, TODAY))
        .filter((session: WeekSession) => session.sport === "strength")
        .map(({ key, date, title, status, dayId }) => [key, date, title, status, dayId]),
    );
  return { user, days, week };
}

/**
 * The audit's Tuesday (IA audit M5): the athlete is weeks behind, so the day Today offers is an
 * earlier cycle's Lower A while the calendar has this cycle's Lower A on the same date. Plan's
 * week draws Lower A once, on today, and the days after it on the programme's next training
 * dates, each opening its own day's page.
 */
it("draws each lifting day once, where the sequence will reach it, with its day to open", async () => {
  const { days, week } = await trainedFirstCycle("plan-week@example.test");
  const id = (name: string) => days.find((day) => day.name === name)?.id;
  expect(await week(MONDAY)).toEqual([
    ["lift:2:1", TODAY, "Lower A", "today", id("Lower A")],
    ["lift:2:2", "2026-10-21", "Upper A", "planned", id("Upper A")],
    ["lift:2:3", "2026-10-22", "Easy Run + Arms", "planned", id("Easy Run + Arms")],
    ["lift:2:4", "2026-10-23", "Lower B", "planned", id("Lower B")],
    ["lift:2:5", "2026-10-24", "Upper B", "planned", id("Upper B")],
    ["lift:2:6", "2026-10-25", "Easy Run + Light Upper", "planned", id("Easy Run + Light Upper")],
  ]);
});

/**
 * Five weeks behind, the athlete skips Monday's day themselves, then picks up from today. Each
 * day the pick-up skipped stands where it was due, so none of them piles onto today; the day
 * the athlete skipped stays on the day they skipped it.
 */
it("stands the days Pick up from today skipped where they were due, the athlete's skip on its day", async () => {
  const { user, days, week } = await trainedFirstCycle("plan-week-pick-up@example.test");
  await withUser(t.db, user.id, async (tx) => {
    const { program } = (await getSchedule(tx, user.id))!;
    await skipSlotPart(tx, user.id, program, { cycleIndex: 2, dayIndex: 1 }, "session", {
      occurredOn: MONDAY,
      note: "Travelling",
    });
  });
  // As the action writes it: each training day skipped today, each rest day passed on its date.
  const skipped = await withUser(t.db, user.id, async (tx) => {
    const { program, state } = (await getSchedule(tx, user.id))!;
    const { skip, rest } = pickUpFromToday(state, program.startDate!, TODAY);
    for (const { ref, part } of skip)
      await skipSlotPart(tx, user.id, program, ref, part, {
        occurredOn: TODAY,
        note: PICKED_UP_FROM_TODAY,
      });
    for (const { ref, date } of rest)
      await recordSlotEvent(tx, user.id, program.id, ref, "session", "completed", {
        occurredOn: date,
        note: "Rest day passed",
      });
    return skip.map(({ ref }) => ref);
  });
  expect(skipped).toHaveLength(29);
  const schedule = await withUser(t.db, user.id, (tx) => getSchedule(tx, user.id));
  expect(schedule?.pickedUp).toHaveLength(29);
  expect(schedule?.pickedUp).not.toContainEqual({ cycleIndex: 2, dayIndex: 1 });

  const id = (name: string) => days.find((day) => day.name === name)?.id;
  expect(await week(MONDAY)).toEqual([
    ["lift:2:1", MONDAY, "Lower A", "skipped", id("Lower A")],
    ["lift:7:1", TODAY, "Lower A", "today", id("Lower A")],
    ["lift:7:2", "2026-10-21", "Upper A", "planned", id("Upper A")],
    ["lift:7:3", "2026-10-22", "Easy Run + Arms", "planned", id("Easy Run + Arms")],
    ["lift:7:4", "2026-10-23", "Lower B", "planned", id("Lower B")],
    ["lift:7:5", "2026-10-24", "Upper B", "planned", id("Upper B")],
    ["lift:7:6", "2026-10-25", "Easy Run + Light Upper", "planned", id("Easy Run + Light Upper")],
  ]);
  // Last week holds its own six, each on the day it was due.
  expect((await week("2026-10-12")).map(([key, date, , status]) => [key, date, status])).toEqual([
    ["lift:6:1", "2026-10-13", "skipped"],
    ["lift:6:2", "2026-10-14", "skipped"],
    ["lift:6:3", "2026-10-15", "skipped"],
    ["lift:6:4", "2026-10-16", "skipped"],
    ["lift:6:5", "2026-10-17", "skipped"],
    ["lift:6:6", "2026-10-18", "skipped"],
  ]);
});
