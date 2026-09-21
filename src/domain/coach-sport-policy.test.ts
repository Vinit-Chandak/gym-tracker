import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema, type EndurancePrescription } from "./activity-prescription";
import {
  assessSportChange,
  comparableContext,
  coverageProblems,
  MULTISPORT_POLICY_REVISION,
  prescriptionEffortRange,
  SPORT_POLICY_VERSIONS,
  sportReadiness,
} from "./coach-sport-policy";
import { TRAINING_POLICY } from "./training-evidence";

const MINUTE = 60_000;

function prescription(
  sport: "running" | "cycling" | "swimming",
  overrides: Partial<EndurancePrescription> = {},
): EndurancePrescription {
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport,
    sessionTargets: { durationMs: [30 * MINUTE, 40 * MINUTE], distanceMetres: null, effort: null },
    ...overrides,
  });
}

describe("bounded adjustment inside approved ranges", () => {
  /** AT-COACH-04: inside the approved envelope, the coach may act. */
  it("lets a ride settle anywhere inside the range the athlete approved", () => {
    const approved = prescription("cycling");
    const proposed = prescription("cycling", {
      sessionTargets: {
        durationMs: [38 * MINUTE, 38 * MINUTE],
        distanceMetres: null,
        effort: null,
      },
    });
    const assessment = assessSportChange(approved, proposed);
    expect(assessment.authority).toBe("automatic");
    expect(assessment.reasons).toEqual([]);
    expect(assessment.policyRevision).toBe(MULTISPORT_POLICY_REVISION);
    expect(assessment.sportPolicyVersion).toBe(SPORT_POLICY_VERSIONS.cycling);
  });

  it("reports nothing to do when the prescription did not move", () => {
    const approved = prescription("swimming");
    expect(assessSportChange(approved, prescription("swimming")).authority).toBe("unchanged");
  });

  /** AT-COACH-04: outside the envelope it is a proposal, however small the step. */
  it("sends a duration past the approved ceiling to review", () => {
    const assessment = assessSportChange(
      prescription("cycling"),
      prescription("cycling", {
        sessionTargets: {
          durationMs: [41 * MINUTE, 41 * MINUTE],
          distanceMetres: null,
          effort: null,
        },
      }),
    );
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons[0]?.path).toBe("sessionTargets.durationMs");
  });

  /** COACH-05: no approved range means there is nothing to choose inside. */
  it("sends a brand new target to review when the approved session had no range", () => {
    const approved = prescription("swimming", {
      sessionTargets: {
        durationMs: [30 * MINUTE, 30 * MINUTE],
        distanceMetres: null,
        effort: null,
      },
    });
    const assessment = assessSportChange(
      approved,
      prescription("swimming", {
        sessionTargets: {
          durationMs: [30 * MINUTE, 30 * MINUTE],
          distanceMetres: [1000, 1000],
          effort: null,
        },
      }),
    );
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons[0]?.message).toContain("no distance range");
  });

  /** §8.3: running's 10% is running's. Nothing inherits it. */
  it("does not let cycling borrow running's ten per cent", () => {
    const approved = prescription("cycling", {
      sessionTargets: {
        durationMs: [60 * MINUTE, 60 * MINUTE],
        distanceMetres: null,
        effort: null,
      },
    });
    const withinRunningsLimit = prescription("cycling", {
      sessionTargets: {
        durationMs: [
          Math.round(60 * MINUTE * (1 + TRAINING_POLICY.maxRunChange)),
          Math.round(60 * MINUTE * (1 + TRAINING_POLICY.maxRunChange)),
        ],
        distanceMetres: null,
        effort: null,
      },
    });
    expect(assessSportChange(approved, withinRunningsLimit).authority).toBe("review_required");
  });
});

