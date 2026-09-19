import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  coachAttemptDiagnostics,
  coachJobs,
  coachNotes,
  coachPreferences,
  coachProgramRequests,
  coachRequestDecisions,
  coachWeeklyReviews,
  gyms,
  profiles,
  programDrafts,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { lastCoachBoundary } from "@/domain/coach-cadence";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { COACH_TRAINING_REFERENCE_VERSION } from "@/domain/coach-training-reference";
import { confirmIntake, saveIntake } from "./coach-intakes";
import { saveCoachNotes } from "./coach-plans";
import {
  answerProgramRequest,
  applyRequestPatch,
  hasActionableRequests,
  listOpenRequests,
} from "./coach-program-requests";
import { expireCoachDiagnostics, recordAttemptDiagnostics } from "./coach-diagnostics";
import { coachJobContext } from "./coaching-context";
import {
  acceptCoachJobResult,
  claimCoachJob,
  dispatchCoachPage,
  enqueueCoachJob,
  enqueueDailySession,
  requestGymChange,
} from "./coaching-jobs";
import { activateProgramDraft, getProgramDraft } from "./program-drafts";
import { readProgramBlueprint } from "./programs";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

const blueprint: ProgramBlueprint = {
  ...STRENGTH_AESTHETICS_HYBRID_8WK,
  slug: "request-test-plan",
  name: "Request test plan",
  weeks: 2,
  runs: [],
  days: [
    {
      ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
      dayIndex: 1,
      includesRun: false,
      exercises: [STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises[0]!],
    },
  ],
};

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  return withUser(t.db, user.id, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", kind: "gym", isDefault: true })
      .returning();
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Get stronger on one training day a week",
        sessionsPerWeek: 1,
        minutesPerSession: 45,
        trainingLocation: "gym",
        heightCm: 178,
        weightKg: 74.5,
        ageYears: 31,
        gymId: gym!.id,
        prompt: "A custom programme.",
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    await tx.update(profiles).set({ timeZone: "UTC" }).where(eq(profiles.id, user.id));
    return { user, gym: gym!, intake };
  });
}
type Athlete = Awaited<ReturnType<typeof athlete>>;
const as = <T>(a: Athlete, work: Parameters<typeof withUser<T>>[2]) =>
  withUser(t.db, a.user.id, work);

/** An athlete with an activated programme and an opening session already stored. */
async function training() {
  const a = await athlete();
  const { job } = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "create_program",
      trigger: "onboarding",
      dedupeKey: `create:${crypto.randomUUID()}`,
      intakeId: a.intake.id,
      target: { gymId: a.gym.id },
    }),
  );
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      outcome: "program",
      blueprint,
      openingPlan: {
        dayIndex: 1,
        gymId: a.gym.id,
        summary: "Find a comfortable starting load.",
        exercises: [
          {
            orderIndex: 1,
            action: "keep",
            exerciseSlug: blueprint.days[0]!.exercises[0]!.exerciseSlug,
            note: "Leave three reps in reserve and record what you used.",
            sets: [{ reps: 5, weight: null, rir: 3 }],
          },
        ],
      },
      rationale: "Matches the confirmed goal.",
      evidence: [],
      uncertainties: [],
    }),
  );
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  const { programId } = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft!.id, {
      expectedRevision: draft!.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  // A week of interval, so a review has somewhere to read from.
  await as(a, (tx) =>
    tx
      .update(coachPreferences)
      .set({ reviewAnchorAt: new Date(lastCoachBoundary().at.getTime() - 3 * 86_400_000) })
      .where(eq(coachPreferences.userId, a.user.id)),
  );
  return { ...a, programId };
}
type Training = Awaited<ReturnType<typeof training>>;

const NOTE = "Can I have Bayesian cable curls, and more direct core work please?";

async function noteFrom(a: Training, text = NOTE) {
  const id = crypto.randomUUID();
  await as(a, (tx) => saveCoachNotes(tx, a.user.id, text, id));
  return id;
}

