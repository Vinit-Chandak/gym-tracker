import { expect, it } from "vitest";

import { session } from "./coach-simulator";

const source = "workout:already-used";
const context = (cited = [source]): Parameters<typeof session>[0] => ({
  job: { kind: "prepare_session", target: {} },
  equipmentGymId: "gym",
  memo: { notes: { pending: [], training: { pending: [] } } },
  program: null,
  occurrence: null,
  nextSession: {
    reason: null,
    gym: { kind: "gym" },
    exercises: [
      {
        slotId: "slot",
        lineageId: "lineage",
        planned: { slug: "arnold-press", name: "Arnold press" },
        prescription: {
          sets: 2,
          type: "reps",
          reps: [10, 15],
          seconds: null,
          meters: null,
          rir: [1, 2],
        },
        atThisGym: {
          status: "direct",
          exerciseSlug: "arnold-press",
          machine: { id: "dumbbells", steps: [] },
        },
        weightStep: 2,
        rule: { sets: [1, 2].map(() => set(14, 12, 1)) },
      },
    ],
  },
  pendingComponents: ["strength"],
  trainingEvidence: {
    exerciseTrends: [
      {
        lineageId: "lineage",
        slug: "arnold-press",
        equipmentId: "dumbbells",
        latestSets: [1, 2].map(() => set(12, 16, 5)),
        loadReady: "spare",
        stepEvidenceIds: cited,
        evidenceIds: [source],
        revert: null,
      },
    ],
    evidenceIds: [source],
  },
  requestsToAddress: { items: [] },
  pendingProposal: null,
});
const set = (weight: number, reps: number, rir: number) => ({
  setType: "working",
  weight,
  reps,
  rir,
  durationSeconds: null,
  distanceMeters: null,
});
const sets = (plan: NonNullable<ReturnType<typeof session>>) =>
  (plan.result.plan as { exercises: { sets: unknown[] }[] }).exercises[0]!.sets;
const refusal = `arnold-press: this change stands on ${source}; cite it, and only evidence new since the last accepted change. The same evidence cannot justify another change.`;

it("adds a genuinely missing citation without changing an earned proposal", () => {
  const plan = session(context([]), "rule");
  const corrected = plan.correct([refusal])!;
  expect(corrected.result.evidence).toEqual([source]);
  expect(sets(corrected)).toEqual(sets(plan));
  expect(sets(corrected)[0]).toMatchObject({ weight: 14, reps: 12 });
});

it("holds when a citation already supplied is refused as spent and follows the named baseline", () => {
  const plan = session(context(), "rule");
  const held = plan.correct([refusal])!;
  expect(sets(held)[0]).toMatchObject({ weight: 12, reps: 15 });
  expect(sets(held)).not.toEqual(sets(plan));
  // The history cannot show a still-standing accepted target; the next refusal can name it.
  const pinned = held.correct([
    "arnold-press: target changes need repeated comparable evidence and a small step. Unchanged, its working sets are 16 and 16 reps.",
    "arnold-press: cite two new comparable training dates; the same evidence cannot justify another change.",
  ])!;
  expect(sets(pinned)).toEqual([
    expect.objectContaining({ weight: 12, reps: 16 }),
    expect.objectContaining({ weight: 12, reps: 16 }),
  ]);
});
