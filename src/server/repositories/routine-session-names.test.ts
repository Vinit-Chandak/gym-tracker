import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { activities, programDays, savedRoutines, sharedSessionStats } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { sessionName } from "@/lib/labels";
import { parseDateRange } from "@/server/validation/date-range";

import { readLoggedOn } from "./activity-analytics";
import { readHistoryWorkouts } from "./history";
import { saveRoutine, startSavedRoutine } from "./manual-training";
import {
  discardSession,
  finishSession,
  getInProgressSession,
  getSessionDetail,
  listSessions,
  sessionNameParts,
  startAdHocSession,
  startPlannedSession,
} from "./sessions";
import { readWorkouts } from "./training-data";

/**
 * A workout started from a saved routine goes by the routine's name, as it was when Start was
 * pressed, on every screen of the athlete's own; a friend still reads "Workout" (ADR 0026).
 */

let t: TestDatabase;
let userId: string;
let gymId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  const user = await t.createAuthUser("routine-names@example.test");
  userId = user.id;
  const seeded = await withUser(t.db, userId, (tx) => seedTestUserData(tx, user));
  gymId = seeded.gymIdBySlug.get("anytime-fitness")!;
});
afterAll(async () => {
  await t.close();
});

const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, userId, work);

/** One exercise of the founder template's first day, saved as a routine under `name`. */
const routineNamed = (name: string) =>
  as((tx) =>
    saveRoutine(tx, userId, name, {
      ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
      exercises: [STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises[0]!],
    }),
  );

/** Every reader the athlete's screens name a workout from, as each one names it. */
async function namesOf(sessionId: string) {
  const [parent] = await as((tx) =>
    tx.select().from(activities).where(eq(activities.id, sessionId)),
  );
  const range = parseDateRange({ from: parent!.occurredOn, to: parent!.occurredOn }, "UTC");
  return as(async (tx) => {
    const detail = (await getSessionDetail(tx, userId, sessionId))!;
    const open = await getInProgressSession(tx, userId);
    const finished = (await listSessions(tx, userId)).find((s) => s.id === sessionId);
    const history = (await readHistoryWorkouts(tx, userId, range)).workouts.find(
      (w) => w.id === sessionId,
    );
    const logged = (await readLoggedOn(tx, userId, parent!.occurredOn)).find(
      (a) => a.sessionId === sessionId,
    );
    const day = (await readWorkouts(tx, userId, range, 0, 20, { onDays: true })).workouts.find(
      (w) => w.id === sessionId,
    );
    const parts = await sessionNameParts(tx, userId, sessionId);
    return {
      // The workout, its summary, the finish page and the logger.
      detail: sessionName(detail.day?.name, detail.title),
      // Today's open card and the session strip, while it is open.
      open: open?.id === sessionId ? sessionName(open.dayName, open.title) : null,
      listed: finished ? sessionName(finished.dayName, finished.title) : null,
      history: history ? sessionName(history.dayName, history.title) : null,
      // Today's finished box.
      logged: logged ? sessionName(logged.dayName, logged.title) : null,
      // A day of the calendar.
      day: day ? sessionName(day.day?.name, day.title) : null,
      // Add exercise's way back from a finished workout.
      parts: sessionName(parts.dayName, parts.title),
    };
  });
}

it("names a routine's workout after the routine wherever the athlete reads it", async () => {
  const routine = await routineNamed("Push day at the hotel gym, with the long band finisher");
  const { sessionId } = await as((tx) => startSavedRoutine(tx, userId, routine.id, gymId));
  const name = "Push day at the hotel gym, with the long band finisher";

  expect(await namesOf(sessionId)).toMatchObject({
    detail: name,
    open: name,
    listed: null,
    history: null,
    logged: null,
    day: name,
    parts: name,
  });

  // Renamed and then deleted while the workout is open, the routine takes nothing with it: the
  // workout keeps the name it was started under.
  await as((tx) =>
    tx.update(savedRoutines).set({ name: "Push B" }).where(eq(savedRoutines.id, routine.id)),
  );
  await as((tx) => tx.delete(savedRoutines).where(eq(savedRoutines.id, routine.id)));
  await as((tx) => finishSession(tx, userId, sessionId, { notes: null, bodyWeightKg: null }));

  expect(await namesOf(sessionId)).toEqual({
    detail: name,
    open: null,
    listed: name,
    history: name,
    logged: name,
    day: name,
    parts: name,
  });

  // A friend's copy is the day's name or "Workout": a routine's name is the athlete's own.
  const [shared] = await as((tx) =>
    tx
      .select({ title: sharedSessionStats.title })
      .from(sharedSessionStats)
      .where(
        and(eq(sharedSessionStats.userId, userId), eq(sharedSessionStats.sourceId, sessionId)),
      ),
  );
  expect(shared?.title).toBe("Workout");
});

it("keeps an ad hoc workout unplanned and a programme day's workout named for its day", async () => {
  const adHoc = await as((tx) => startAdHocSession(tx, userId, { gymId }));
  expect(await namesOf(adHoc.sessionId)).toMatchObject({
    detail: "Unplanned session",
    open: "Unplanned session",
    day: "Unplanned session",
  });
  await as((tx) => discardSession(tx, userId, adHoc.sessionId));

  const [upperA] = await as((tx) =>
    tx.select({ id: programDays.id }).from(programDays).where(eq(programDays.name, "Upper A")),
  );
  const planned = await as((tx) =>
    startPlannedSession(tx, userId, { gymId, programDayId: upperA!.id, cycleIndex: 1 }),
  );
  await as((tx) =>
    finishSession(tx, userId, planned.sessionId, { notes: null, bodyWeightKg: null }),
  );
  expect(await namesOf(planned.sessionId)).toEqual({
    detail: "Upper A",
    open: null,
    listed: "Upper A",
    history: "Upper A",
    logged: "Upper A",
    day: "Upper A",
    parts: "Upper A",
  });
  const [parent] = await as((tx) =>
    tx
      .select({ title: activities.title })
      .from(activities)
      .where(eq(activities.id, planned.sessionId)),
  );
  expect(parent?.title).toBeNull();
});