async function reviewJob(a: Training, purpose: "scheduled" | "requests" = "scheduled") {
  const boundary = lastCoachBoundary();
  const { job } = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: `review:${crypto.randomUUID()}`,
      intakeId: a.intake.id,
      target: {
        programId: a.programId,
        batchDate: boundary.date,
        reviewStart: new Date(boundary.at.getTime() - 7 * 86_400_000).toISOString(),
        reviewEnd: boundary.at.toISOString(),
        purpose,
      },
    }),
  );
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const context = await as(a, (tx) => coachJobContext(tx, a.user.id, job.id, claim!.attemptId!));
  return { job, attemptId: claim!.attemptId!, context };
}

/** The current programme with one exercise added to its only day. */
async function withAddedExercise(a: Training) {
  const current = await as(a, (tx) => readProgramBlueprint(tx, a.user.id, a.programId));
  const revised = structuredClone(current!.blueprint);
  revised.days[0]!.exercises.push({
    exerciseSlug: "cable-crunch",
    sets: 3,
    reps: [10, 15],
    rir: [1, 2],
    rest: [60, 90],
  });
  return revised;
}

it("supplies the training reference once, with the requests the job must decide", async () => {
  const a = await training();
  await noteFrom(a);
  const { context } = await reviewJob(a);
  const serialised = JSON.stringify(context);
  expect(context.trainingReference.version).toBe(COACH_TRAINING_REFERENCE_VERSION);
  expect(context.trainingReference.text).toContain("Coach training reference");
  // Exactly once: a second copy is wasted context and two sources of truth in one job.
  expect(serialised.split("Coach training reference").length - 1).toBe(1);
  expect(context.requestsToAddress.items).toEqual([]);
  expect(context.memo.notes.pending).toHaveLength(1);
});

it("gives two asks in one note two separate outcomes", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const { job, attemptId } = await reviewJob(a);
  const curls = crypto.randomUUID();
  const core = crypto.randomUUID();
  const revised = await withAddedExercise(a);
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
      outcome: "program",
      blueprint: revised,
      openingPlan: null,
      rationale: "Direct core work goes in; the curl variation needs one answer first.",
      evidence: [],
      uncertainties: [],
      requests: {
        open: [
          {
            id: curls,
            sourceId: `note:${noteId}`,
            quote: "Bayesian cable curls",
            summary: "Add Bayesian cable curls",
          },
          {
            id: core,
            sourceId: `note:${noteId}`,
            quote: "more direct core work",
            summary: "More direct core work",
          },
        ],
        decisions: [
          {
            requestId: curls,
            state: "needs_answer",
            detail: "Does your cable station have an adjustable low pulley?",
          },
          {
            requestId: core,
            state: "proposed",
            detail: "Cable crunch added to your training day.",
            changeRefs: ["add:1:2:cable-crunch"],
          },
        ],
      },
    }),
  );
  expect(accepted).toMatchObject({ accepted: true });
  const open = await as(a, (tx) => listOpenRequests(tx, a.user.id));
  expect(open.map((request) => [request.summary, request.state]).sort()).toEqual([
    ["Add Bayesian cable curls", "needs_answer"],
    ["More direct core work", "proposed"],
  ]);
  // A request the coach proposed points at the change that answers it, not at a paraphrase.
  const proposed = open.find((request) => request.state === "proposed")!;
  expect(proposed.draftId).toBe(accepted.draftId);
  expect(proposed.changeRefs).toEqual(["add:1:2:cable-crunch"]);
  // An explicit request is the athlete's to approve, whatever the numeric limits allow.
  const [review] = await as(a, (tx) => tx.select().from(coachWeeklyReviews));
  expect(review?.outcome).toBe("proposal");

  // Approving is what makes it Applied; the question is untouched by the approval.
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft!.id, {
      expectedRevision: draft!.revision,
      startDate: "2026-09-21",
      transition: "continue",
    }),
  );
  const after = await as(a, (tx) =>
    tx.select().from(coachProgramRequests).where(eq(coachProgramRequests.userId, a.user.id)),
  );
  expect(after.find((request) => request.id === core)?.state).toBe("applied");
  expect(after.find((request) => request.id === curls)?.state).toBe("needs_answer");
  const history = await as(a, (tx) =>
    tx.select().from(coachRequestDecisions).where(eq(coachRequestDecisions.requestId, core)),
  );
  expect(history.map((entry) => entry.state)).toEqual(["proposed", "applied"]);
});

