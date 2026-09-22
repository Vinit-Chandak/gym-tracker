import type { ActivitySport, EnduranceSport } from "./activity";
import { expandSteps, type EndurancePrescription } from "./activity-prescription";
import { jsonEqual } from "./json-equal";
import { TRAINING_POLICY } from "./training-evidence";

/**
 * What the coach may change on its own, sport by sport (plan §8.3, COACH-05).
 *
 * Running's percentages are running's. They were chosen against running evidence — weekly
 * distance, longest run, a shin that complains — and nothing about them transfers to a pool
 * or a turbo trainer. So cycling and swimming get no borrowed ceiling at all. What they get
 * instead is narrower and honest: the coach may move a target only inside a range the athlete
 * has already seen and approved in the active prescription. Ask for 30–40 minutes and the
 * coach may pick 38 next week without asking. Ask for 30 minutes flat and there is no range
 * to move inside, so any change is a proposal.
 *
 * Everything that changes what the session *is* — the environment, the assistance, the
 * stroke, the pool, the equipment assumption, the sport itself — is a proposal whatever the
 * numbers do. A ride moved indoors is not the same ride at 95% of the distance.
 *
 * This is a permissions policy. It decides who may act, not what good training is.
 */

/** The constituent policy versions this revision is made of (plan §8.1). */
export const SPORT_POLICY_VERSIONS: Record<ActivitySport, string> = {
  strength: TRAINING_POLICY.version,
  running: TRAINING_POLICY.version,
  cycling: "2026-09-19.cycling-1",
  swimming: "2026-09-19.swimming-1",
};

/** The named revision the whole multisport policy travels under. */
export const MULTISPORT_POLICY_REVISION = "multisport-v1";

export type ChangeAuthority = "unchanged" | "automatic" | "review_required";

export type SportChangeReason = {
  /** Where the difference is, in prescription terms: `sessionTargets.durationMs`, `nodes.3`. */
  path: string;
  message: string;
};

export type SportChangeAssessment = {
  policyRevision: string;
  sport: EnduranceSport;
  sportPolicyVersion: string;
  authority: ChangeAuthority;
  /** Why review is needed. Empty when the change is automatic or nothing moved. */
  reasons: SportChangeReason[];
};

type Range = readonly [number, number];

/**
 * Content equality, not encoding equality.
 *
 * The approved prescription comes out of a `jsonb` column and the proposed one out of the
 * schema, and those two disagree about what order an object's keys go in. Comparing them by
 * `JSON.stringify` reported every running block as rewritten — including one echoed back
 * verbatim — and refused the preparation as a proposal the athlete had to read. See
 * `jsonEqual`.
 */
const same = jsonEqual;

/**
 * Whether a proposed range stays inside what was approved.
 *
 * Narrowing is allowed — picking 38 minutes out of "30 to 40" is the whole point — and so is
 * leaving it exactly as it was. Widening is not: the athlete approved a ceiling, and moving
 * the ceiling is a new agreement, however small the move.
 */
function insideApproved(approved: Range | null, proposed: Range | null): boolean {
  if (proposed === null) return approved === null;
  if (approved === null) return false;
  return proposed[0] >= approved[0] && proposed[1] <= approved[1];
}

/** A step's identity: what it is, not how much of it. Changing any of this needs approval. */
function stepIdentity(step: {
  phase: string;
  action: string;
  stroke: string | null;
  target: { kind: string };
}) {
  return [step.phase, step.action, step.stroke, step.target.kind];
}

function targetRange(
  target: { kind: "duration"; ms: Range } | { kind: "distance"; metres: Range },
) {
  return target.kind === "duration" ? target.ms : target.metres;
}

/**
 * Classifies the difference between the prescription the athlete approved and the one the
 * coach wants to put in its place.
 *
 * The approved prescription is the authority, not the previous one the coach wrote: a chain of
 * automatic 9% moves must not walk a session somewhere nobody agreed to, so each one is
 * measured against what was actually confirmed (§8.3).
 */
