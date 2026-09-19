import { describe, expect, it } from "vitest";

import { validateActual } from "./activity-metrics";
import {
  canonicalActivityId,
  legacyPlannedDate,
  legacyProgramRunToPrescription,
  legacyRunEvidenceId,
  legacyRunToActivity,
  type LegacyProgramRunRow,
  type LegacyRunRow,
} from "./legacy-multisport";
import { prescriptionTotals } from "./activity-prescription";

const run = (overrides: Partial<LegacyRunRow> = {}): LegacyRunRow => ({
  id: "6a5f1b12-0c62-4f0e-9a5a-6d4b1f2e3c44",
  userId: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
  mode: "outdoor",
  startedAt: new Date("2026-09-09T01:30:00Z"),
  durationSeconds: 1800,
  distanceMeters: 5000,
  rpe: 5,
  effortReported: false,
  surface: "Trail",
  notes: "Felt easy.",
  programRunId: null,
  workoutSessionId: null,
  gymId: null,
  ...overrides,
});

const planned = (overrides: Partial<LegacyProgramRunRow> = {}): LegacyProgramRunRow => ({
  id: "plan-1",
  programId: "program-1",
  weekIndex: 2,
  dayOfWeek: 3,
  durationMinMinutes: 25,
  durationMaxMinutes: 35,
  distanceMinKm: 4,
  distanceMaxKm: 5,
  rpeMin: 3,
  rpeMax: 5,
  paceNote: "Conversational.",
  progressionNote: "Add five minutes next week.",
  stopRule: "Stop if the shin complains.",
  comment: "Easy week.",
  ...overrides,
});

describe("a raw run as an activity", () => {
  it("keeps the instant, the metres and the notes exactly as they were", () => {
    const activity = legacyRunToActivity(run(), { timeZone: "Asia/Kolkata" });
    expect(activity.id).toBe(run().id);
    expect(activity.startedAt).toEqual(new Date("2026-09-09T01:30:00Z"));
    expect(activity.durationMs).toBe(1_800_000);
    expect(activity.details.distance.metres).toBe(5000);
    expect(activity.notes).toBe("Felt easy.");
    expect(activity.details.surface).toBe("Trail");
    expect(validateActual(activity.details)).toEqual([]);
  });

  /** TIME-01: the zone was never recorded, so it is labelled inferred rather than known. */
  it("marks the time zone as a migration-time snapshot and resolves the local date in it", () => {
    const activity = legacyRunToActivity(run(), { timeZone: "Asia/Kolkata" });
    expect(activity.timeZoneSource).toBe("legacy_profile_snapshot");
    // 01:30 UTC is already the 9th in Kolkata.
    expect(activity.occurredOn).toBe("2026-09-09");
    const western = legacyRunToActivity(run(), { timeZone: "America/Los_Angeles" });
    expect(western.occurredOn).toBe("2026-09-08");
  });

  /** AT-LOG-11: an unconfirmed rating is never promoted by a conversion. */
  it("carries the effort with its provenance", () => {
    expect(legacyRunToActivity(run(), { timeZone: "UTC" }).effort).toEqual({
      status: "legacy_unconfirmed",
      value: 5,
    });
    expect(legacyRunToActivity(run({ effortReported: true }), { timeZone: "UTC" }).effort).toEqual({
      status: "reported",
      value: 5,
    });
    expect(legacyRunToActivity(run({ rpe: null }), { timeZone: "UTC" }).effort).toEqual({
      status: "unknown",
      value: null,
    });
  });

  /** §10.2: a kilometre formatter is not evidence that kilometres were typed. */
  it("does not claim to know which unit the athlete originally entered", () => {
    expect(legacyRunToActivity(run(), { timeZone: "UTC" }).details.distance.unit).toBe("m");
  });

  it("keeps a zero-distance run rather than discarding it", () => {
    const activity = legacyRunToActivity(run({ distanceMeters: 0 }), { timeZone: "UTC" });
    expect(activity.details.distance.metres).toBe(0);
    // It is still not eligible for a pace, which was already undefined for it.
    expect(validateActual(activity.details)[0]?.field).toBe("distance");
  });
});

describe("a planned run as a prescription", () => {
  /** AT-STRUCT-09: four different instructions stay four different instructions. */
  it("keeps the ranges and every piece of running prose", () => {
    const prescription = legacyProgramRunToPrescription(planned());
    expect(prescription.structureSource).toBe("legacy_summary");
    expect(prescription.sessionTargets).toEqual({
      durationMs: [1_500_000, 2_100_000],
      distanceMetres: [4000, 5000],
      effort: [3, 5],
    });
    expect(prescription.running).toEqual({
      paceNote: "Conversational.",
      progressionNote: "Add five minutes next week.",
      symptomStopRule: "Stop if the shin complains.",
      note: "Easy week.",
    });
    // Nothing invented a set of intervals out of the prose.
    expect(prescription.nodes).toEqual([]);
    expect(prescriptionTotals(prescription).steps).toBe(0);
  });

  it("keeps the original row alongside the conversion", () => {
    const prescription = legacyProgramRunToPrescription(planned());
    expect(prescription.legacy).toMatchObject({ sourceVersion: "program_runs:v1" });
    expect(prescription.legacy?.payload).toEqual(planned());
  });

  it("leaves an absent distance absent rather than deriving one", () => {
    const prescription = legacyProgramRunToPrescription(
      planned({ distanceMinKm: null, distanceMaxKm: null }),
    );
    expect(prescription.sessionTargets.distanceMetres).toBeNull();
  });
});

describe("dates and identity", () => {
  it("places a planned week and weekday on a real date from the programme's start", () => {
    // A programme that began on Monday 7 September: week 2's Wednesday is the 16th.
    expect(legacyPlannedDate("2026-09-07", 2, 3)).toBe("2026-09-16");
    expect(legacyPlannedDate("2026-09-07", 1, 6)).toBe("2026-09-12");
    // A programme that began mid-week counts its weeks from that day, not from Monday.
    expect(legacyPlannedDate("2026-09-09", 1, 3)).toBe("2026-09-09");
    expect(legacyPlannedDate("2026-09-09", 1, 1)).toBe("2026-09-14");
  });

  /** §10.3: an id is kept where it is free, and minted deterministically where it is not. */
  it("keeps a source id unless it collides", () => {
    const id = "6a5f1b12-0c62-4f0e-9a5a-6d4b1f2e3c44";
    expect(canonicalActivityId({ kind: "runs", id, collides: false })).toEqual({
      id,
      minted: false,
    });
    const minted = canonicalActivityId({ kind: "runs", id, collides: true });
    expect(minted.minted).toBe(true);
    expect(minted.id).not.toBe(id);
  });

  it("writes legacy evidence identifiers in the form old reports already hold", () => {
    expect(legacyRunEvidenceId("abc")).toBe("run:abc");
  });
});