it("refuses a review that leaves a supplied ask without a decision", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const first = await reviewJob(a);
  const id = crypto.randomUUID();
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, first.job.id, first.attemptId, {
        outcome: "no_change",
        rationale: "Nothing to change this week.",
        evidence: [],
        uncertainties: [],
        requests: {
          open: [
            {
              id,
              sourceId: `note:${noteId}`,
              quote: "Bayesian cable curls",
              summary: "Add Bayesian cable curls",
            },
          ],
          decisions: [],
        },
      }),
    ),
  ).rejects.toThrow(/needs a decision/i);
});

it("refuses a proposal claiming a change the blueprint does not contain", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const { job, attemptId } = await reviewJob(a);
  const id = crypto.randomUUID();
  const revised = await withAddedExercise(a);
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
        outcome: "program",
        blueprint: revised,
        openingPlan: null,
        rationale: "Adding the curls.",
        evidence: [],
        uncertainties: [],
        requests: {
          open: [
            {
              id,
              sourceId: `note:${noteId}`,
              quote: "Bayesian cable curls",
              summary: "Add Bayesian cable curls",
            },
          ],
          decisions: [
            {
              requestId: id,
              state: "proposed",
              detail: "Added them.",
              changeRefs: ["add:1:2:bayesian-cable-curl"],
            },
          ],
        },
      }),
    ),
  ).rejects.toThrow(/changes the revised programme actually contains/i);
});

it("refuses a quote the athlete did not write, and a decision on somebody else's request", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const { job, attemptId } = await reviewJob(a);
  const invented = {
    outcome: "no_change" as const,
    rationale: "Nothing to change.",
    evidence: [],
    uncertainties: [],
    requests: {
      open: [
        {
          id: crypto.randomUUID(),
          sourceId: `note:${noteId}`,
          quote: "Please remove all squats forever",
          summary: "Remove squats",
        },
      ],
      decisions: [],
    },
  };
  await expect(
    as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, attemptId, invented)),
  ).rejects.toThrow(/exact words/i);
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
        ...invented,
        requests: {
          open: [],
          decisions: [
            {
              requestId: crypto.randomUUID(),
              state: "not_recommended",
              detail: "Not for you.",
            },
          ],
        },
      }),
    ),
  ).rejects.toThrow(/supplied to this attempt/i);
  const twice = crypto.randomUUID();
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
        ...invented,
        requests: {
          open: [
            {
              id: twice,
              sourceId: `note:${noteId}`,
              quote: "more direct core work",
              summary: "More direct core work",
            },
          ],
          decisions: [
            { requestId: twice, state: "not_recommended", detail: "One reason." },
            { requestId: twice, state: "already_satisfied", detail: "And another." },
          ],
        },
      }),
    ),
  ).rejects.toThrow(/exactly one decision/i);
});

it("does not let an on-demand gym change become a hearing for a request", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  await as(a, (tx) =>
    tx.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId: a.user.id,
      sourceId: `note:${noteId}`,
      quote: "more direct core work",
      summary: "More direct core work",
      state: "waiting",
    }),
  );
  await as(a, (tx) =>
    tx.insert(gyms).values({ userId: a.user.id, name: "Another gym", slug: "another-gym" }),
  );
  const [other] = await as(a, (tx) => tx.select().from(gyms).where(eq(gyms.slug, "another-gym")));
  const change = await as(a, (tx) => requestGymChange(tx, a.user.id, other!.id, "Travelling"));
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, change.job!.id));
  const context = await as(a, (tx) =>
    coachJobContext(tx, a.user.id, change.job!.id, claim!.attemptId!),
  );
  // The gym run is handed no assessment list, and the ask stays where it was.
  expect(context.requestsToAddress.items).toEqual([]);
  expect(context.requestsToAddress.meaning).toMatch(/next scheduled daily run/);
  expect(await as(a, (tx) => listOpenRequests(tx, a.user.id))).toHaveLength(1);
});

