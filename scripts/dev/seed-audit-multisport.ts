import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import { simplePrescription } from "@/domain/activity-prescription";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { createActivity } from "@/server/repositories/activities";
import { createTemplate } from "@/server/repositories/activity-templates";
import { setSportPreference } from "@/server/repositories/sport-preferences";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { diffOperationIds, diffPrograms } from "@/domain/program-diff";

export async function seedAuditMultisport(db: Db) {
  const people = await db.select().from(s.profiles);
  for (const person of people.filter((p) =>
    ["vinit", "shreyash", "priya", "alex"].includes(p.username),
  )) {
    await withUser(db, person.id, async (tx) => {
      const [already] = await tx
        .select()
        .from(s.activityTemplates)
        .where(
          and(
            eq(s.activityTemplates.userId, person.id),
            eq(s.activityTemplates.name, "Audit swim practice"),
          ),
        );
      if (already) return;
      for (const sport of ["strength", "running", "cycling", "swimming"] as const) {
        await setSportPreference(tx, person.id, sport, {
          enabled: person.username !== "shreyash" || sport === "strength" || sport === "running",
          distanceUnit: person.preferredUnit === "lb" ? "mi" : "km",
          poolUnit: person.preferredUnit === "lb" ? "yd" : "m",
          shareStats: person.username !== "alex",
        });
      }
      const today = todayInTimeZone(person.timeZone);
      const actuals: EnduranceActual[] = [
        {
          sport: "cycling",
          environment: "outdoor",
          durationMs: 4_200_000,
          distance: nativeDistance(25, person.preferredUnit === "lb" ? "mi" : "km"),
          assistance: "unassisted",
          resourceId: null,
          averagePowerWatts: 150,
          averageCadenceRpm: 85,
          averageHeartRate: 130,
          maxHeartRate: 155,
          elevationGainMetres: 180,
        },
        {
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
        },
        {
          sport: "swimming",
          environment: "pool",
          elapsedMs: 1_200_000,
          activeMs: 900_000,
          distanceMethod: "lengths",
          distance: null,
          poolLength: nativeDistance(25, person.preferredUnit === "lb" ? "yd" : "m"),
          lengths: 40,
          stroke: "freestyle",
          strokeCount: null,
          resourceId: null,
          averageHeartRate: null,
          maxHeartRate: null,
        },
        {
          sport: "swimming",
          environment: "open_water",
          elapsedMs: 1_800_000,
          activeMs: null,
          distanceMethod: "manual",
          distance: nativeDistance(1500, "m"),
          poolLength: null,
          lengths: null,
          stroke: "mixed",
          strokeCount: null,
          resourceId: null,
          averageHeartRate: null,
          maxHeartRate: null,
        },
      ];
      for (const [i, actual] of actuals.entries()) {
        const day = addDays(today, -i - 1);
        await createActivity(tx, person.id, {
          submissionKey: randomUUID(),
          origin: AD_HOC_ORIGIN,
          actual,
          startedAt: new Date(`${day}T08:00:00Z`),
          recordedTimeZone: person.timeZone,
          timeZoneSource: "profile_at_entry",
          occurredOn: day,
          effort: i === 1 ? UNKNOWN_EFFORT : reportedEffort(3),
          outcome: "logged",
          title: `Audit ${actual.sport} ${i + 1}`,
          notes: "Local audit fixture",
        });
      }
      for (const [index, sport] of (["running", "cycling", "swimming"] as const).entries()) {
        const prescription = simplePrescription(sport, {
          durationMs: [1_800_000, 1_800_000],
          effort: [2, 3],
        });
        const template = await createTemplate(tx, person.id, {
          sport,
          name: sport === "swimming" ? "Audit swim practice" : `Audit ${sport} practice`,
          prescription,
        });
        for (const offset of [0, 2, -3]) {
          const day = addDays(today, offset);
          const [occurrence] = await tx
            .insert(s.plannedOccurrences)
            .values({
              userId: person.id,
              sport,
              familyId: null,
              disposition: offset < 0 ? "skipped" : "pending",
              originalScheduledOn: day,
            })
            .returning();
          const [version] = await tx
            .insert(s.occurrenceVersions)
            .values({
              userId: person.id,
              occurrenceId: occurrence!.id,
              sport,
              scheduledOn: day,
              schedulingZone: person.timeZone,
              scheduledLocalTime: "18:00",
              orderIndex: index,
              prescription,
              templateRevisionId: template.revisionId,
            })
            .returning();
          await tx
            .update(s.plannedOccurrences)
            .set({ currentRevisionId: version!.id })
            .where(eq(s.plannedOccurrences.id, occurrence!.id));
        }
      }
      // The primary coaching gym covers the proposed programme; other gyms stay sparse so
      // unavailable-machine and substitute flows remain testable.
      if (person.username !== "alex") {
        const [gym] = await tx
          .select()
          .from(s.gyms)
          .where(and(eq(s.gyms.userId, person.id), eq(s.gyms.isDefault, true)));
        const types = await tx.select().from(s.equipmentTypes);
        const machines = await tx
          .select()
          .from(s.equipmentInstances)
          .where(eq(s.equipmentInstances.gymId, gym!.id));
        for (const type of types.filter((t) => !machines.some((m) => m.equipmentTypeId === t.id))) {
          await tx.insert(s.equipmentInstances).values({
            userId: person.id,
            gymId: gym!.id,
            equipmentTypeId: type.id,
            name: type.name,
            resistanceMode: type.defaultResistanceMode,
            unit: type.defaultUnit,
          });
        }
        await tx
          .delete(s.gymAbsentEquipmentTypes)
          .where(eq(s.gymAbsentEquipmentTypes.gymId, gym!.id));
      }
      // Source writes legitimately invalidate proposals. Bring these fixtures up to date only
      // during their first creation, never after a user has interacted with them.
      const drafts = await tx
        .select()
        .from(s.programDrafts)
        .where(and(eq(s.programDrafts.userId, person.id), eq(s.programDrafts.status, "ready")));
      for (const draft of drafts) {
        if (!draft.baseProgramId) continue;
        const base = await readProgramBlueprint(tx, person.id, draft.baseProgramId);
        const refs = [...diffOperationIds(diffPrograms(base!.blueprint, draft.blueprint))];
        await tx
          .update(s.coachProgramRequests)
          .set({ changeRefs: refs })
          .where(
            and(
              eq(s.coachProgramRequests.draftId, draft.id),
              eq(s.coachProgramRequests.state, "proposed"),
            ),
          );
        await tx
          .update(s.programDrafts)
          .set({ sourceRevision: await sourceRevision(tx, person.id) })
          .where(eq(s.programDrafts.id, draft.id));
      }
      const [program] = await tx
        .select()
        .from(s.programs)
        .where(and(eq(s.programs.userId, person.id), eq(s.programs.status, "active")));
      if (program) {
        const blueprint = await readProgramBlueprint(tx, person.id, program.id);
        await tx.insert(s.savedRoutines).values({
          userId: person.id,
          name: "Audit strength routine",
          day: blueprint!.blueprint.days[0]!,
        });
      }
    });
  }
}