export function assessSportChange(
  approved: EndurancePrescription,
  proposed: EndurancePrescription,
): SportChangeAssessment {
  const sport = proposed.sport;
  const base = {
    policyRevision: MULTISPORT_POLICY_REVISION,
    sport,
    sportPolicyVersion: SPORT_POLICY_VERSIONS[sport],
  };
  const reasons: SportChangeReason[] = [];

  if (approved.sport !== proposed.sport)
    return {
      ...base,
      authority: "review_required",
      reasons: [
        {
          path: "sport",
          message: "Changing the sport of a scheduled session needs the athlete's approval.",
        },
      ],
    };

  if (same(approved, proposed)) return { ...base, authority: "unchanged", reasons: [] };

  for (const [key, label] of [
    ["durationMs", "duration"],
    ["distanceMetres", "distance"],
    ["effort", "effort"],
  ] as const) {
    const before = approved.sessionTargets[key];
    const after = proposed.sessionTargets[key];
    if (same(before, after)) continue;
    if (!insideApproved(before, after))
      reasons.push({
        path: `sessionTargets.${key}`,
        message:
          before === null
            ? `The approved session has no ${label} range to choose inside, so a new ${label} target is a proposal.`
            : `A ${label} target outside the approved ${before[0]}–${before[1]} range is a proposal.`,
      });
  }

  // Running keeps its own instructions, including the stop rule that guards a niggle. A coach
  // may write one; it is never automatic, because it is advice the athlete has to have read.
  if (!same(approved.running, proposed.running))
    reasons.push({
      path: "running",
      message: "Running pace, progression and stop-rule guidance is shown to the athlete first.",
    });
  if (!same(approved.instructions, proposed.instructions))
    reasons.push({
      path: "instructions",
      message: "New session instructions are shown to the athlete first.",
    });

  const beforeNodes = approved.nodes;
  const afterNodes = proposed.nodes;
  if (beforeNodes.length !== afterNodes.length) {
    reasons.push({
      path: "nodes",
      message: "Adding or removing steps changes the structure of the session.",
    });
  } else {
    afterNodes.forEach((node, index) => {
      const before = beforeNodes[index]!;
      const path = `nodes.${index}`;
      if (before.kind !== node.kind) {
        reasons.push({ path, message: "A step cannot become a repeat block on its own." });
        return;
      }
      if (node.kind === "step" && before.kind === "step") {
        if (!same(stepIdentity(before), stepIdentity(node)))
          reasons.push({ path, message: "What a step asks the athlete to do needs approval." });
        if (!insideApproved(targetRange(before.target), targetRange(node.target)))
          reasons.push({
            path: `${path}.target`,
            message: "A step target outside its approved range is a proposal.",
          });
        if (!insideApproved(before.effort, node.effort))
          reasons.push({
            path: `${path}.effort`,
            message: "A step effort outside its approved range is a proposal.",
          });
        return;
      }
      if (node.kind === "repeat" && before.kind === "repeat") {
        // Repetitions are a number the athlete approved, not a range, so the only automatic
        // move is downwards: doing fewer of something already agreed to.
        if (node.repetitions > before.repetitions)
          reasons.push({
            path: `${path}.repetitions`,
            message: `More than the approved ${before.repetitions} repetitions is a proposal.`,
          });
        if (
          node.restBetweenMs !== before.restBetweenMs &&
          (before.restBetweenMs === null ||
            node.restBetweenMs === null ||
            node.restBetweenMs < before.restBetweenMs)
        )
          reasons.push({
            path: `${path}.restBetweenMs`,
            message: "Shortening or introducing prescribed rest is a proposal.",
          });
        if (node.steps.length !== before.steps.length) {
          reasons.push({
            path: `${path}.steps`,
            message: "Adding or removing steps inside a block changes its structure.",
          });
          return;
        }
        node.steps.forEach((step, stepIndex) => {
          const previous = before.steps[stepIndex]!;
          const stepPath = `${path}.steps.${stepIndex}`;
          if (!same(stepIdentity(previous), stepIdentity(step)))
            reasons.push({
              path: stepPath,
              message: "What a step asks the athlete to do needs approval.",
            });
          if (!insideApproved(targetRange(previous.target), targetRange(step.target)))
            reasons.push({
              path: `${stepPath}.target`,
              message: "A step target outside its approved range is a proposal.",
            });
          if (!insideApproved(previous.effort, step.effort))
            reasons.push({
              path: `${stepPath}.effort`,
              message: "A step effort outside its approved range is a proposal.",
            });
        });
      }
    });
  }

  return {
    ...base,
    authority: reasons.length > 0 ? "review_required" : "automatic",
    reasons,
  };
}