it("lets a session job find an ask but never decide one", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const prep = await as(a, (tx) => enqueueDailySession(tx, a.user.id, lastCoachBoundary().date));
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, prep!.job.id));
  await as(a, (tx) => coachJobContext(tx, a.user.id, prep!.job.id, claim!.attemptId!));
  const id = crypto.randomUUID();
  const open = [
    {
      id,
      sourceId: `note:${noteId}`,
      quote: "more direct core work",
      summary: "More direct core work",
    },
  ];
  await expect(
    as(a, (tx) =>
      applyRequestPatch(tx, a.user.id, {
        jobId: prep!.job.id,
        attemptId: claim!.attemptId!,
        kind: "prepare_session",
        patch: {
          open,
          decisions: [{ requestId: id, state: "already_satisfied", detail: "It is in there." }],
        },
        changeOperationIds: null,
        draftId: null,
        now: new Date(),
        today: "2026-09-19",
      }),
    ),
  ).rejects.toThrow(/cannot decide a programme request/i);

  // The same result without a decision is accepted, and the review that can decide it is
  // enqueued for the same batch rather than waiting for a second night.
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, prep!.job.id, claim!.attemptId!, {
      outcome: "no_change",
      rationale: "The prepared opening session still fits.",
      evidence: [],
      uncertainties: [],
      requests: { open, decisions: [] },
    }),
  );
  expect(accepted).toMatchObject({ accepted: true });
  const jobs = await as(a, (tx) => tx.select().from(coachJobs));
  expect(
    jobs.some(
      (job) =>
        job.kind === "review_program" &&
        job.target.purpose === "requests" &&
        ["queued", "claimed"].includes(job.status),
    ),
  ).toBe(true);
  expect((await as(a, (tx) => listOpenRequests(tx, a.user.id)))[0]).toMatchObject({
    state: "waiting",
    summary: "More direct core work",
  });
});

it("reviews for a waiting request without consuming the scheduled review", async () => {
  const a = await training();
  const boundary = lastCoachBoundary();
  const anchor = new Date(boundary.at.getTime() - 2 * 86_400_000);
  await as(a, (tx) =>
    tx
      .update(coachPreferences)
      .set({ reviewAnchorAt: anchor })
      .where(eq(coachPreferences.userId, a.user.id)),
  );
  // Two days in: the ordinary review is not due, and there is nothing to assess yet.
  await as(a, (tx) =>
    tx.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId: a.user.id,
      sourceId: `note:${crypto.randomUUID()}`,
      quote: "more direct core work",
      summary: "More direct core work",
      state: "waiting",
    }),
  );
  expect(await as(a, (tx) => hasActionableRequests(tx, a.user.id, boundary.date))).toBe(true);
  for (let after: string | null = null; ;) {
    const page: Awaited<ReturnType<typeof dispatchCoachPage>> = await dispatchCoachPage(
      t.db,
      after,
    );
    if (!page.nextCursor) break;
    after = page.nextCursor;
  }
  const review = (await as(a, (tx) => tx.select().from(coachJobs))).find(
    (job) => job.kind === "review_program",
  );
  expect(review?.target.purpose).toBe("requests");
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, review!.id));
  const context = await as(a, (tx) =>
    coachJobContext(tx, a.user.id, review!.id, claim!.attemptId!),
  );
  expect(context.requestsToAddress.items).toHaveLength(1);
  await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, review!.id, claim!.attemptId!, {
      outcome: "no_change",
      rationale: "Your programme already covers this on the training day.",
      evidence: [],
      uncertainties: [],
      requests: {
        open: [],
        decisions: [
          {
            requestId: context.requestsToAddress.items[0]!.id,
            state: "already_satisfied",
            detail: "The training day already carries two direct core sets.",
          },
        ],
      },
    }),
  );
  const [preference] = await as(a, (tx) =>
    tx.select().from(coachPreferences).where(eq(coachPreferences.userId, a.user.id)),
  );
  // The anchor has not moved: the week this run did not read is still owed a real review.
  expect(preference?.reviewAnchorAt?.toISOString()).toBe(anchor.toISOString());
  expect(await as(a, (tx) => listOpenRequests(tx, a.user.id))).toEqual([]);
});

