import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";

import { profiles, programSlotEvents, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { resetReferenceCache } from "@/server/queries/reference";

/**
 * Migration 0044, run as the file itself writes it: a finished session's slot is dated by the
 * day the session started in the athlete's time zone, however late it finished.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterEach(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0044_session_slots_dated_by_start.sql", "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    await t.client.exec(statement.trim());
  }
}

async function account(email: string, timeZone: string) {
  const user = await t.createAuthUser(email);
  const { programId, gymIdBySlug } = await seedTestUserData(t.db, user);
  await t.db.update(profiles).set({ timeZone }).where(eq(profiles.id, user.id));
  return { userId: user.id, programId, gymId: gymIdBySlug.get("anytime-fitness")! };
}

/** A finished session and the slot event finishing it wrote, dated as the old code dated it. */
async function finished(
  who: { userId: string; programId: string; gymId: string },
  dayIndex: number,
  session: { startedAt: string; completedAt: string },
  occurredOn: string,
): Promise<string> {
  const [row] = await t.db
    .insert(workoutSessions)
    .values({
      userId: who.userId,
      gymId: who.gymId,
      programId: who.programId,
      cycleIndex: 3,
      startedAt: new Date(session.startedAt),
      completedAt: new Date(session.completedAt),
    })
    .returning({ id: workoutSessions.id });
  const [event] = await t.db
    .insert(programSlotEvents)
    .values({
      userId: who.userId,
      programId: who.programId,
      cycleIndex: 3,
      dayIndex,
      part: "session",
      status: "completed",
      workoutSessionId: row!.id,
      occurredOn,
    })
    .returning({ id: programSlotEvents.id });
  return event!.id;
}

async function dateOf(eventId: string): Promise<string> {
  const [row] = await t.db
    .select({ occurredOn: programSlotEvents.occurredOn })
    .from(programSlotEvents)
    .where(eq(programSlotEvents.id, eventId));
  return row!.occurredOn;
}

it("moves a session finished after midnight back to the evening it was started", async () => {
  const athlete = await account("late@example.com", "Asia/Kolkata");
  // 23:55 on the 26th in Kolkata, finished at 00:40 on the 27th, recorded as the 27th.
  const late = await finished(
    athlete,
    3,
    { startedAt: "2026-09-26T18:25:00Z", completedAt: "2026-09-26T19:10:00Z" },
    "2026-09-27",
  );
  // An ordinary afternoon session is already right and stays as it is.
  const ordinary = await finished(
    athlete,
    2,
    { startedAt: "2026-09-25T11:00:00Z", completedAt: "2026-09-25T12:00:00Z" },
    "2026-09-25",
  );

  await runMigration();

  expect(await dateOf(late)).toBe("2026-09-26");
  expect(await dateOf(ordinary)).toBe("2026-09-25");
  // A second run finds nothing left to move.
  await runMigration();
  expect(await dateOf(late)).toBe("2026-09-26");
});

it("leaves a row alone when the athlete's time zone is not one Postgres knows", async () => {
  const athlete = await account("nowhere@example.com", "Not/AZone");
  const event = await finished(
    athlete,
    3,
    { startedAt: "2026-09-26T18:25:00Z", completedAt: "2026-09-26T19:10:00Z" },
    "2026-09-27",
  );

  await runMigration();

  expect(await dateOf(event)).toBe("2026-09-27");
});
