import { and, desc, eq } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentTypes,
  gymAbsentEquipmentTypes,
  gyms,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import type { DbOrTx } from "@/db/types";
import {
  AD_HOC_ORIGIN,
  legacyEffort,
  type LogOrigin,
  type RunningEnvironment,
} from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { GymKind, LoadUnit, ResistanceMode } from "@/domain/types";
import { ensureProfile } from "@/server/queries/profile";
import { createActivity } from "@/server/repositories/activities";
import { createProgramFromBlueprint } from "@/server/repositories/programs";

/**
 * A populated account for tests: several gyms, one of them well equipped, and a copy of the
 * built-in programme template. The app itself seeds none of this — a real account builds it
 * through onboarding — so it lives here, where it can stay stable while the app changes.
 */
export const FIXTURE_START_DATE = "2026-09-08";

type FixtureGym = { slug: string; name: string; kind: GymKind; isDefault?: boolean };

export const FIXTURE_GYMS: readonly FixtureGym[] = [
  { slug: "anytime-fitness", name: "Anytime Fitness", kind: "gym", isDefault: true },
  { slug: "samsung-gym", name: "Samsung Gym", kind: "gym" },
  { slug: "society-gym", name: "Society Gym", kind: "gym" },
  { slug: "outdoor", name: "Outdoor", kind: "outdoor" },
  { slug: "home", name: "Home", kind: "home" },
];

type FixtureMachine = {
  name: string;
  equipmentTypeSlug: string;
  resistanceMode: ResistanceMode;
  unit?: LoadUnit;
  loadIncrement?: number;
};

/** The machines registered at the well-equipped gym. */
export const FIXTURE_EQUIPMENT: readonly FixtureMachine[] = [
  {
    name: "Smith machine",
    equipmentTypeSlug: "smith_machine",
    resistanceMode: "plate_loaded",
    loadIncrement: 2.5,
  },
  { name: "Cable station", equipmentTypeSlug: "cable_station", resistanceMode: "selectorized" },
  {
    name: "Assisted pull-up machine",
    equipmentTypeSlug: "assisted_pullup",
    resistanceMode: "selectorized",
  },
  { name: "Seated leg curl", equipmentTypeSlug: "leg_curl_seated", resistanceMode: "selectorized" },
  { name: "Pec deck", equipmentTypeSlug: "pec_deck", resistanceMode: "selectorized" },
  { name: "45° leg press", equipmentTypeSlug: "leg_press_45", resistanceMode: "plate_loaded" },
  {
    name: "Horizontal leg press",
    equipmentTypeSlug: "leg_press_horizontal",
    resistanceMode: "plate_loaded",
  },
];

/** Equipment the well-equipped gym is known not to have, so exercises can resolve as absent. */
export const FIXTURE_ABSENT_EQUIPMENT: readonly string[] = [
  "hip_thrust_machine",
  "calf_raise_machine",
];

export type FixtureResult = {
  gymIdBySlug: Map<string, string>;
  programId: string;
  /** False when the account was already populated, so callers can seed twice safely. */
  created: boolean;
};