it("keeps an ask saved after the input snapshot for the next daily run", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  // Something only a review can grant is waiting, which is what brings a review forward.
  await as(a, (tx) =>
    tx
      .update(coachPreferences)
      .set({ reviewRequestedAt: new Date() })
      .where(eq(coachPreferences.userId, a.user.id)),
  );
  const { job, attemptId } = await reviewJob(a);
  const first = crypto.randomUUID();
  // Saved after the run captured its inputs; it belongs to the next one.
  const late = crypto.randomUUID();
  await as(a, (tx) =>
    tx.insert(coachProgramRequests).values({
      id: late,
      userId: a.user.id,
      sourceId: `note:${noteId}`,
      quote: "more direct core work",
      summary: "More direct core work",
      state: "waiting",
    }),
  );
  await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
      outcome: "no_change",
      rationale: "Holding the programme for another week.",
      evidence: [],
      uncertainties: [],
      requests: {
        open: [
          {
            id: first,
            sourceId: `note:${noteId}`,
            quote: "Bayesian cable curls",
            summary: "Add Bayesian cable curls",
          },
        ],
        decisions: [
          {
            requestId: first,
            state: "not_recommended",
            detail: "Your cable station has no adjustable low pulley for this variation.",
          },
        ],
      },
    }),
  );
  const open = await as(a, (tx) => listOpenRequests(tx, a.user.id));
  expect(open.map((request) => request.id)).toEqual([late]);
  const [preference] = await as(a, (tx) =>
    tx.select().from(coachPreferences).where(eq(coachPreferences.userId, a.user.id)),
  );
  // Something is still waiting, so the flag that brings a review forward stays up.
  expect(preference?.reviewRequestedAt).not.toBeNull();
});

it("resumes the same request from an answer, without starting a run", async () => {
  const a = await training();
  const noteId = await noteFrom(a);
  const id = crypto.randomUUID();
  await as(a, (tx) =>
    tx.insert(coachProgramRequests).values({
      id,
      userId: a.user.id,
      sourceId: `note:${noteId}`,
      quote: "Bayesian cable curls",
      summary: "Add Bayesian cable curls",
      state: "needs_answer",
      detail: "Does your cable station have an adjustable low pulley?",
    }),
  );
  const before = (await as(a, (tx) => tx.select().from(coachJobs))).length;
  await as(a, (tx) =>
    answerProgramRequest(
      tx,
      a.user.id,
      id,
      "Yes, it goes right down to the floor.",
      crypto.randomUUID(),
    ),
  );
  const [request] = await as(a, (tx) =>
    tx.select().from(coachProgramRequests).where(eq(coachProgramRequests.id, id)),
  );
  expect(request?.state).toBe("waiting");
  // The answer is an ordinary note the coach can quote, tied to the question it answers.
  const [note] = await as(a, (tx) =>
    tx
      .select()
      .from(coachNotes)
      .where(and(eq(coachNotes.userId, a.user.id), eq(coachNotes.requestId, id))),
  );
  expect(note?.text).toContain("right down to the floor");
  expect((await as(a, (tx) => tx.select().from(coachJobs))).length).toBe(before);
});

it("leaves no draft to apply when a review changes nothing", async () => {
  const a = await training();
  const { job, attemptId } = await reviewJob(a);
  const current = await as(a, (tx) => readProgramBlueprint(tx, a.user.id, a.programId));
  await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, attemptId, {
      outcome: "program",
      blueprint: structuredClone(current!.blueprint),
      openingPlan: null,
      rationale: "Everything is progressing; nothing needs to change.",
      evidence: [],
      uncertainties: [],
    }),
  );
  const drafts = await as(a, (tx) =>
    tx.select().from(programDrafts).where(eq(programDrafts.userId, a.user.id)),
  );
  expect(drafts.filter((draft) => ["editing", "ready"].includes(draft.status))).toEqual([]);
  const [review] = await as(a, (tx) => tx.select().from(coachWeeklyReviews));
  expect(review?.outcome).toBe("no_change");
});

