import { describe, expect, it } from "vitest";

import {
  adherenceBySport,
  adherenceCounts,
  canLog,
  isOverdue,
  resolveOccurrence,
  splitByDate,
  type LinkedActivity,
  type Occurrence,
} from "./occurrences";

const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  id: "occ-1",
  sport: "swimming",
  disposition: "pending",
  scheduledOn: "2026-09-16",
  orderIndex: 0,
  programFamilyId: "family",
  originalWeekIndex: 2,
  originalScheduledOn: "2026-09-16",
  ...overrides,
});

const logged: LinkedActivity = { id: "activity-1", outcome: "logged", occurredOn: "2026-09-18" };

describe("what answers for an occurrence", () => {
  /** AT-SCHED-02: a Wednesday swim logged on Friday resolves Wednesday's occurrence. */
  it("is the linked activity, whatever date it was actually done on", () => {
    expect(resolveOccurrence(occurrence(), logged)).toEqual({
      kind: "logged",
      activityId: "activity-1",
      outcome: "logged",
      occurredOn: "2026-09-18",
    });
  });

  it("is the disposition when nothing was logged", () => {
    expect(resolveOccurrence(occurrence(), null)).toEqual({ kind: "incomplete" });
    expect(resolveOccurrence(occurrence({ disposition: "skipped" }), null)).toEqual({
      kind: "skipped",
    });
    expect(resolveOccurrence(occurrence({ disposition: "cancelled" }), null)).toEqual({
      kind: "cancelled",
    });
    expect(resolveOccurrence(occurrence({ disposition: "legacy_completed" }), null)).toEqual({
      kind: "legacy_completed",
    });
  });

  /** AT-SCHED-14: a migrated legacy completion cannot be logged again until it is reopened. */
  it("lets a pending or skipped occurrence be logged, and nothing else", () => {
    expect(canLog(occurrence(), null)).toBe(true);
    expect(canLog(occurrence({ disposition: "skipped" }), null)).toBe(true);
    expect(canLog(occurrence({ disposition: "cancelled" }), null)).toBe(false);
    expect(canLog(occurrence({ disposition: "legacy_completed" }), null)).toBe(false);
    // One actual per occurrence: an already-logged one is closed.
    expect(canLog(occurrence(), logged)).toBe(false);
  });

  /** SCHED-04: late is a fact about today, not a state anybody writes. */
  it("calls unfinished earlier work overdue without changing it", () => {
    const wednesday = occurrence({ scheduledOn: "2026-09-16" });
    expect(isOverdue(wednesday, { kind: "incomplete" }, "2026-09-18")).toBe(true);
    expect(isOverdue(wednesday, { kind: "incomplete" }, "2026-09-16")).toBe(false);
    expect(isOverdue(wednesday, { kind: "skipped" }, "2026-09-18")).toBe(false);
  });
});

describe("what is on a day", () => {
  it("splits standalone work into upcoming and earlier", () => {
    const { upcoming, earlier } = splitByDate(
      [
        occurrence({ id: "a", scheduledOn: "2026-09-20" }),
        occurrence({ id: "b", scheduledOn: "2026-09-18" }),
        occurrence({ id: "c", scheduledOn: "2026-09-10" }),
      ],
      "2026-09-18",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["b", "a"]);
    expect(earlier.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("adherence", () => {
  /** AT-STAT-06: counted per sport, so an unfinished run cannot fail a finished workout. */
  it("keeps each sport's record its own", () => {
    const entries = [
      {
        sport: "strength" as const,
        resolution: {
          kind: "logged" as const,
          activityId: "1",
          outcome: "logged" as const,
          occurredOn: "2026-09-17",
        },
      },
      { sport: "swimming" as const, resolution: { kind: "incomplete" as const } },
      { sport: "running" as const, resolution: { kind: "skipped" as const } },
      { sport: "running" as const, resolution: { kind: "cancelled" as const } },
      { sport: "running" as const, resolution: { kind: "legacy_completed" as const } },
    ];
    expect(adherenceBySport(entries).strength).toMatchObject({ logged: 1, incomplete: 0 });
    expect(adherenceBySport(entries).swimming).toMatchObject({ logged: 0, incomplete: 1 });
    expect(adherenceBySport(entries).running).toMatchObject({
      skipped: 1,
      cancelled: 1,
      legacyCompleted: 1,
    });
    // Cancelled work is reported apart: it is not an obligation anybody failed.
    expect(adherenceCounts(entries)).toEqual({
      logged: 1,
      skipped: 1,
      incomplete: 1,
      cancelled: 1,
      legacyCompleted: 1,
    });
  });
});
