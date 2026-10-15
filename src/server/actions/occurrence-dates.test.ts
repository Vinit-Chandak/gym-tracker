import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { occurrenceEvents, plannedOccurrences, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { getOccurrence } from "@/server/repositories/occurrences";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  removeOccurrenceAction,
  rescheduleOccurrenceAction,
  scheduleActivityAction,
} from "./occurrences";

/**
 * Standalone sessions are scheduled for days to come, moved to days to come, and can be taken
 * off the calendar again (SCHED-08). A session put on a day that had gone by was accepted and
 * then shown nowhere, because nothing lists unlogged standalone work from earlier days.
 */

const ZONE = "Asia/Kolkata";
let t: TestDatabase;
let user: { id: string; email: string };

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("scheduling@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
  await t.db.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
});
afterEach(async () => {
  vi.clearAllMocks();
  await t.close();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function scheduled(): Promise<string[]> {
  const rows = await t.db
    .select({ id: plannedOccurrences.id })
    .from(plannedOccurrences)
    .where(eq(plannedOccurrences.userId, user.id));
  return rows.map((row) => row.id);
}

it("refuses a session on a day that has gone by, and says to log it instead", async () => {
  const yesterday = addDays(todayInTimeZone(ZONE), -1);
  const state = await scheduleActivityAction(
    {},
    form({ sport: "swimming", scheduledOn: yesterday }),
  );
  expect(state.fieldErrors?.scheduledOn).toMatch(/log it instead/);
  expect(state.values?.scheduledOn).toBe(yesterday);
  expect(await scheduled()).toEqual([]);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("schedules today and later, and moves only to today or later", async () => {
  const today = todayInTimeZone(ZONE);
  await scheduleActivityAction({}, form({ sport: "running", scheduledOn: today }));
  expect(mocks.redirect).toHaveBeenCalledWith("/training/scheduled");
  const [id] = await scheduled();

  const back = await rescheduleOccurrenceAction(id!, {}, form({ scheduledOn: addDays(today, -2) }));
  expect(back.fieldErrors?.scheduledOn).toMatch(/today or a later day/);
  const unmoved = await withUser(t.db, user.id, (tx) => getOccurrence(tx, user.id, id!));
  expect(unmoved?.scheduledOn).toBe(today);

  await rescheduleOccurrenceAction(id!, {}, form({ scheduledOn: addDays(today, 3) }));
  const moved = await withUser(t.db, user.id, (tx) => getOccurrence(tx, user.id, id!));
  expect(moved?.scheduledOn).toBe(addDays(today, 3));
});

it("takes a standalone session off the calendar, leaving its history", async () => {
  const today = todayInTimeZone(ZONE);
  await scheduleActivityAction({}, form({ sport: "cycling", scheduledOn: addDays(today, 1) }));
  const [id] = await scheduled();

  await removeOccurrenceAction(id!);
  expect(mocks.redirect).toHaveBeenLastCalledWith("/training/scheduled");
  const removed = await withUser(t.db, user.id, (tx) => getOccurrence(tx, user.id, id!));
  expect(removed?.resolution.kind).toBe("cancelled");
  expect(removed?.loggable).toBe(false);
  const events = await t.db
    .select({ kind: occurrenceEvents.kind, actor: occurrenceEvents.actor })
    .from(occurrenceEvents)
    .where(eq(occurrenceEvents.occurrenceId, id!));
  expect(events).toContainEqual({ kind: "cancelled", actor: "athlete" });
  // Removing it again is refused rather than written twice.
  expect(await removeOccurrenceAction(id!)).toMatchObject({ ok: false });
});