export async function seedTestUserData(
  db: DbOrTx,
  user: { id: string; email?: string | null },
  options: { startDate?: string } = {},
): Promise<FixtureResult> {
  // The auth trigger has normally written the row already; this is the same fallback the app
  // itself uses for an account that predates it.
  await ensureProfile(db, { id: user.id, email: user.email ?? null });

  await db
    .insert(gyms)
    .values(
      FIXTURE_GYMS.map((gym) => ({
        userId: user.id,
        name: gym.name,
        slug: gym.slug,
        kind: gym.kind,
        isDefault: gym.isDefault === true,
      })),
    )
    .onConflictDoNothing({ target: [gyms.userId, gyms.slug] });
  const gymRows = await db
    .select({ id: gyms.id, slug: gyms.slug })
    .from(gyms)
    .where(eq(gyms.userId, user.id));
  const gymIdBySlug = new Map(gymRows.map((gym) => [gym.slug, gym.id]));
  const equippedGymId = gymIdBySlug.get("anytime-fitness");
  if (!equippedGymId) throw new Error("Fixture gym missing");

  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((type) => [type.slug, type.id]));
  const typeId = (slug: string): string => {
    const id = typeIdBySlug.get(slug);
    if (!id) throw new Error(`Fixture needs equipment type "${slug}"; seed reference data first.`);
    return id;
  };

  await db
    .insert(equipmentInstances)
    .values(
      FIXTURE_EQUIPMENT.map((machine) => ({
        userId: user.id,
        gymId: equippedGymId,
        equipmentTypeId: typeId(machine.equipmentTypeSlug),
        name: machine.name,
        resistanceMode: machine.resistanceMode,
        unit: machine.unit ?? ("kg" as const),
        loadIncrement: machine.loadIncrement ?? null,
      })),
    )
    .onConflictDoNothing({ target: [equipmentInstances.gymId, equipmentInstances.name] });
  await db
    .insert(gymAbsentEquipmentTypes)
    .values(
      FIXTURE_ABSENT_EQUIPMENT.map((slug) => ({
        userId: user.id,
        gymId: equippedGymId,
        equipmentTypeId: typeId(slug),
      })),
    )
    .onConflictDoNothing({
      target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
    });

  const [existing] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, user.id), eq(programs.status, "active")))
    .orderBy(desc(programs.version))
    .limit(1);
  if (existing) return { gymIdBySlug, programId: existing.id, created: false };

  const program = await createProgramFromBlueprint(db, user.id, STRENGTH_AESTHETICS_HYBRID_8WK, {
    startDate: options.startDate ?? FIXTURE_START_DATE,
  });
  return { gymIdBySlug, programId: program.id, created: true };
}

/**
 * A run, logged the way the app logs one.
 *
 * Fixtures used to insert straight into `runs`, which nothing has written to since the
 * multisport cutover. A test seeding a row no code path can produce proves only that a
 * reader nobody uses still reads it, which is how History, Progress and the coach all came
 * to be reading the wrong table with a green suite. This writes the canonical activity and
 * its running detail, and takes the old row's `rpe`/`effortReported` pair so a number
 * nobody confirmed stays unconfirmed rather than being promoted (LOG-03).
 */
export async function logTestRun(
  db: DbOrTx,
  userId: string,
  run: {
    startedAt: Date;
    durationSeconds: number;
    distanceMeters: number;
    /** Defaults to the local date of `startedAt` in `timeZone`. */
    occurredOn?: string;
    timeZone?: string;
    environment?: RunningEnvironment;
    rpe?: number | null;
    effortReported?: boolean;
    notes?: string | null;
    origin?: LogOrigin;
  },
): Promise<{ id: string }> {
  const timeZone = run.timeZone ?? "UTC";
  const { id } = await createActivity(db, userId, {
    submissionKey: crypto.randomUUID(),
    origin: run.origin ?? AD_HOC_ORIGIN,
    actual: {
      sport: "running",
      environment: run.environment ?? "outdoor",
      distance: nativeDistance(run.distanceMeters, "m"),
      durationMs: run.durationSeconds * 1000,
      surface: null,
      elevationGainMetres: null,
      treadmillInclinePercent: null,
      averageHeartRate: null,
      maxHeartRate: null,
      cadenceStepsPerMinute: null,
    },
    startedAt: run.startedAt,
    recordedTimeZone: timeZone,
    timeZoneSource: "profile_at_entry",
    occurredOn: run.occurredOn ?? todayInTimeZone(timeZone, run.startedAt),
    effort: legacyEffort(run.rpe ?? null, run.effortReported ?? false),
    outcome: "logged",
    title: null,
    notes: run.notes ?? null,
  });
  return { id };
}
