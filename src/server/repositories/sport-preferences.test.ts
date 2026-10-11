import { afterAll, beforeAll, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, UNKNOWN_EFFORT } from "@/domain/activity";
import type { EnduranceActual } from "@/domain/activity-metrics";
import { ensureProfile } from "@/server/queries/profile";

import { createActivity } from "./activities";
import { listSportSharingSwitches, setSportPreference } from "./sport-preferences";

let t: TestDatabase;
let user: { id: string; email: string };
let other: { id: string; email: string };

beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("switches@example.test");
  other = await t.createAuthUser("other-switches@example.test");
  for (const account of [user, other]) await ensureProfile(t.db, account);
});

afterAll(async () => {
  await t.close();
});

const ride: EnduranceActual = {
  sport: "cycling",
  environment: "indoor",
  durationMs: 1_800_000,
  distance: null,
  assistance: "unknown",
  resourceId: null,
  averagePowerWatts: null,
  averageCadenceRpm: null,
  averageHeartRate: null,
  maxHeartRate: null,
  elevationGainMetres: null,
};

const log = (userId: string, actual: EnduranceActual) =>
  withUser(t.db, userId, (tx) =>
    createActivity(tx, userId, {
      submissionKey: crypto.randomUUID(),
      origin: AD_HOC_ORIGIN,
      actual,
      startedAt: new Date("2026-09-22T06:00:00Z"),
      recordedTimeZone: "UTC",
      timeZoneSource: "profile_at_entry",
      occurredOn: "2026-09-22",
      effort: UNKNOWN_EFFORT,
      outcome: "logged",
      title: null,
      notes: null,
    }),
  );

const switches = (userId: string) =>
  withUser(t.db, userId, (tx) => listSportSharingSwitches(tx, userId), { readOnly: true });

it("offers a ride or swim switch for a sport done, shared, or logged, and none otherwise", async () => {
  // Neither sport on, shared or logged: nothing to share.
  expect(await switches(user.id)).toEqual({});

  // Cycling turned off with rides logged: the rides keep their switch, off until chosen.
  await log(user.id, ride);
  expect(await switches(user.id)).toEqual({ cycling: false });

  // Swimming on, with nothing logged yet: the switch is there for the first swim.
  await withUser(t.db, user.id, (tx) =>
    setSportPreference(tx, user.id, "swimming", { enabled: true }),
  );
  expect(await switches(user.id)).toEqual({ cycling: false, swimming: false });

  // Another athlete's rides give this one no switch.
  await log(other.id, ride);
  expect(await switches(user.id)).toEqual({ cycling: false, swimming: false });
  expect(await switches(other.id)).toEqual({ cycling: false });
});
