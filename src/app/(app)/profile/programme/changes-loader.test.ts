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
        rationale: "Two direct core slots added.",
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

it("gives one change one row, and puts it under the ask that produced it", async () => {
  const data = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  // The same proposal used to be a draft row, a request row and a review row at once, all
  // three opening the same screen. The ask carries it; the other two stand down.
  expect(data.changes).toEqual([]);
  expect(data.reviews).toEqual([]);
  expect(data.requests.map((request) => [request.summary, request.draftId])).toEqual([
    ["More direct core work", draftId],
  ]);
});

it("folds an ask that is back with the coach out of what needs the athlete", async () => {
  const data = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(data.withCoach.map((request) => request.summary)).toEqual(["Add Bayesian cable curls"]);
  // The tab badge counts decisions, so an ask nobody is waiting on the athlete for is not one.
  expect(data.waiting).toBe(1);
});

it("returns the change and its review once the ask no longer speaks for it", async () => {
  await as((tx) => tx.delete(coachProgramRequests));
  const data = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(data.changes.map((change) => change.id)).toEqual([draftId]);
  // Still the one route in: the review it came from waits until the change has an outcome.
  expect(data.reviews).toEqual([]);
  expect(data.waiting).toBe(1);

  await as((tx) => tx.update(programDrafts).set({ status: "activated" }));
  const after = await as((tx) => loadProgrammeChanges(tx, userId, "Europe/London"));
  expect(after.changes).toEqual([]);
  expect(after.reviews.map((review) => review.outcome)).toEqual(["proposal"]);
  expect(after.waiting).toBe(0);
});