/**
 * What a sport needs to know before it can be prescribed at all (plan §8.3).
 *
 * Missing essentials are a question, never a guess. A swimmer who has never said where they
 * swim cannot be given an open-water session, and a rider with no logged rides has no
 * comparable actual to progress from — in both cases the honest answer is to ask or to leave
 * the prescription alone, not to invent a capability.
 */
export type SportPrerequisite = {
  id: string;
  question: string;
};

export const SPORT_PREREQUISITES: Record<EnduranceSport, readonly SportPrerequisite[]> = {
  running: [
    { id: "running_environment", question: "Do they run outdoors, on a treadmill, or both?" },
    { id: "running_recent", question: "What have they actually run recently, and how far?" },
  ],
  cycling: [
    {
      id: "cycling_environment",
      question: "Do they ride outdoors, indoors, or both, and on what?",
    },
    {
      id: "cycling_assistance",
      question: "Is the bike assisted? An e-bike's speed is not an unassisted rider's.",
    },
    { id: "cycling_time", question: "How long can a ride be, on the days they can ride?" },
  ],
  swimming: [
    {
      id: "swimming_environment",
      question: "Pool or open water? An open-water plan is not a pool plan.",
    },
    { id: "swimming_pool", question: "What length is the pool they use, in metres or yards?" },
    { id: "swimming_ability", question: "How far can they currently swim without stopping?" },
  ],
};

export type SportEvidence = {
  sport: EnduranceSport;
  /** Actuals inside the review window that can be compared with each other. */
  comparableActuals: number;
  /** Of those, how many carry an effort the athlete actually reported. */
  confirmedEffortActuals: number;
  /** Answers the athlete has given about this sport, by prerequisite id. */
  answered: readonly string[];
};

export type SportReadiness = {
  sport: EnduranceSport;
  /** Whether there is enough to change a prescription automatically at all. */
  canProgress: boolean;
  /** What is missing, as questions to put to the athlete. */
  questions: SportPrerequisite[];
  /** Why progression is held, when it is. */
  holds: string[];
};

/**
 * Whether this sport's evidence supports moving a target, and what to ask if it does not.
 *
 * Two comparable, confirmed sessions is the same bar strength and running already hold to
 * (TRAINING_POLICY.confirmationExposures); what differs is that an unconfirmed endurance
 * effort is not evidence of anything, because a number copied from a target says nothing
 * about how the session went (LOG-03).
 */
export function sportReadiness(evidence: SportEvidence): SportReadiness {
  const required = SPORT_PREREQUISITES[evidence.sport];
  const answered = new Set(evidence.answered);
  const questions = required.filter((prerequisite) => !answered.has(prerequisite.id));
  const holds: string[] = [];
  if (questions.length > 0)
    holds.push("Essential information about this sport has not been given yet.");
  if (evidence.comparableActuals < TRAINING_POLICY.confirmationExposures)
    holds.push(
      `Progression needs ${TRAINING_POLICY.confirmationExposures} comparable sessions; there ${
        evidence.comparableActuals === 1 ? "is 1" : `are ${evidence.comparableActuals}`
      }.`,
    );
  else if (evidence.confirmedEffortActuals < TRAINING_POLICY.confirmationExposures)
    holds.push(
      "The recent sessions do not carry reported effort, so how they went is not established.",
    );
  return { sport: evidence.sport, canProgress: holds.length === 0, questions, holds };
}

