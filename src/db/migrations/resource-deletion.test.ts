import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  activities,
  activityResources,
  cyclingActivityDetails,
  swimmingActivityDetails,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

it.each(["cycling", "swimming"] as const)(
  "deleting a %s resource preserves its activity, owner and historical snapshot",
  async (sport) => {
    const owner = await t.createAuthUser(`${sport}@resource.test`);
    const other = await t.createAuthUser(`other-${sport}@resource.test`);
    for (const user of [owner, other])
      await withUser(t.db, user.id, (tx) => ensureProfile(tx, user));
    const table = sport === "cycling" ? cyclingActivityDetails : swimmingActivityDetails;
    const { resourceId, activityId } = await withUser(t.db, owner.id, async (tx) => {
      const [resource] = await tx
        .insert(activityResources)
        .values({
          userId: owner.id,
          kind: sport === "cycling" ? "bike" : "pool",
          name: "Original resource",
        })
        .returning();
      const [activity] = await tx
        .insert(activities)
        .values({
          userId: owner.id,
          sport,
          status: "completed",
          outcome: "logged",
          startedAt: new Date("2026-09-25T06:00:00Z"),
          recordedTimeZone: "Asia/Kolkata",
          timeZoneSource: "entered",
          occurredOn: "2026-09-25",
          durationMs: 1800000,
          effortStatus: "unknown",
          sourceKind: "manual",
        })
        .returning();
      const common = {
        userId: owner.id,
        activityId: activity!.id,
        resourceId: resource!.id,
        resourceLabel: "Original resource",
      };
      if (sport === "cycling")
        await tx
          .insert(cyclingActivityDetails)
          .values({
            ...common,
            sport,
            environment: "outdoor",
            distanceMetres: 10000,
            distanceNativeValue: 10,
            distanceNativeUnit: "km",
          });
      else
        await tx
          .insert(swimmingActivityDetails)
          .values({
            ...common,
            sport,
            environment: "pool",
            poolLengthNative: 25,
            poolLengthUnit: "m",
            poolLengthMetres: 25,
            distanceMethod: "lengths",
            lengths: 40,
            distanceMetres: 1000,
            distanceNativeValue: 1000,
            distanceNativeUnit: "m",
          });
      return { resourceId: resource!.id, activityId: activity!.id };
    });
    const [before] = await t.db.select().from(table).where(eq(table.activityId, activityId));
    const [parent] = await t.db.select().from(activities).where(eq(activities.id, activityId));
    await withUser(t.db, other.id, (tx) =>
      tx.delete(activityResources).where(eq(activityResources.id, resourceId)),
    );
    expect(
      await t.db.select().from(activityResources).where(eq(activityResources.id, resourceId)),
    ).toHaveLength(1);
    await withUser(t.db, owner.id, (tx) =>
      tx.delete(activityResources).where(eq(activityResources.id, resourceId)),
    );
    expect(await t.db.select().from(table).where(eq(table.activityId, activityId))).toEqual([
      { ...before, resourceId: null },
    ]);
    expect(await t.db.select().from(activities).where(eq(activities.id, activityId))).toEqual([
      parent,
    ]);
  },
);

it("can reapply the constraint repair", async () => {
  await t.client.exec(await readFile("src/db/migrations/0039_resource_deletion.sql", "utf8"));
});
