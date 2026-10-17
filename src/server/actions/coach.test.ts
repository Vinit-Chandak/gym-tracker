import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  coachIntakes,
  coachJobs,
  coachNotes,
  coachPreferences,
  coachProgramRequests,
  profiles,
  programs,
  sportCoachPreferences,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { coachIntakeSchema, jobTargetSchema } from "@/domain/coaching-workflow";
import {
  readCoachMemory,
  readCoachNotes,
  updateCoachMemory,
} from "@/server/repositories/coach-memory";
import { dispatchCoachPage } from "@/server/repositories/coaching-jobs";
import {
  answerProgramRequest,
  applyRequestPatch,
} from "@/server/repositories/coach-program-requests";

const state = vi.hoisted(() => ({ db: null as unknown, user: { id: "", email: "" } }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/auth", () => ({ requireUser: async () => state.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));

import { saveCoachNotesAction, setAiCoachEnabledAction } from "./coach";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  state.db = t.db;
});
afterAll(async () => {
  await t.close();
  vi.unstubAllEnvs();
});

async function athlete(sports: readonly ActivitySport[] = ACTIVITY_SPORTS) {
  state.user = await t.createAuthUser(`${crypto.randomUUID()}@coach-messages.test`);
  const user = state.user;
  await withUser(t.db, user.id, async (tx) => {
    for (const sport of sports)
      await tx.insert(programs).values({
        userId: user.id,
        familyId: crypto.randomUUID(),
        sport,
        slug: sport,
        name: `${sport} programme`,
        status: "active",
        startDate: "2026-10-16",
      });
  });
  return user;
}

function message(
  sport: string,
  noteId = crypto.randomUUID(),
  userNotes = "Make sessions shorter.",
) {
  const form = new FormData();
  form.set("noteId", noteId);
  form.set("userNotes", userNotes);
  form.set("sport", sport);
  return form;
}

it("saves a message and schedules a review only for the selected programme", async () => {
  const user = await athlete();
  const form = message("running");
  expect(await saveCoachNotesAction({}, form)).toEqual({});
  const notes = await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id));
  expect(notes).toMatchObject([{ id: form.get("noteId"), sport: "running" }]);
  expect((await readCoachNotes(t.db, user.id, new Date(), "strength")).pending).toEqual([]);
  await expect(
    withUser(t.db, user.id, (tx) =>
      updateCoachMemory(
        tx,
        user.id,
        {
          expectedRevision: 0,
          reviewedNotes: [{ id: `note:${notes[0]!.id}`, disposition: "remembered" }],
        },
        "coach",
        new Date(),
        "strength",
      ),
    ),
  ).rejects.toThrow("Only answer notes addressed to this programme.");
  await expect(
    withUser(t.db, user.id, (tx) =>
      applyRequestPatch(tx, user.id, {
        jobId: crypto.randomUUID(),
        attemptId: crypto.randomUUID(),
        sport: "strength",
        kind: "prepare_session",
        patch: {
          open: [
            {
              id: crypto.randomUUID(),
              sourceId: `note:${notes[0]!.id}`,
              quote: "Make sessions shorter.",
              summary: "Shorter sessions",
            },
          ],
        },
        changeOperationIds: null,
        draftId: null,
        now: new Date(),
        today: "2026-10-18",
      }),
    ),
  ).rejects.toThrow("Open requests only from notes addressed to this programme.");
  const flags = await t.db
    .select()
    .from(sportCoachPreferences)
    .where(eq(sportCoachPreferences.userId, user.id));
  expect(flags.map((flag) => flag.sport)).toEqual(["running"]);
  expect(flags[0]!.reviewRequestedAt).toBeInstanceOf(Date);
  expect(await t.db.select().from(coachJobs).where(eq(coachJobs.userId, user.id))).toEqual([]);
});