it("expires a coaching receipt after thirty days and nothing else with it", async () => {
  const a = await training();
  const { job, attemptId } = await reviewJob(a);
  const old = new Date(Date.now() - 31 * 86_400_000);
  await as(a, (tx) =>
    recordAttemptDiagnostics(
      tx,
      a.user.id,
      { jobId: job.id, attemptId, kind: "review_program", outcome: "no_change" },
      old,
    ),
  );
  await as(a, (tx) =>
    recordAttemptDiagnostics(
      tx,
      a.user.id,
      { jobId: job.id, attemptId, kind: "review_program", outcome: "no_change" },
      new Date(),
    ),
  );
  const noteId = await noteFrom(a);
  await as(a, (tx) =>
    tx.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId: a.user.id,
      sourceId: `note:${noteId}`,
      quote: "more direct core work",
      summary: "More direct core work",
      state: "waiting",
    }),
  );
  expect(await expireCoachDiagnostics(t.db)).toBeGreaterThanOrEqual(1);
  const kept = await as(a, (tx) =>
    tx.select().from(coachAttemptDiagnostics).where(eq(coachAttemptDiagnostics.userId, a.user.id)),
  );
  // The receipt from a month ago is gone; the ones inside the window, including the one this
  // athlete's programme creation left, are not.
  expect(kept.every((receipt) => receipt.completedAt > old)).toBe(true);
  expect(
    kept.every((receipt) => receipt.referenceVersion === COACH_TRAINING_REFERENCE_VERSION),
  ).toBe(true);
  // The cleanup touches nothing else the athlete depends on.
  expect(await as(a, (tx) => listOpenRequests(tx, a.user.id))).toHaveLength(1);
  expect(await as(a, (tx) => readProgramBlueprint(tx, a.user.id, a.programId))).not.toBeNull();
  expect(await as(a, (tx) => tx.select().from(coachNotes))).not.toHaveLength(0);
});

it("keeps one athlete's asks out of another's job", async () => {
  const mine = await training();
  const theirs = await training();
  const noteId = await noteFrom(theirs);
  const foreign = crypto.randomUUID();
  await as(theirs, (tx) =>
    tx.insert(coachProgramRequests).values({
      id: foreign,
      userId: theirs.user.id,
      sourceId: `note:${noteId}`,
      quote: "Bayesian cable curls",
      summary: "Add Bayesian cable curls",
      state: "waiting",
    }),
  );
  const { job, attemptId, context } = await reviewJob(mine);
  expect(context.requestsToAddress.items).toEqual([]);
  await expect(
    as(mine, (tx) =>
      acceptCoachJobResult(tx, mine.user.id, job.id, attemptId, {
        outcome: "no_change",
        rationale: "Nothing to change.",
        evidence: [],
        uncertainties: [],
        requests: {
          open: [],
          decisions: [{ requestId: foreign, state: "not_recommended", detail: "No." }],
        },
      }),
    ),
  ).rejects.toThrow(/supplied to this attempt/i);
  // And the other athlete's ask is untouched by the attempt that tried to close it.
  expect((await as(theirs, (tx) => listOpenRequests(tx, theirs.user.id)))[0]?.state).toBe(
    "waiting",
  );
});

it("carries a queued note forward once, however often the backfill is run", async () => {
  const a = await training();
  const noteId = await noteFrom(a, "Please add some direct calf work.");
  await as(a, (tx) =>
    tx
      .update(coachNotes)
      .set({
        reviewedAt: new Date(),
        disposition: "queued_for_review",
        dispositionDetail: "Needs a new slot, so it waits for your programme review.",
      })
      .where(eq(coachNotes.id, noteId)),
  );
  const migration = readFileSync(
    join(process.cwd(), "src/db/migrations/0024_coach_program_requests.sql"),
    "utf8",
  );
  const backfill = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.includes('INSERT INTO "coach_program_requests"'));
  expect(backfill).toHaveLength(2);
  const run = async () => {
    for (const statement of backfill) await t.db.execute(sql.raw(statement));
  };
  await run();
  await run();
  const carried = await as(a, (tx) =>
    tx
      .select()
      .from(coachProgramRequests)
      .where(eq(coachProgramRequests.sourceId, `note:${noteId}`)),
  );
  expect(carried).toHaveLength(1);
  expect(carried[0]).toMatchObject({
    state: "waiting",
    quote: "Please add some direct calf work.",
  });
});
