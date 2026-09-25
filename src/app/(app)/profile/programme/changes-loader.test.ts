import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { coachJobs, coachProgramRequests, coachWeeklyReviews, programDrafts } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { jobTargetSchema } from "@/domain/coaching-workflow";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { loadProgrammeChanges } from "./changes";

// The loader is what decides which row speaks for a change; the components it sits beside are
// not under test here, and their client-side imports would only need a browser to load.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  answerProgramRequestAction: vi.fn(),
  withdrawProgramRequestAction: vi.fn(),
  requestProgramReviewAction: vi.fn(),
}));
vi.mock("@/server/actions/coach", () => ({
  applyProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
}));

let t: TestDatabase;
let userId: string;
let draftId: string;

const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, userId, work);

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  const user = await t.createAuthUser("changes@example.com");
  userId = user.id;
  const { programId } = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));

  await as(async (tx) => {
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
    const [draft] = await tx
      .insert(programDrafts)
      .values({
        userId,
        source: "weekly",
        status: "ready",
        blueprint: STRENGTH_AESTHETICS_HYBRID_8WK,
        baseProgramId: programId,
        sourceRevision: 1,
        headline: "Doubles your direct core work: 4 → 8 sets a week.",
        rationale:
          "You currently have two direct core slots a week — the cable crunch on Lower A and the side plank on Upper B's easy-run day — which came to four direct sets across the last eleven days.",
      })
      .returning({ id: programDrafts.id });
    draftId = draft!.id;
    await tx.insert(coachWeeklyReviews).values({
      userId,
      jobId: job!.id,
      periodStart: new Date("2026-09-12T00:00:00Z"),
      periodEnd: new Date("2026-09-19T00:00:00Z"),
      outcome: "proposal",
      rationale: "Two direct core slots added.",
      draftId,
    });
    await tx.insert(coachProgramRequests).values([
      {
        id: crypto.randomUUID(),
        userId,
        sourceId: `note:${crypto.randomUUID()}`,
        quote: "more core",
        summary: "More direct core work",
        state: "proposed",
        detail: "Two direct core slots added.",
        draftId,
      },
      {
        id: crypto.randomUUID(),
        userId,
        sourceId: `note:${crypto.randomUUID()}`,
        quote: "Need to add Bayesian bicep curls",
        summary: "Add Bayesian cable curls",
        state: "waiting",
        detail: "You asked for revisions.",
      },
    ]);
  });
});

afterAll(async () => {
  await t?.close();
});

it("gives one proposal one row, carrying the words of the ask it answers", async () => {
  const data = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  // One route in: not a draft row, a request row and a review row for the same change.
  expect(data.proposals).toEqual([
    {
      id: draftId,
      title: "Doubles your direct core work: 4 → 8 sets a week.",
      fromCoach: true,
      asks: ["more core"],
    },
  ]);
  expect(data.questions).toEqual([]);
});

it("folds an ask that is back with the coach out of what needs the athlete", async () => {
  const data = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(data.withCoach.map((request) => request.quote)).toEqual([
    "Need to add Bayesian bicep curls",
  ]);
  // The tab badge counts decisions, so an ask nobody is waiting on the athlete for is not one.
  expect(data.waiting).toBe(1);
});

it("moves a decided change into the history count rather than onto the tab", async () => {
  await as((tx) => tx.update(programDrafts).set({ status: "activated" }));
  const after = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(after.proposals).toEqual([]);
  expect(after.waiting).toBe(0);
  expect(after.history.changes).toBe(1);
  // An ask still marked proposed on a change that is no longer open is shown as back with the
  // coach, not as something waiting on the athlete.
  expect(after.withCoach.map((request) => request.state)).toEqual(["waiting", "waiting"]);
});

it("counts a settled ask in history, and an open one nowhere but the tab", async () => {
  const before = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(before.history.requests).toBe(0);
  await as((tx) =>
    tx.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId,
      sourceId: `note:${crypto.randomUUID()}`,
      quote: "swap the leg press",
      summary: "Swap the leg press",
      state: "applied",
      detail: "",
    }),
  );
  const after = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(after.history.requests).toBe(1);
});