it("delivers all-programme messages independently and retries without duplicates or new reviews", async () => {
  const user = await athlete();
  const form = message("all");
  expect(await saveCoachNotesAction({}, form)).toEqual({});
  expect((await readCoachMemory(t.db, user.id)).userNotes).toBe("Make sessions shorter.");
  const notes = await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id));
  expect(notes.map((note) => note.sport).sort()).toEqual([...ACTIVITY_SPORTS].sort());
  const running = notes.find((note) => note.sport === "running")!;
  await withUser(t.db, user.id, (tx) =>
    updateCoachMemory(
      tx,
      user.id,
      {
        expectedRevision: 0,
        reviewedNotes: [{ id: `note:${running.id}`, disposition: "remembered" }],
      },
      "coach",
    ),
  );
  expect((await readCoachNotes(t.db, user.id, new Date(), "running")).pending).toEqual([]);
  expect((await readCoachNotes(t.db, user.id, new Date(), "strength")).pending).toHaveLength(1);
  await t.db
    .update(sportCoachPreferences)
    .set({ reviewRequestedAt: null })
    .where(eq(sportCoachPreferences.userId, user.id));
  expect(await saveCoachNotesAction({}, form)).toEqual({});
  expect(await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id))).toHaveLength(
    4,
  );
  const flags = await t.db
    .select()
    .from(sportCoachPreferences)
    .where(eq(sportCoachPreferences.userId, user.id));
  expect(flags.every((flag) => flag.reviewRequestedAt === null)).toBe(true);
});

it("rejects unknown and inactive programme scopes without saving a message", async () => {
  const user = await athlete(["running"]);
  expect(await saveCoachNotesAction({}, message("tennis"))).toMatchObject({
    fieldErrors: { sport: expect.any(String) },
  });
  expect(await saveCoachNotesAction({}, message("strength"))).toMatchObject({
    formError: "Choose one of your active programmes.",
  });
  expect(await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id))).toEqual([]);
});

it("does not broaden or duplicate an uncertain submission when its scope or text changes", async () => {
  const user = await athlete();
  const targeted = message("running");
  expect(await saveCoachNotesAction({}, targeted)).toEqual({});
  targeted.set("sport", "all");
  expect(await saveCoachNotesAction({}, targeted)).toMatchObject({
    formError: expect.stringContaining("changed after it was saved"),
  });
  targeted.set("sport", "running");
  targeted.set("userNotes", "A different request.");
  expect(await saveCoachNotesAction({}, targeted)).toMatchObject({
    formError: expect.stringContaining("changed after it was saved"),
  });
  const all = message("all");
  expect(await saveCoachNotesAction({}, all)).toEqual({});
  all.set("sport", "cycling");
  expect(await saveCoachNotesAction({}, all)).toMatchObject({
    formError: expect.stringContaining("changed after it was saved"),
  });
  expect(await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id))).toHaveLength(
    5,
  );
});

it("replays all-programme delivery to the original recipients when programmes change", async () => {
  const user = await athlete(["running"]);
  const form = message("all");
  expect(await saveCoachNotesAction({}, form)).toEqual({});
  await t.db.insert(programs).values({
    userId: user.id,
    familyId: crypto.randomUUID(),
    sport: "cycling",
    slug: "cycling",
    name: "Cycling",
    status: "active",
  });
  expect(await saveCoachNotesAction({}, form)).toEqual({});
  expect(await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id))).toMatchObject([
    { sport: "running" },
  ]);
});

it("keeps a general note when no programme exists yet", async () => {
  const user = await athlete([]);
  expect(await saveCoachNotesAction({}, message(""))).toEqual({});
  expect(await t.db.select().from(coachNotes).where(eq(coachNotes.userId, user.id))).toMatchObject([
    { sport: null, text: "Make sessions shorter." },
  ]);
});

it("a reply to a programme question stays in that programme", async () => {
  const user = await athlete();
  const [request] = await t.db
    .insert(coachProgramRequests)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      sport: "running",
      sourceId: `note:${crypto.randomUUID()}`,
      quote: "Move my long run",
      summary: "Move my long run",
      state: "needs_answer",
      detail: "Which day suits you?",
    })
    .returning();
  const noteId = crypto.randomUUID();
  await withUser(t.db, user.id, (tx) =>
    answerProgramRequest(tx, user.id, request!.id, "Sunday.", noteId),
  );
  expect((await readCoachNotes(t.db, user.id, new Date(), "running")).pending).toMatchObject([
    { id: noteId, sport: "running", requestId: request!.id },
  ]);
  expect((await readCoachNotes(t.db, user.id, new Date(), "strength")).pending).toEqual([]);
  expect((await readCoachNotes(t.db, user.id, new Date(), "cycling")).pending).toEqual([]);
  expect(
    (
      await t.db.select().from(coachProgramRequests).where(eq(coachProgramRequests.id, request!.id))
    )[0]!.state,
  ).toBe("waiting");
});

