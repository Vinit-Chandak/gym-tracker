import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { createActivity } from "@/server/repositories/activities";

const VERSION = "history-56-months-boundaries-v1";
const idFor = (key: string) => {
  const hex = createHash("sha256").update(`${VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** Standalone recovery, every resource kind, archived references and explicitly zero distance. */
export async function seedAuditBoundaries(
  db: Db,
  window: { from: string; through: string; months: number },
) {
  let addedAccounts = 0;
  const people = (await db.select().from(s.profiles)).filter((person) =>
    ["vinit", "shreyash", "priya", "alex"].includes(person.username),
  );
  for (const person of people) {
    const marker = `${VERSION}:${person.id}`;
    const existing = await db.execute(
      sql`select 1 from auth.local_audit_seed_state where name = ${marker}`,
    );
    if ((Array.isArray(existing) ? existing : (existing as { rows: unknown[] }).rows).length)
      continue;
    await withUser(db, person.id, async (tx) => {
      const readings: (typeof s.dailyRecovery.$inferInsert)[] = [];
      const start = new Date(window.from);
      for (let month = 0; month < window.months; month++) {
        const finalDay = Number(window.through.slice(-2));
        const days = month === window.months - 1 && finalDay < 3 ? [finalDay] : [3, 9, 15, 21, 27];
        for (const day of days) {
          const measuredOn = new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, day),
          )
            .toISOString()
            .slice(0, 10);
          if (measuredOn > window.through) continue;
          readings.push({
            id: idFor(`${person.id}:recovery:${measuredOn}`),
            userId: person.id,
            date: measuredOn,
            sleepHours: day === 9 ? null : 6 + (month % 4) * 0.5,
            sleepQuality: day === 9 ? null : 3 + (month % 3),
            fatigue: day === 21 ? null : 1 + (month % 4),
            soreness: day === 9 ? null : 1 + (month % 3),
            notes: day === 3 ? "Rest day; recovery recorded without starting a workout." : null,
            createdAt: new Date(`${measuredOn}T06:00:00Z`),
            updatedAt: new Date(`${measuredOn}T06:00:00Z`),
          });
        }
      }
      await tx.insert(s.dailyRecovery).values(readings).onConflictDoNothing();
      const poolUnit = person.preferredUnit === "lb" ? "yd" : "m";
      const pool = nativeDistance(25, poolUnit);
      const resourceIds = Object.fromEntries(
        ["pool", "bike", "trainer", "venue"].map((kind) => [kind, idFor(`${person.id}:${kind}`)]),
      );
      const archivedPoolId = idFor(`${person.id}:archived-pool`);
      await tx
        .insert(s.activityResources)
        .values([
          {
            id: resourceIds.pool,
            userId: person.id,
            kind: "pool",
            name: "Community pool — early morning lane swimming",
            poolLengthNative: 25,
            poolLengthUnit: poolUnit,
            poolLengthMetres: pool.metres,
            isDefault: true,
          },
          {
            id: resourceIds.bike,
            userId: person.id,
            kind: "bike",
            name: "Weekend road bike with endurance tyres",
            isDefault: true,
          },
          {
            id: resourceIds.trainer,
            userId: person.id,
            kind: "trainer",
            name: "Indoor trainer — resistance without distance",
            isDefault: true,
          },
          {
            id: resourceIds.venue,
            userId: person.id,
            kind: "venue",
            name: "Lakeside swimming venue with a long name for narrow mobile screens",
          },
          {
            id: archivedPoolId,
            userId: person.id,
            kind: "pool",
            name: "Previous neighbourhood pool (archived)",
            poolLengthNative: 25,
            poolLengthUnit: poolUnit,
            poolLengthMetres: pool.metres,
          },
        ])
        .onConflictDoNothing();
      const actuals: EnduranceActual[] = [
        {
          sport: "cycling",
          environment: "indoor",
          durationMs: 15 * 60_000,
          distance: nativeDistance(0, person.preferredUnit === "lb" ? "mi" : "km"),
          assistance: "unknown",
          resourceId: resourceIds.trainer!,
          averagePowerWatts: null,
          averageCadenceRpm: null,
          averageHeartRate: null,
          maxHeartRate: null,
          elevationGainMetres: null,
        },
        {
          sport: "swimming",
          environment: "pool",
          elapsedMs: 30 * 60_000,
          activeMs: null,
          distanceMethod: "lengths",
          distance: null,
          poolLength: pool,
          lengths: 40,
          stroke: "mixed",
          strokeCount: null,
          resourceId: archivedPoolId,
          averageHeartRate: null,
          maxHeartRate: null,
        },
      ];
      for (const [index, actual] of actuals.entries()) {
        const day = addDays(window.through, -index - 2);
        await createActivity(tx, person.id, {
          submissionKey: idFor(`${person.id}:activity:${index}`),
          origin: AD_HOC_ORIGIN,
          actual,
          startedAt: new Date(`${day}T12:00:00Z`),
          recordedTimeZone: person.timeZone,
          timeZoneSource: "profile_at_entry",
          occurredOn: day,
          effort: UNKNOWN_EFFORT,
          outcome: "logged",
          title: index
            ? "Swim at a pool that was later archived"
            : "Trainer session with zero recorded distance",
          notes: null,
        });
      }
      await tx
        .update(s.activityResources)
        .set({ archivedAt: new Date(`${window.through}T00:00:00Z`) })
        .where(eq(s.activityResources.id, archivedPoolId));
      // The two repeated local 01:30 times when New York leaves DST are different sessions.
      if (person.timeZone === "America/New_York")
        for (const timestamp of [
          "2024-03-10T04:30:00Z",
          "2024-11-03T05:30:00Z",
          "2024-11-03T06:30:00Z",
        ]) {
          const occurredOn = todayInTimeZone(person.timeZone, new Date(timestamp));
          if (occurredOn < window.from || occurredOn > window.through) continue;
          await createActivity(tx, person.id, {
            submissionKey: idFor(`${person.id}:${timestamp}`),
            origin: AD_HOC_ORIGIN,
            actual: {
              sport: "running",
              environment: "outdoor",
              distance: nativeDistance(1, "mi"),
              durationMs: 12 * 60_000,
              surface: null,
              elevationGainMetres: null,
              treadmillInclinePercent: null,
              averageHeartRate: null,
              maxHeartRate: null,
              cadenceStepsPerMinute: null,
            },
            startedAt: new Date(timestamp),
            recordedTimeZone: person.timeZone,
            timeZoneSource: "profile_at_entry",
            occurredOn,
            effort: UNKNOWN_EFFORT,
            outcome: "logged",
            title: "Short run near a daylight-saving boundary",
            notes: null,
          });
        }
    });
    await db.execute(
      sql`insert into auth.local_audit_seed_state (name, details) values (${marker}, '{}'::jsonb) on conflict do nothing`,
    );
    addedAccounts++;
  }
  return addedAccounts;
}