describe("what always needs the athlete", () => {
  it("refuses to change the sport of a scheduled session", () => {
    const assessment = assessSportChange(prescription("running"), prescription("cycling"));
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons).toHaveLength(1);
    expect(assessment.reasons[0]?.path).toBe("sport");
  });

  it("treats a rewritten running stop rule as advice the athlete reads first", () => {
    const approved = prescription("running");
    const assessment = assessSportChange(
      approved,
      prescription("running", {
        running: {
          paceNote: null,
          progressionNote: null,
          symptomStopRule: "Stop if the shin complains.",
          note: null,
        },
      }),
    );
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons.map((reason) => reason.path)).toContain("running");
  });

  it("holds a swim that gains repetitions and loses rest", () => {
    const block = (repetitions: number, restBetweenMs: number | null) =>
      prescription("swimming", {
        sessionTargets: { durationMs: null, distanceMetres: null, effort: null },
        nodes: [
          {
            kind: "repeat",
            id: "set",
            repetitions,
            restBetweenMs,
            steps: [
              {
                kind: "step",
                id: "rep",
                phase: "work",
                action: "swim",
                target: { kind: "distance", metres: [50, 50] },
                effort: null,
                stroke: "freestyle",
                notes: null,
              },
            ],
          },
        ],
      });
    const assessment = assessSportChange(block(8, 20_000), block(10, 10_000));
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons.map((reason) => reason.path)).toEqual([
      "nodes.0.repetitions",
      "nodes.0.restBetweenMs",
    ]);
  });

  it("allows doing fewer repetitions of what was already agreed", () => {
    const block = (repetitions: number) =>
      prescription("swimming", {
        sessionTargets: { durationMs: null, distanceMetres: null, effort: null },
        nodes: [
          {
            kind: "repeat",
            id: "set",
            repetitions,
            restBetweenMs: 20_000,
            steps: [
              {
                kind: "step",
                id: "rep",
                phase: "work",
                action: "swim",
                target: { kind: "distance", metres: [50, 50] },
                effort: null,
                stroke: "freestyle",
                notes: null,
              },
            ],
          },
        ],
      });
    expect(assessSportChange(block(8), block(6)).authority).toBe("automatic");
  });

  it("refuses a step that changes what the athlete is asked to do", () => {
    const stepped = (action: "swim" | "rest", stroke: "freestyle" | "butterfly") =>
      prescription("swimming", {
        sessionTargets: { durationMs: null, distanceMetres: null, effort: null },
        nodes: [
          {
            kind: "step",
            id: "one",
            phase: "work",
            action,
            target: { kind: "distance", metres: [200, 200] },
            effort: null,
            stroke,
            notes: null,
          },
        ],
      });
    const assessment = assessSportChange(
      stepped("swim", "freestyle"),
      stepped("swim", "butterfly"),
    );
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons[0]?.message).toContain("asks the athlete to do");
  });

  it("reports a structural change when steps are added", () => {
    const assessment = assessSportChange(
      prescription("cycling"),
      prescription("cycling", {
        nodes: [
          {
            kind: "step",
            id: "warm",
            phase: "warmup",
            action: "ride",
            target: { kind: "duration", ms: [5 * MINUTE, 5 * MINUTE] },
            effort: null,
            stroke: null,
            notes: null,
          },
        ],
      }),
    );
    expect(assessment.authority).toBe("review_required");
    expect(assessment.reasons[0]?.path).toBe("nodes");
  });
});

describe("what a sport needs before it can be progressed", () => {
  /** AT-COACH-05: sparse evidence holds; it does not guess. */
  it("holds a new sport until there is something to compare", () => {
    const readiness = sportReadiness({
      sport: "cycling",
      comparableActuals: 1,
      confirmedEffortActuals: 1,
      answered: ["cycling_environment", "cycling_assistance", "cycling_time"],
    });
    expect(readiness.canProgress).toBe(false);
    expect(readiness.holds[0]).toContain("comparable sessions");
    expect(readiness.questions).toEqual([]);
  });

  it("asks rather than assumes when an essential answer is missing", () => {
    const readiness = sportReadiness({
      sport: "swimming",
      comparableActuals: 5,
      confirmedEffortActuals: 5,
      answered: ["swimming_ability"],
    });
    expect(readiness.canProgress).toBe(false);
    expect(readiness.questions.map((question) => question.id)).toEqual([
      "swimming_environment",
      "swimming_pool",
    ]);
  });

  /** AT-COACH-05: an unknown effort is not a confirmed success or failure signal. */
  it("does not treat unreported effort as evidence a session went well", () => {
    const readiness = sportReadiness({
      sport: "running",
      comparableActuals: 4,
      confirmedEffortActuals: 1,
      answered: ["running_environment", "running_recent"],
    });
    expect(readiness.canProgress).toBe(false);
    expect(readiness.holds[0]).toContain("reported effort");
  });

  it("progresses once the answers and the comparable sessions are both there", () => {
    expect(
      sportReadiness({
        sport: "running",
        comparableActuals: TRAINING_POLICY.confirmationExposures,
        confirmedEffortActuals: TRAINING_POLICY.confirmationExposures,
        answered: ["running_environment", "running_recent"],
      }).canProgress,
    ).toBe(true);
  });
});

