import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { coachJobs, coachWeeklyReviews, programDrafts, programs } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { jobTargetSchema } from "@/domain/coaching-workflow";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { changeSummaryLine, summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";
import { readProgramBlueprint } from "@/server/repositories/programs";

import { loadProgrammeHistory } from "./history-loader";

let t: TestDatabase;
let userId: string;
let programId: string;
let name: string;
let current: ProgramBlueprint;
let changed: ProgramBlueprint;
const ids: Record<string, string> = {};

const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, userId, work);
const NOW = new Date("2026-10-11T12:00:00Z");

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  const user = await t.createAuthUser("history@example.com");
  userId = user.id;
  ({ programId } = await withUser(t.db, userId, (tx) => seedTestUserData(tx, user)));

  await as(async (tx) => {
    const read = await readProgramBlueprint(tx, userId, programId);
    current = read!.blueprint;
    name = current.name;
    // One more set of the first exercise: a change to the running programme.
    changed = {
      ...current,
      days: current.days.map((day, index) =>
        index === 0
          ? {
              ...day,
              exercises: day.exercises.map((exercise, position) =>
                position === 0 ? { ...exercise, sets: exercise.sets + 1 } : exercise,
              ),
            }
          : day,
      ),
    };
    const [active] = await tx
      .select({ familyId: programs.familyId })
      .from(programs)
      .where(eq(programs.id, programId));
    const version = async (slug: string, programName: string, familyId: string) => {
      const [row] = await tx
        .insert(programs)
        .values({ userId, familyId, slug, name: programName, status: "archived" })
        .returning({ id: programs.id });
      return row!.id;
    };
    const revised = await version("revised", name, active!.familyId);
    const startedOver = await version("again", name, crypto.randomUUID());
    const other = await version("ppl", "Push Pull Legs", crypto.randomUUID());

    const draft = async (
      key: string,
      values: Partial<typeof programDrafts.$inferInsert> & { closedAt: Date },
    ) => {
      const [row] = await tx
        .insert(programDrafts)
        .values({
          userId,
          source: "manual",
          status: "activated",
          blueprint: current,
          baseProgramId: programId,
          sourceRevision: 1,
          updatedAt: values.closedAt,
          ...values,
        })
        .returning({ id: programDrafts.id });
      ids[key] = row!.id;
      return row!.id;
    };
    await draft("revision", {
      blueprint: changed,
      activatedProgramId: revised,
      closedAt: new Date("2025-11-17T10:00:00Z"),
    });
    await draft("again", {
      activatedProgramId: startedOver,
      closedAt: new Date("2026-03-09T10:00:00Z"),
    });
    await draft("switch", {
      source: "ai",
      blueprint: { ...current, name: "Push Pull Legs" },
      activatedProgramId: other,
      closedAt: new Date("2026-06-01T10:00:00Z"),
    });
    const applied = await draft("applied", {
      source: "weekly",
      headline: "One more set of the first lift.",
      blueprint: changed,
      activatedProgramId: revised,
      closedAt: new Date("2026-09-14T10:00:00Z"),
    });
    await draft("declined", {
      source: "ai",
      status: "rejected",
      closedAs: "declined",
      blueprint: changed,
      closedAt: new Date("2026-09-21T10:00:00Z"),
    });

    const [job] = await tx
      .insert(coachJobs)
      .values({
        userId,
        kind: "review_program",
        trigger: "weekly",
        dedupeKey: `weekly:${crypto.randomUUID()}`,
        status: "succeeded",
        target: jobTargetSchema.parse({}),
      })
      .returning({ id: coachJobs.id });
    await tx.insert(coachWeeklyReviews).values({
      userId,
      jobId: job!.id,
      periodStart: new Date("2026-09-07T00:00:00Z"),
      periodEnd: new Date("2026-09-14T00:00:00Z"),
      outcome: "automatic",
      rationale: "One more set.",
      draftId: applied,
    });
  });
});

afterAll(async () => {
  await t?.close();
});

it("says what each change did, to which programme, and when", async () => {
  const { changes } = await as((tx) => loadProgrammeHistory(tx, userId, "Europe/London", NOW));
  const summary = changeSummaryLine(summariseProgramDiff(diffPrograms(current, changed)));
  expect(summary).not.toBe("No programme changes");

  expect(changes).toEqual([
    // A change the athlete turned down: what it would have done, to which programme, and no.
    {
      id: ids.declined,
      title: summary,
      subtitle: `${name} · Declined`,
      on: "Mon 21 Sept",
    },
    // Applied by the coach on its own, as its weekly review recorded.
    {
      id: ids.applied,
      title: "One more set of the first lift.",
      subtitle: `${name} · Applied by the coach`,
      on: "Mon 14 Sept",
    },
    // A new block of another programme says which, and what it took the place of.
    {
      id: ids.switch,
      title: "Started Push Pull Legs",
      subtitle: `In place of ${name} · Approved`,
      on: "Mon 1 Jun",
    },
    // The same programme again, as a block of its own.
    { id: ids.again, title: `New block of ${name}`, subtitle: "Your edit", on: "Mon 9 Mar" },
    // A change to the running programme, last year: what its difference comes to, and the year.
    {
      id: ids.revision,
      title: summary,
      subtitle: `${name} · Your edit`,
      on: "Mon 17 Nov 2025",
    },
  ]);
});
