import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { coachJobs, programDrafts } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { simplePrescription } from "@/domain/activity-prescription";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { programBlueprintSchema } from "@/domain/program-blueprint";

/*
 * ADR 0063: Ask for changes on a first programme answers what the coach asked, each answer filed
 * beside its question as the intake's clarifications, and asks again. The draft closes with the
 * request, never before it: a request that cannot be made leaves it to start.
 */

const state = vi.hoisted(() => ({ db: null as unknown, user: { id: "", email: "" } }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => state.user,
  requireProfiledUser: async () => state.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  canRunCoachJobs: () => true,
  isCoachServiceConfigured: () => true,
}));

import { ensureProfile } from "@/server/queries/profile";
import { confirmIntake, latestIntake, saveIntake } from "@/server/repositories/coach-intakes";
import { saveManualDraft } from "@/server/repositories/program-drafts";

import { askForFirstProgrammeChangesAction } from "./coaching-workflow";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  state.db = t.db;
}, 90_000);
afterAll(async () => {
  await t?.close();
  vi.unstubAllEnvs();
});

const LONG_RUN = "Can the Sunday long run take up to 2 h 10 min?";

async function runnerWithDraft() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@first-changes.test`);
  state.user = user;
  await ensureProfile(t.db, user);
  return withUser(t.db, user.id, async (tx) => {
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        programmeSport: "running",
        goal: "Half marathon race on Fri 1 Jan 2027.",
        sessionsPerWeek: 3,
        clarifications: [{ question: LONG_RUN, answer: "Not sure yet." }],
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    const draft = await saveManualDraft(
      tx,
      user.id,
      programBlueprintSchema.parse({
        blueprintVersion: 1,
        sport: "running",
        slug: `half-${crypto.randomUUID()}`,
        name: "Half marathon",
        weeks: 1,
        notes: "",
        days: [],
        runs: [],
        enduranceSessions: [
          {
            lineageId: crypto.randomUUID(),
            name: "Easy run",
            weekIndex: 1,
            dayOffset: 1,
            scheduledLocalTime: null,
            prescription: simplePrescription("running", { durationMs: [1_800_000, 2_100_000] }),
          },
        ],
      }),
    );
    // As the coach left it: ready, with a question for the athlete.
    await tx
      .update(programDrafts)
      .set({ source: "ai", status: "ready", toConfirm: [LONG_RUN] })
      .where(eq(programDrafts.id, draft.id));
    return { user, draftId: draft.id };
  });
}

const draftRow = async (id: string) =>
  (await t.db.select().from(programDrafts).where(eq(programDrafts.id, id)))[0]!;

it("files each answer beside its question and asks for the programme again", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const { user, draftId } = await runnerWithDraft();
  const result = await askForFirstProgrammeChangesAction(draftId, "", crypto.randomUUID(), [
    { question: LONG_RUN, answer: "Up to 90 minutes." },
    // Not a question this draft asked: never filed as an answer to the coach.
    { question: "What else?", answer: "Anything." },
  ]);
  expect(result).toMatchObject({ ok: true });
  const intake = await withUser(t.db, user.id, (tx) => latestIntake(tx, user.id, "running"));
  expect(intake!.answers.clarifications).toEqual([
    { question: LONG_RUN, answer: "Up to 90 minutes." },
  ]);
  expect(await draftRow(draftId)).toMatchObject({ status: "rejected", closedAs: "discarded" });
  const jobs = await t.db
    .select()
    .from(coachJobs)
    .where(and(eq(coachJobs.userId, user.id), eq(coachJobs.kind, "create_program")));
  expect(jobs).toHaveLength(1);
});

it("asks for something to send", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const { draftId } = await runnerWithDraft();
  expect(
    await askForFirstProgrammeChangesAction(draftId, " ", crypto.randomUUID(), [
      { question: LONG_RUN, answer: "" },
    ]),
  ).toEqual({ ok: false, error: "Say what you would like changed." });
  expect(await draftRow(draftId)).toMatchObject({ status: "ready" });
});

it("leaves the draft to start when the request cannot be made, and keeps the words", async () => {
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "false");
  const { user, draftId } = await runnerWithDraft();
  const result = await askForFirstProgrammeChangesAction(
    draftId,
    "Keep Mondays free.",
    crypto.randomUUID(),
  );
  expect(result.ok).toBe(false);
  expect(await draftRow(draftId)).toMatchObject({ status: "ready" });
  const intake = await withUser(t.db, user.id, (tx) => latestIntake(tx, user.id, "running"));
  expect(intake!.answers.clarifications.map((entry) => entry.answer)).toContain(
    "Keep Mondays free.",
  );
});