/**
 * What one sport's review has to say for itself (plan §8.2 item 7).
 *
 * Every included sport returns one of these, whether or not anything changed and whether or
 * not there was much to read. Sparse evidence produces a hold with a reason; it never
 * produces silence, because a sport missing from the coverage list is indistinguishable from
 * a sport the review forgot (AT-COACH-02).
 */
export type SportCoverage = {
  sport: ActivitySport;
  decision: "changed" | "unchanged" | "hold" | "question";
  /** Why, in the athlete's terms. */
  reason: string;
  /** Evidence identifiers the decision rests on. */
  sourceIds: readonly string[];
  /** Whether the actuals read could be compared with each other. */
  comparable: boolean;
};

export type CoverageProblem = { sport: ActivitySport; message: string };

/** Sports the review had to cover but did not, and coverage it returned for ones it may not. */
export function coverageProblems(
  includedSports: readonly ActivitySport[],
  coverage: readonly SportCoverage[],
): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  const covered = new Set(coverage.map((entry) => entry.sport));
  for (const sport of includedSports)
    if (!covered.has(sport))
      problems.push({ sport, message: `The review says nothing about ${sport}.` });
  const included = new Set(includedSports);
  for (const entry of coverage)
    if (!included.has(entry.sport))
      problems.push({
        sport: entry.sport,
        message: `${entry.sport} is not in this programme, so the review cannot assess it.`,
      });
  for (const entry of coverage)
    if (entry.decision !== "unchanged" && entry.reason.trim().length === 0)
      problems.push({
        sport: entry.sport,
        message: `Say why ${entry.sport} was decided that way.`,
      });
  return problems;
}

/**
 * Whether a prescription can be compared with another for progression purposes.
 *
 * Two rides are comparable when they were ridden the same way. Indoors and outdoors are not
 * the same ride; an assisted bike is not an unassisted one; a 25 m pool and open water are
 * not the same swim, and converting yards to metres does not make two pools one pool (§9.1).
 */
export type PerformanceContext = {
  sport: EnduranceSport;
  environment: string | null;
  assistance?: string | null;
  stroke?: string | null;
  poolLengthMetres?: number | null;
};

export function comparableContext(a: PerformanceContext, b: PerformanceContext): boolean {
  if (a.sport !== b.sport) return false;
  if (a.environment === null || b.environment === null) return false;
  if (a.environment !== b.environment) return false;
  if (a.sport === "cycling") {
    if (!a.assistance || !b.assistance) return false;
    if (a.assistance === "unknown" || b.assistance === "unknown") return false;
    if (a.assistance !== b.assistance) return false;
  }
  if (a.sport === "swimming" && a.environment === "pool") {
    if (a.poolLengthMetres == null || b.poolLengthMetres == null) return false;
    if (Math.abs(a.poolLengthMetres - b.poolLengthMetres) > 1e-6) return false;
  }
  return true;
}

/** Steps an athlete is actually being asked to perform, for a prescription's own summary. */
export function prescriptionEffortRange(prescription: EndurancePrescription): Range | null {
  const efforts: Range[] = [];
  for (const range of [
    prescription.sessionTargets.effort,
    ...expandSteps(prescription).map((step) => step.effort),
  ])
    if (range !== null) efforts.push(range);
  if (efforts.length === 0) return null;
  return [
    Math.min(...efforts.map((range) => range[0])),
    Math.max(...efforts.map((range) => range[1])),
  ];
}