it("the daily batch queues one independent review per programme that received a message", async () => {
  const user = await athlete(["running", "cycling"]);
  await t.db.update(profiles).set({ aiCoachEnabled: true }).where(eq(profiles.id, user.id));
  expect(await saveCoachNotesAction({}, message("all"))).toEqual({});
  const batch = await dispatchCoachPage(t.db, null, new Date("2026-10-19T06:30:00Z"));
  expect(batch.errors).toEqual([]);
  const reviews = await t.db
    .select()
    .from(coachJobs)
    .where(and(eq(coachJobs.userId, user.id), eq(coachJobs.kind, "review_program")));
  expect(reviews.map((job) => job.target.sport).sort()).toEqual(["cycling", "running"]);
  expect(reviews.every((job) => job.target.purpose === "requests")).toBe(true);
  await dispatchCoachPage(t.db, null, new Date("2026-10-19T06:30:00Z"));
  expect(await t.db.select().from(coachJobs).where(eq(coachJobs.userId, user.id))).toHaveLength(2);
});

it("resumes coaching from an endurance brief without replacing its work or requiring strength setup", async () => {
  const user = await athlete(["running"]);
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const [intake] = await t.db
    .insert(coachIntakes)
    .values({
      userId: user.id,
      sport: "running",
      revision: 1,
      answers: coachIntakeSchema.parse({ programmeSport: "running", goal: "Run comfortably" }),
      confirmedAt: new Date("2026-10-16T12:00:00Z"),
    })
    .returning();
  await t.db.insert(coachPreferences).values({ userId: user.id, mode: "track" });
  await t.db
    .insert(sportCoachPreferences)
    .values({ userId: user.id, sport: "running", intakeId: intake!.id });
  const [job] = await t.db
    .insert(coachJobs)
    .values({
      userId: user.id,
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: "resume-running",
      target: jobTargetSchema.parse({ sport: "running" }),
    })
    .returning();
  await setAiCoachEnabledAction(true);
  expect(
    (await t.db.select().from(profiles).where(eq(profiles.id, user.id)))[0]!.aiCoachEnabled,
  ).toBe(true);
  expect(
    (await t.db.select().from(coachPreferences).where(eq(coachPreferences.userId, user.id)))[0]!
      .mode,
  ).toBe("coach");
  expect((await t.db.select().from(coachJobs).where(eq(coachJobs.id, job!.id)))[0]!.status).toBe(
    "queued",
  );
  expect(
    (await t.db.select().from(coachIntakes).where(eq(coachIntakes.userId, user.id))).map(
      (row) => row.sport,
    ),
  ).toEqual(["running"]);
});

it("routes an athlete without coaching consent to the sport chooser", async () => {
  await athlete(["cycling"]);
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  await expect(setAiCoachEnabledAction(true)).rejects.toThrow("redirect:/training/programmes/new");
});

it("a running note queued for review does not advance the strength review clock", async () => {
  const user = await athlete();
  await t.db.insert(coachPreferences).values({ userId: user.id, mode: "coach" });
  const [note] = await t.db
    .insert(coachNotes)
    .values({ userId: user.id, sport: "running", text: "Add intervals." })
    .returning();
  const now = new Date();
  await withUser(t.db, user.id, (tx) =>
    updateCoachMemory(
      tx,
      user.id,
      {
        expectedRevision: 0,
        reviewedNotes: [
          {
            id: `note:${note!.id}`,
            disposition: "queued_for_review",
            detail: "Needs your approval.",
          },
        ],
      },
      "coach",
      now,
      "running",
    ),
  );
  expect(
    (await t.db.select().from(coachPreferences).where(eq(coachPreferences.userId, user.id)))[0]!
      .reviewRequestedAt,
  ).toBeNull();
  const flags = await t.db
    .select()
    .from(sportCoachPreferences)
    .where(eq(sportCoachPreferences.userId, user.id));
  expect(flags).toMatchObject([{ sport: "running", reviewRequestedAt: now }]);
});
