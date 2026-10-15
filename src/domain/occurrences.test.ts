import { describe, expect, it } from "vitest";

import {
  adherenceBySport,
  adherenceCounts,
  canLog,
  isOverdue,
  programmeClosed,
  resolveOccurrence,
  outstanding,
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
    expect(canLog(occurrence(), null, "family")).toBe(true);
    expect(canLog(occurrence({ disposition: "skipped" }), null, "family")).toBe(true);
    expect(canLog(occurrence({ disposition: "cancelled" }), null, "family")).toBe(false);
    expect(canLog(occurrence({ disposition: "legacy_completed" }), null, "family")).toBe(false);
    // One actual per occurrence: an already-logged one is closed.
    expect(canLog(occurrence(), logged, "family")).toBe(false);
  });

  /**
   * ADR 0054: after a switch, the replaced programme's sessions keep what became of them and can
   * no longer be logged — Liam's old blocks kept a past-dated run pending, loggable by its URL.
   */
  it("closes a programme's sessions once the athlete's programme is another one, or none", () => {
    const replaced = occurrence({ programFamilyId: "old-block" });
    expect(programmeClosed(replaced, "new-block")).toBe(true);
    expect(canLog(replaced, null, "new-block")).toBe(false);
    expect(canLog({ ...replaced, disposition: "skipped" }, null, "new-block")).toBe(false);
    // Archived with nothing in its place: the programme ended, and its sessions with it.
    expect(programmeClosed(replaced, null)).toBe(true);
    expect(canLog(replaced, null, null)).toBe(false);
    // The athlete's own programme, through every revision and once it is finished, stays open.
    expect(programmeClosed(replaced, "old-block")).toBe(false);
    expect(canLog(replaced, null, "old-block")).toBe(true);
  });

  it("never closes standalone work, which belongs to no programme", () => {
    const own = occurrence({ programFamilyId: null });
    expect(programmeClosed(own, "new-block")).toBe(false);
    expect(programmeClosed(own, null)).toBe(false);
    expect(canLog(own, null, null)).toBe(true);
    expect(canLog({ ...own, disposition: "skipped" }, null, "new-block")).toBe(true);
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

  /** Within a day it keeps the order it was given: the time of day, then the written order. */
  it("keeps one day's sessions in the order they were handed over", () => {
    const { upcoming, earlier } = splitByDate(
      [
        occurrence({ id: "early-swim", scheduledOn: "2026-09-10" }),
        occurrence({ id: "late-swim", scheduledOn: "2026-09-10" }),
        occurrence({ id: "morning", scheduledOn: "2026-09-20" }),
        occurrence({ id: "evening", scheduledOn: "2026-09-20" }),
        occurrence({ id: "next", scheduledOn: "2026-09-21" }),
      ],
      "2026-09-18",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["morning", "evening", "next"]);
    expect(earlier.map((item) => item.id)).toEqual(["early-swim", "late-swim"]);
  });

  /** SCHED-08: "upcoming" counts what is owed, not what is on the calendar. */
  it("stops owing a session the moment it is logged, however it is dated", () => {
    const entries = [
      { id: "logged-today", resolution: resolveOccurrence(occurrence(), logged) },
      {
        id: "skipped",
        resolution: resolveOccurrence(occurrence({ disposition: "skipped" }), null),
      },
      {
        id: "cancelled",
        resolution: resolveOccurrence(occurrence({ disposition: "cancelled" }), null),
      },
      { id: "still-to-do", resolution: resolveOccurrence(occurrence(), null) },
    ];
    expect(outstanding(entries).map((entry) => entry.id)).toEqual(["still-to-do"]);
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