describe("review coverage", () => {
  /** AT-COACH-02: a sport missing from coverage is a review that forgot it. */
  it("names an included sport the review said nothing about", () => {
    expect(
      coverageProblems(
        ["strength", "running", "swimming"],
        [
          { sport: "strength", decision: "unchanged", reason: "", sourceIds: [], comparable: true },
          {
            sport: "running",
            decision: "hold",
            reason: "Two easy runs, both unreported.",
            sourceIds: ["activity:1"],
            comparable: true,
          },
        ],
      ),
    ).toEqual([{ sport: "swimming", message: "The review says nothing about swimming." }]);
  });

  it("rejects coverage for a sport that is not in the programme", () => {
    const problems = coverageProblems(
      ["strength"],
      [
        { sport: "strength", decision: "unchanged", reason: "", sourceIds: [], comparable: true },
        {
          sport: "cycling",
          decision: "changed",
          reason: "Added a ride.",
          sourceIds: [],
          comparable: false,
        },
      ],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("not in this programme");
  });

  it("requires a reason for anything but leaving a sport alone", () => {
    const problems = coverageProblems(
      ["running"],
      [{ sport: "running", decision: "hold", reason: "  ", sourceIds: [], comparable: false }],
    );
    expect(problems[0]?.message).toContain("Say why running");
  });
});

describe("comparable context", () => {
  /** AT-STAT-04: an indoor ride is not an outdoor one. */
  it("keeps indoor and outdoor rides apart", () => {
    expect(
      comparableContext(
        { sport: "cycling", environment: "indoor", assistance: "unassisted" },
        { sport: "cycling", environment: "outdoor", assistance: "unassisted" },
      ),
    ).toBe(false);
  });

  /** AT-LOG-19: missing assistance is never silently unassisted. */
  it("will not compare a ride whose assistance is unknown", () => {
    expect(
      comparableContext(
        { sport: "cycling", environment: "outdoor", assistance: "unknown" },
        { sport: "cycling", environment: "outdoor", assistance: "unassisted" },
      ),
    ).toBe(false);
  });

  /** AT-LOG-05 / §9.1: converting yards to metres does not make two pools one pool. */
  it("keeps a 25 m pool apart from a 25 yd pool", () => {
    expect(
      comparableContext(
        { sport: "swimming", environment: "pool", poolLengthMetres: 25 },
        { sport: "swimming", environment: "pool", poolLengthMetres: 22.86 },
      ),
    ).toBe(false);
  });

  it("compares two swims in the same pool", () => {
    expect(
      comparableContext(
        { sport: "swimming", environment: "pool", poolLengthMetres: 25 },
        { sport: "swimming", environment: "pool", poolLengthMetres: 25 },
      ),
    ).toBe(true);
  });
});

describe("effort ranges", () => {
  it("reads the widest effort a session asks for", () => {
    expect(
      prescriptionEffortRange(
        prescription("running", {
          sessionTargets: {
            durationMs: [30 * MINUTE, 30 * MINUTE],
            distanceMetres: null,
            effort: [2, 3],
          },
          nodes: [
            {
              kind: "step",
              id: "hard",
              phase: "work",
              action: "run",
              target: { kind: "duration", ms: [MINUTE, MINUTE] },
              effort: [4, 5],
              stroke: null,
              notes: null,
            },
          ],
        }),
      ),
    ).toEqual([2, 5]);
  });

  it("returns nothing when no effort was prescribed", () => {
    expect(prescriptionEffortRange(prescription("cycling"))).toBeNull();
  });
});
