import { and, desc, eq, isNotNull } from "drizzle-orm";
import { coachIntakes, equipmentInstances, type CoachingChangeRecord } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { CoachJobResult, JobTarget } from "@/domain/coaching-workflow";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { isAthleteTextSource, type AthleteSource } from "@/domain/coach-memory";
import { assessProgramChange, type ExerciseMuscleReference } from "@/domain/program-change";
import { repCeiling, repTarget, TRAINING_POLICY } from "@/domain/training-evidence";
import {
  difficultyChange,
  harderAllowance,
  stepHarder,
  type LoadLadder,
} from "@/domain/load-steps";
import { WORKING_SET_TYPES } from "@/domain/progression";
import type { CoachingEvidence } from "./coaching-evidence";
import { athleteMemorySources, existingEvidenceIds } from "./coach-memory";
import { planningContext } from "./coach-plans";
import { loadLadders } from "./load-ladders";
import { CoachingError } from "./coaching-state";
import { canConvertLoad, convertLoad } from "@/lib/units";

type ExplainedResult = Exclude<CoachJobResult, { outcome: "deferred" }>;
const different = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** Refuse the whole result outright: nothing further about it can be assessed. */
function fail(message: string): never {
  throw new CoachingError(message, 422);
}

/**
 * Stops checking one exercise, or one set, without stopping the assessment.
 *
 * A worker gets two corrections inside its lease. While these checks threw on the first
 * thing they disliked, a plan with three independent faults spent all three attempts being
 * told about them one at a time and was abandoned with the session unprepared — not because
 * the worker could not fix them, but because it never saw them together. The faults here are
 * independent findings about independent exercises; reporting them as a set is what makes the
 * budget mean what it says.
 */
class Fault extends Error {
  constructor() {
    super("fault");
    this.name = "Fault";
  }
}

type Faults = {
  readonly issues: string[];
  note(message: string): void;
  stop(message: string): never;
  settle(): void;
};

/** Collects what is wrong with a result, in the order it was found, without repeats. */
function faults(): Faults {
  const issues: string[] = [];
  return {
    issues,
    /** Record a fault and carry on: nothing below this check depends on it. */
    note(message: string): void {
      if (!issues.includes(message)) issues.push(message);
    },
    /** Record a fault and abandon the exercise or set it is about, which cannot be read on. */
    stop(message: string): never {
      if (!issues.includes(message)) issues.push(message);
      throw new Fault();
    },
    /** Raised once, naming everything found, so one correction can answer all of it. */
    settle(): void {
      if (issues.length > 0) throw new CoachingError(issues[0]!, 422, issues);
    },
  };
}
const slotScope = (lineageId: string) => `slot:${lineageId}`;

function freshSources(
  evidence: CoachingEvidence,
  scope: string,
  cited: ReadonlySet<string>,
  ids: readonly string[],
) {
  const previous = evidence.changes.flatMap((record) =>
    record.changes
      .filter((change) => change.scope === scope && change.kind !== "temporary")
      .map((change) => ({ change, at: record.createdAt })),
  );
  const used = new Set(previous.flatMap(({ change }) => change.evidenceIds));
  const cutoff = previous.length ? Math.max(...previous.map(({ at }) => at.getTime())) : -Infinity;
  const points = evidence.exerciseTrends
    .flatMap((trend) =>
      trend.observations.map((point) => ({
        id: point.sourceId,
        date: point.date,
        at: point.performedAt,
      })),
    )
    .concat(
      evidence.running.history.map((run) => ({
        id: run.sourceId,
        date: run.date,
        at: run.startedAt,
      })),
    );
  const eligible = points.filter(
    (point) =>
      ids.includes(point.id) &&
      cited.has(point.id) &&
      !used.has(point.id) &&
      new Date(point.at).getTime() > cutoff,
  );
  return {
    ids: [...new Set(eligible.map((point) => point.id))],
    days: new Set(eligible.map((point) => point.date)).size,
  };
}

export async function validateCitedEvidence(db: DbOrTx, userId: string, result: ExplainedResult) {
  const valid = await existingEvidenceIds(db, userId, result.evidence);
  if (result.evidence.some((id) => !valid.has(id)))
    fail(
      "Cite source IDs from the current context, such as workout:<id> or run:<id>; descriptions and other athletes' records are not evidence IDs.",
    );
  return valid;
}

export function assessWeeklyEvidence(
  before: ProgramBlueprint,
  after: ProgramBlueprint,
  evidence: CoachingEvidence,
  cited: ReadonlySet<string>,
  library: readonly ExerciseMuscleReference[],
  now: Date,
) {
  const assessment = assessProgramChange(before, after, library);
  const reasons = [...assessment.doseChanges];
  const changes: CoachingChangeRecord[] = [];
  for (const day of after.days)
    for (const next of day.exercises) {
      const old = before.days
        .flatMap((d) => d.exercises)
        .find((e) => e.lineageId && e.lineageId === next.lineageId);
      if (!old || !next.lineageId || !different(old, next)) continue;
      const numerical = [
        "sets",
        "reps",
        "duration",
        "distance",
        "rir",
        "rest",
        "exerciseSlug",
      ] as const;
      if (!numerical.some((key) => different(old[key], next[key]))) continue;
      const scope = slotScope(next.lineageId);
      const trends = evidence.exerciseTrends.filter(
        (trend) => trend.lineageId === next.lineageId && trend.slug === old.exerciseSlug,
      );
      const reduction =
        next.sets < old.sets ||
        (["reps", "duration", "distance"] as const).some(
          (metric) =>
            old[metric] &&
            next[metric] &&
            next[metric]!.some((value, index) => value < old[metric]![index]!),
        ) ||
        (old.rir && next.rir && next.rir.some((value, index) => value > old.rir![index]!));
      const supported = trends.filter((trend) =>
        reduction ? trend.declineCandidate : trend.repeatedCompletion,
      );
      const fresh = freshSources(
        evidence,
        scope,
        cited,
        supported.flatMap((trend) => trend.evidenceIds),
      );
      if (fresh.days < 2)
        reasons.push(
          `${next.exerciseSlug}: needs two new comparable training dates supporting this change.`,
        );
      changes.push({
        scope,
        kind: "program",
        evidenceIds: fresh.ids,
        exerciseSlug: next.exerciseSlug,
        before: { sets: old.sets },
        after: { sets: next.sets },
      });
    }
  for (const next of after.runs) {
    const old = before.runs.find(
      (run) => run.weekIndex === next.weekIndex && run.dayOfWeek === next.dayOfWeek,
    );
    if (
      !old ||
      (!different(old.duration, next.duration) &&
        !different(old.distanceKm, next.distanceKm) &&
        !different(old.rpe, next.rpe))
    )
      continue;
    const scope = `run:${next.dayOfWeek}`;
    const candidates = evidence.running.history.filter(
      (run) =>
        run.effortReported &&
        run.dayOfWeek === old.dayOfWeek &&
        run.duration >= old.duration[0] * 60 &&
        (!old.distanceKm || run.distance >= old.distanceKm[0] * 1000) &&
        run.rpe !== null &&
        run.rpe >= old.rpe[0] &&
        run.rpe <= old.rpe[1],
    );
    const matching = candidates.filter((run) => run.mode === candidates.at(-1)?.mode);
    const reduction =
      next.duration.some((value, index) => value < old.duration[index]!) ||
      (old.distanceKm &&
        (!next.distanceKm ||
          next.distanceKm.some((value, index) => value < old.distanceKm![index]!))) ||
      next.rpe.some((value, index) => value < old.rpe[index]!);
    if (reduction)
      reasons.push(
        `Run ${next.dayOfWeek}: lasting reductions need review of repeated symptoms, recovery and performance; effort alone cannot establish decline.`,
      );
    const fresh = freshSources(
      evidence,
      scope,
      cited,
      matching.slice(-2).map((run) => run.sourceId),
    );
    if (fresh.days < 2)
      reasons.push(`Run ${next.dayOfWeek}: needs two new runs with comparable effort.`);
    const recentRunChanges = evidence.changes
      .filter(
        (record) =>
          record.createdAt.getTime() >= now.getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
      )
      .flatMap((record) => record.changes)
      .filter((change) => change.scope === scope && change.kind !== "temporary");
    for (const [metric, value] of [
      ["duration", next.duration[1] * 60],
      ["distance", next.distanceKm ? next.distanceKm[1] * 1000 : null],
    ] as const) {
      const original = recentRunChanges.find((change) => change.before[metric])?.before[metric];
      if (
        value !== null &&
        original &&
        Math.abs(value / original - 1) > TRAINING_POLICY.maxRunChange + 1e-9
      )
        reasons.push(
          `Run ${next.dayOfWeek}: combined daily and weekly ${metric} changes over 14 days need review.`,
        );
    }
    changes.push({
      scope,
      kind: "program",
      evidenceIds: fresh.ids,
      before: {
        duration: old.duration[1] * 60,
        ...(old.distanceKm ? { distance: old.distanceKm[1] * 1000 } : {}),
      },
      after: {
        duration: next.duration[1] * 60,
        ...(next.distanceKm ? { distance: next.distanceKm[1] * 1000 } : {}),
      },
    });
  }
  // Compare against the original program before any recent automatic review, not just last week.
  const earliest = evidence.changes.find(
    (record) =>
      record.programBefore &&
      record.createdAt.getTime() >= now.getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
  );
  if (earliest?.programBefore)
    reasons.push(
      ...assessProgramChange(earliest.programBefore, after, library).doseChanges.map(
        (reason) => `Cumulative: ${reason}`,
      ),
    );
  return {
    ...assessment,
    reasons,
    changes,
    automatic: assessment.authority === "automatic" && reasons.length === 0,
  };
}

/** Reject unsupported session changes before any plan, memo or change receipt is stored. */
export async function assessSessionEvidence(
  db: DbOrTx,
  userId: string,
  target: JobTarget,
  result: Extract<CoachJobResult, { outcome: "session" }>,
  evidence: CoachingEvidence,
  cited: ReadonlySet<string>,
) {
  const context = await planningContext(db, userId, { gymId: target.gymId ?? undefined });
  if (context.reason !== null) fail("The target session has no usable planning context.");
  const locations = await db
    .select()
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.userId, userId), eq(equipmentInstances.gymId, target.gymId!)));
  // Each named machine's loads (ADR 0028): what a step is on it, and which way is harder.
  const ladders = await loadLadders(
    db,
    userId,
    result.plan.exercises.flatMap((entry) =>
      entry.equipmentInstanceId &&
      locations.some((machine) => machine.id === entry.equipmentInstanceId)
        ? [entry.equipmentInstanceId]
        : [],
    ),
  );
  const intakes = await db
    .select()
    .from(coachIntakes)
    .where(and(eq(coachIntakes.userId, userId), isNotNull(coachIntakes.confirmedAt)))
    .orderBy(desc(coachIntakes.revision))
    .limit(1);
  const restrictionSource = intakes.some(
    (intake) =>
      intake.confirmedAt && intake.answers.restrictions.trim() && cited.has(`intake:${intake.id}`),
  );
  const temporary = result.adjustment === "temporary";
  // Any note the athlete wrote themselves will do — sent from Tell the coach, left on a
  // finished session, or written against the one exercise it is about. The same three checks
  // apply to all of them: they own it, the quote is really theirs, and they said it recently.
  const constraint = result.reportedConstraint;
  const constraintSources =
    constraint && isAthleteTextSource(constraint.sourceId)
      ? await athleteMemorySources(db, userId, [constraint.sourceId])
      : new Map<string, AthleteSource>();
  const constraintNote = constraint ? constraintSources.get(constraint.sourceId) : undefined;
  const evidenceTime = new Date(evidence.end).getTime();
  const writtenAt = constraintNote ? new Date(constraintNote.createdAt).getTime() : null;
  const noteSource =
    constraintNote &&
    constraint &&
    cited.has(constraint.sourceId) &&
    constraintNote.text.includes(constraint.text) &&
    writtenAt !== null &&
    writtenAt >= evidenceTime - 3 * 86_400_000 &&
    writtenAt <= evidenceTime;
  if (
    temporary &&
    !restrictionSource &&
    !noteSource &&
    !evidence.acuteEvidenceIds.some((id) => cited.has(id))
  )
    fail(
      "A temporary reduction needs a cited current recovery/symptom report or confirmed restriction. Otherwise retain the baseline or ask for input.",
    );
  if (result.plan.memo !== undefined)
    fail(
      "Use the structured memory patch; plan.memo cannot replace the athlete's memo in this contract.",
    );
  const changes: CoachingChangeRecord[] = [];
  const plan: Faults = faults();
  let plannedSets = 0,
    proposedSets = 0;
  // Each exercise is assessed on its own, and a fault in one says nothing about the next.
  // Anything found is collected and the whole list is raised at the end, so a worker that
  // has two corrections to spend is told everything it has to correct while it still has
  // both. Nothing is written from here in any case: `changes` is the caller's to store, and
  // it never reaches the caller when there is a fault.
  for (const entry of result.plan.exercises)
    try {
      const slot = context.exercises.find((item) => item.slotId === entry.slotId);
      if (!slot?.prescription || !slot.lineageId)
        plan.stop("Adding an exercise needs a program proposal for athlete review.");
      const p = slot.prescription;
      const scope = slotScope(slot.lineageId);
      const sets = entry.sets.filter((set) => set.setType !== "warmup");
      // Back-off and drop sets count towards the session's sets, but they are not the work: the
      // plan's working sets are what is compared with the working sets last logged.
      const work = sets.filter((set) => WORKING_SET_TYPES.has(set.setType));
      const count = entry.action === "drop" ? 0 : entry.sets.length ? sets.length : p.sets;
      plannedSets += p.sets;
      proposedSets += count;
      const equipmentChange = entry.action !== "keep" || entry.exerciseSlug !== slot.planned.slug;
      if (
        equipmentChange &&
        !temporary &&
        !(result.adjustment === "equipment" && slot.atThisGym.status !== "direct")
      )
        plan.note(
          `${entry.exerciseSlug}: substitutions or drops need a confirmed equipment constraint, temporary reason, or a program proposal.`,
        );
      if (temporary && count > p.sets)
        plan.note("A temporary recovery adjustment cannot add working sets.");
      if (!temporary && !equipmentChange && count !== p.sets)
        plan.note(
          `${entry.exerciseSlug}: lasting set-count changes belong in the weekly program review. Daily recovery reductions must be explicitly temporary.`,
        );
      if (
        !temporary &&
        !equipmentChange &&
        (Math.abs(count - p.sets) > 1 ||
          Math.abs(count / p.sets - 1) > TRAINING_POLICY.maxExerciseSetChange + 1e-9)
      )
        plan.note(
          `${entry.exerciseSlug}: this set change needs athlete review in a program proposal.`,
        );
      const trend = evidence.exerciseTrends
        .filter(
          (item) =>
            item.lineageId === slot.lineageId &&
            item.slug === entry.exerciseSlug &&
            item.equipmentId === entry.equipmentInstanceId,
        )
        .sort((a, b) =>
          (b.observations[0]?.performedAt ?? "").localeCompare(
            a.observations[0]?.performedAt ?? "",
          ),
        )[0];
      const sameSetup = (change: CoachingChangeRecord) =>
        change.scope === scope &&
        change.exerciseSlug === entry.exerciseSlug &&
        change.equipmentId === entry.equipmentInstanceId;
      const receipts = evidence.changes
        .flatMap((record) =>
          record.changes.filter(sameSetup).map((change) => ({ change, at: record.createdAt })),
        )
        .reverse();
      /**
       * A change's loads and targets are the baseline until the athlete trains past them: the
       * next session after a lasting change, the one lighter session after a temporary one. After
       * that, what was logged is, as it is for the rule (ADR 0039). Otherwise a step the rule took
       * since, up or back, would read as a jump from loads nobody has lifted for weeks.
       */
      const stillStands = ({ change, at }: (typeof receipts)[number]) => {
        const since =
          trend?.observations.filter((point) => new Date(point.performedAt) > at).length ?? 0;
        return change.kind === "temporary" ? since <= 1 : since === 0;
      };
      const unit =
        locations.find((item) => item.id === entry.equipmentInstanceId)?.unit ??
        trend?.loadUnit ??
        "kg";
      const withLoads = receipts.find(
        ({ change }) =>
          (change.kind === "temporary"
            ? change.before.loads?.length
            : change.after.loads?.length) &&
          change.unit &&
          canConvertLoad(change.unit, unit),
      );
      const recent = withLoads && stillStands(withLoads) ? withLoads.change : undefined;
      const retainedLoads = recent
        ? recent.kind === "temporary"
          ? recent.before.loads
          : recent.after.loads
        : undefined;
      const ladder = entry.equipmentInstanceId
        ? (ladders.get(entry.equipmentInstanceId) ?? null)
        : null;
      // Free weights step by the typed jump, as the rule steps them; a machine by its own loads.
      const steps: LoadLadder | null =
        ladder ??
        (slot.weightStep
          ? { known: [], stack: false, assisted: false, increment: slot.weightStep }
          : null);
      const targetRir = p.rir[0] ?? 2;
      // The part of the athlete's body a bodyweight movement lifts, as the evidence read it:
      // a dumbbell step on a split squat is a small part of what is moved (ADR 0040).
      const evidenceBody = trend?.comparison.prescription.bodyLoad ?? 0;
      const bodyLoad =
        evidenceBody > 0 && trend && canConvertLoad(trend.loadUnit, unit)
          ? convertLoad(evidenceBody, trend.loadUnit, unit)
          : 0;
      /**
       * The most reps a set at `load` may be asked for: the top of the range, or past it where the
       * next step is so coarse that stepping at the top would land below the range (ADR 0039).
       */
      const ceilingAt = (load: number | null) =>
        p.type !== "reps" || !p.reps
          ? null
          : repCeiling(
              {
                repMin: p.reps[0] ?? null,
                repMax: p.reps[1] ?? null,
                rirMin: p.rir[0] ?? null,
                rule: p.progressionRule ?? null,
                bodyLoad,
              },
              load,
              load != null && load > 0 && steps ? (stepHarder(steps, load)?.load ?? null) : null,
              steps?.assisted ?? false,
            );
      const latestId = trend?.observations[0]?.sourceId ?? null;
      /** The sessions each change stands on, every one of which must be fresh and cited. */
      const standsOn: string[][] = [];
      // Set-count changes, and changes the older rule supports, need two new training dates.
      let twoDates = count !== p.sets;
      // The evidence reads each performance as it was trained (ADR 0038): the warm-up in front
      // of the work, and a back-off after it, are not the sets the plan is compared with.
      const baselineSets =
        trend?.latestSets.filter((set) => WORKING_SET_TYPES.has(set.setType)) ?? [];
      const baselineLoads =
        retainedLoads?.map((item) => ({
          index: item.index,
          load: convertLoad(item.load, recent!.unit!, unit),
        })) ??
        baselineSets.flatMap((set, index) =>
          set.weight === null ? [] : [{ index, load: set.weight }],
        );
      const baselineLoad = baselineLoads[0]?.load ?? trend?.comparison.load;
      const range = p.type === "reps" ? p.reps : p.type === "duration" ? p.seconds : p.meters;
      const withTargets = receipts.find(
        ({ change }) => change.before.targets?.length || change.after.targets?.length,
      );
      const retainedTarget =
        withTargets && stillStands(withTargets) ? withTargets.change : undefined;
      /**
       * What a working set is asked for when its target does not change: what the last change gave
       * it while that change stands, otherwise what the set did in the latest session, brought
       * inside the programme's range — whether or not that session can support a change. Null
       * where neither says, and any target in the range leaves it unchanged.
       */
      const unchangedTarget = (index: number) => {
        const prior = baselineSets[index];
        const recorded =
          p.type === "reps"
            ? prior?.reps
            : p.type === "duration"
              ? prior?.durationSeconds
              : prior?.distanceMeters;
        const old =
          (retainedTarget?.kind === "temporary"
            ? retainedTarget.before.targets
            : retainedTarget?.after.targets)?.[index] ?? recorded;
        return old == null
          ? null
          : Math.min(range?.[1] ?? Infinity, Math.max(range?.[0] ?? 0, old));
      };
      /**
       * Those targets, as a refused target change names them. Nothing else tells a worker what an
       * unchanged slot is, and one that guesses spends its corrections finding out.
       */
      const heldTargets = () => {
        const each = Array.from({ length: p.sets }, (_, index) => {
          const target = unchangedTarget(index);
          if (target !== null) return String(target);
          return range?.[0] != null && range[1] != null ? `${range[0]}–${range[1]}` : "any";
        });
        const list =
          each.length > 1 ? `${each.slice(0, -1).join(", ")} and ${each.at(-1)}` : each[0];
        const measure = p.type === "reps" ? "reps" : p.type === "duration" ? "seconds" : "metres";
        return `Unchanged, its working ${each.length > 1 ? "sets are" : "set is"} ${list} ${measure}.`;
      };
      const proposedLoads: { index: number; load: number }[] = [];
      const baselineTargets: number[] = [],
        proposedTargets: number[] = [];
      let changedLoad: number | undefined;
      let changedTarget = false;
      let reducedTarget = false;
      for (const [index, set] of work.entries())
        try {
          if (p.type === "reps" && set.rir === null)
            plan.stop(`${entry.exerciseSlug}: include a target RIR for working rep sets.`);
          if (p.type !== "reps" && set.rir !== null)
            plan.stop(`${entry.exerciseSlug}: use RPE for timed/distance work, not RIR.`);
          if (p.type !== "reps" && set.rpe == null)
            plan.stop(`${entry.exerciseSlug}: include target RPE for timed/distance work.`);
          if (p.type === "reps" && p.rir[0] != null && set.rir! < p.rir[0])
            plan.note("A daily plan cannot increase effort beyond the program's target RIR.");
          if (!temporary && p.type === "reps" && p.rir[1] != null && set.rir! > p.rir[1] + 1)
            plan.note("A lasting effort reduction needs program review.");
          const value =
            p.type === "reps"
              ? set.reps
              : p.type === "duration"
                ? set.durationSeconds
                : set.distanceMeters;
          const setBaseline =
            baselineLoads.find((item) => item.index === index)?.load ?? baselineLoad;
          const loadIncreases =
            set.weight != null &&
            setBaseline != null &&
            setBaseline > 0 &&
            Math.abs(set.weight - setBaseline) >= 0.05 &&
            difficultyChange(ladder, setBaseline, set.weight) > 0;
          // A step that missed the range twice in its first three sessions goes back to the load
          // before it (ADR 0039): that load, for this set, is supported by the misses themselves.
          const revertLoad = trend?.revert
            ? (trend.revert.loads[index] ?? trend.revert.load)
            : null;
          const reverting =
            !temporary &&
            set.weight != null &&
            revertLoad !== null &&
            setBaseline != null &&
            Math.abs(set.weight - setBaseline) >= 0.05 &&
            Math.abs(set.weight - revertLoad) < 0.05;
          // At the same load a set may build past the top where the next step is coarse.
          const sameLoadAsBefore =
            set.weight != null && setBaseline != null && Math.abs(set.weight - setBaseline) < 0.05;
          const top =
            range?.[1] != null && sameLoadAsBefore
              ? Math.max(range[1], ceilingAt(setBaseline) ?? range[1])
              : (range?.[1] ?? null);
          if (
            !equipmentChange &&
            value !== null &&
            range &&
            ((!temporary && range[0] != null && value < range[0]) || (top != null && value > top))
          )
            plan.note(
              `${entry.exerciseSlug}: targets outside the program range need a program review.`,
            );
          const priorSet = baselineSets[index];
          const targetBaseline = unchangedTarget(index);
          if (targetBaseline !== null) baselineTargets.push(targetBaseline);
          if (value !== null) proposedTargets.push(value);
          if (
            !equipmentChange &&
            value !== null &&
            targetBaseline !== null &&
            value !== targetBaseline &&
            !loadIncreases &&
            !reverting
          ) {
            const delta = value - targetBaseline;
            // What the set had in hand last time, at the target effort, is a target the latest
            // session supports on its own (ADR 0039): 8 reps with 3 in reserve at a 2 RIR target
            // is 9. Never past the top, or the ceiling a coarse next step sets.
            const inHand =
              p.type === "reps" && priorSet?.reps != null && priorSet.rir != null
                ? repTarget(priorSet, targetRir, top ?? Infinity)
                : null;
            const fromCapacity =
              !temporary && delta > 0 && inHand !== null && value <= inHand && latestId !== null;
            if (temporary && delta > 0)
              plan.note(
                "A temporary recovery adjustment cannot increase reps, duration or distance.",
              );
            // One rep a session is slower than the evidence earns. Somebody who has twice held the
            // top of the range at the prescribed effort has shown the whole range, so the target may
            // go straight to it; anyone else clearing the range twice moves up to two. Cuts stay at
            // one rep, behind the decline test: chase a good session, never flinch at a bad one. The
            // range check above still caps every step at what the programme actually prescribes.
            const step =
              p.type !== "reps"
                ? targetBaseline * 0.1
                : delta < 0
                  ? 1
                  : trend?.progressionReady && range?.[1] != null
                    ? Math.max(1, range[1] - targetBaseline)
                    : TRAINING_POLICY.maxRepIncrease;
            if (fromCapacity) standsOn.push([latestId]);
            else if (!temporary) {
              twoDates = true;
              if (
                Math.abs(delta) > step + 1e-9 ||
                !(delta > 0 ? trend?.repeatedCompletion : trend?.declineCandidate)
              )
                plan.note(
                  `${entry.exerciseSlug}: target changes need repeated comparable evidence and a small step. ${heldTargets()}`,
                );
            }
            changedTarget = true;
            reducedTarget ||= delta < 0;
          }
          if (set.weight === null) {
            if (setBaseline != null && !equipmentChange && result.adjustment !== "calibration")
              plan.note(
                `${entry.exerciseSlug}: retain the known load, or explicitly request recalibration.`,
              );
            continue;
          }
          proposedLoads.push({ index, load: set.weight });
          const sameLoad = sameLoadAsBefore;
          // At home only a load known to exist on that equipment will do: listed, or lifted.
          if (
            context.gym.kind === "home" &&
            set.weight > 0 &&
            !sameLoad &&
            !ladder?.known.some((load) => Math.abs(load - set.weight!) < 0.005)
          )
            plan.note(
              `${entry.exerciseSlug}: use a load this home equipment is known to have, or an unknown-load calibration target.`,
            );
          if (setBaseline == null || setBaseline <= 0) {
            if (set.weight === 0) continue;
            if (result.adjustment !== "calibration")
              plan.note(
                `${entry.exerciseSlug}: no comparable starting load; use calibration with a feasible load or leave load unknown.`,
              );
            continue;
          }
          if (sameLoad) continue;
          // Positive is harder. On an assisted machine that is less help, so a step down the
          // number is the progression and a step up it is the cut (ADR 0028).
          const delta = difficultyChange(ladder, setBaseline, set.weight);
          const harderWhileRecovering = temporary && delta > 0;
          // The percentage or one real step of this machine, whichever is larger, so the only
          // step a lift has is never the step that is forbidden. Going back to the load before a
          // step that did not hold is that same step, however coarse.
          const beyondLimit =
            !temporary &&
            (delta > harderAllowance(TRAINING_POLICY.maxLoadIncrease, setBaseline, steps) + 1e-9 ||
              (delta < -TRAINING_POLICY.maxLoadReduction - 1e-9 && !reverting));
          // A step up stands on a rep to spare in the latest session, or on target in the two
          // latest (ADR 0039); a cut on a confirmed decline, or on a step that did not hold.
          const unsupported =
            !temporary &&
            !(delta > 0
              ? trend?.loadReady || trend?.progressionReady
              : trend?.declineCandidate || reverting);
          if (!temporary && !unsupported) {
            if (delta > 0 && trend?.loadReady) standsOn.push(trend.stepEvidenceIds);
            else if (reverting) standsOn.push(trend!.revert!.evidenceIds);
            else twoDates = true;
          }
          if (harderWhileRecovering)
            plan.note("A temporary recovery adjustment cannot make the load harder.");
          if (beyondLimit)
            plan.note(
              `${entry.exerciseSlug}: the load change exceeds the automatic limit and needs review.`,
            );
          if (unsupported)
            plan.note(
              `${entry.exerciseSlug}: the change is not supported by repeated comparable performance.`,
            );
          const originalPerformance = trend?.observations
            .filter(
              (point) =>
                new Date(point.performedAt).getTime() >=
                new Date(evidence.end).getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
            )
            .at(-1);
          const originalLoad = originalPerformance?.loadProfile[index];
          if (!temporary && originalLoad != null && originalLoad > 0) {
            const totalChange = difficultyChange(ladder, originalLoad, set.weight);
            if (
              totalChange >
                harderAllowance(
                  TRAINING_POLICY.maxCumulativeLoadIncrease,
                  originalLoad,
                  steps,
                  TRAINING_POLICY.maxCumulativeLoadSteps,
                ) +
                  1e-9 ||
              (totalChange < -TRAINING_POLICY.maxCumulativeLoadReduction - 1e-9 && !reverting)
            )
              plan.note(
                `${entry.exerciseSlug}: the combined changes from the logged load over 14 days need review.`,
              );
          }
          const earliest = evidence.changes
            .filter(
              (record) =>
                record.createdAt.getTime() >=
                new Date(evidence.end).getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
            )
            .flatMap((record) => record.changes)
            .find(
              (change) =>
                sameSetup(change) &&
                change.kind !== "temporary" &&
                change.before.loads?.length &&
                change.unit &&
                canConvertLoad(change.unit, unit),
            );
          const original = earliest?.before.loads?.find((item) => item.index === index);
          if (!temporary && original && original.load > 0) {
            const from = convertLoad(original.load, earliest!.unit!, unit);
            const cumulative = difficultyChange(ladder, from, set.weight);
            if (
              cumulative >
                harderAllowance(
                  TRAINING_POLICY.maxCumulativeLoadIncrease,
                  from,
                  steps,
                  TRAINING_POLICY.maxCumulativeLoadSteps,
                ) +
                  1e-9 ||
              (cumulative < -TRAINING_POLICY.maxCumulativeLoadReduction - 1e-9 && !reverting)
            )
              plan.note(
                `${entry.exerciseSlug}: the combined load changes over 14 days need review.`,
              );
          }
          changedLoad = set.weight;
        } catch (error) {
          if (!(error instanceof Fault)) throw error;
        }
      // A back-off or drop set is lighter than the work by what it is. One written heavier than
      // the work would be a load change under another name.
      if (
        baselineLoad != null &&
        baselineLoad > 0 &&
        sets.some(
          (set) =>
            !WORKING_SET_TYPES.has(set.setType) &&
            set.weight != null &&
            difficultyChange(ladder, baselineLoad, set.weight) > 1e-9,
        )
      )
        plan.note(
          `${entry.exerciseSlug}: back-off and drop sets cannot be heavier than the working sets.`,
        );
      if (count !== p.sets || changedLoad !== undefined || changedTarget || equipmentChange) {
        const fresh = freshSources(evidence, scope, cited, [
          ...(trend?.evidenceIds ?? []),
          ...standsOn.flat(),
        ]);
        if (!temporary && !equipmentChange && (twoDates || standsOn.length === 0) && fresh.days < 2)
          plan.note(
            `${entry.exerciseSlug}: cite two new comparable training dates; the same evidence cannot justify another change.`,
          );
        // A change that stands on particular sessions needs exactly those, cited and unused.
        const missing = [...new Set(standsOn.flat().filter((id) => !fresh.ids.includes(id)))];
        if (!temporary && !equipmentChange && missing.length > 0)
          plan.note(
            `${entry.exerciseSlug}: this change stands on ${missing.join(", ")}; cite ${missing.length === 1 ? "it" : "them"}, and only evidence new since the last accepted change. The same evidence cannot justify another change.`,
          );
        changes.push({
          scope,
          kind: temporary
            ? "temporary"
            : count < p.sets ||
                reducedTarget ||
                (changedLoad !== undefined &&
                  (baselineLoad ?? 0) > 0 &&
                  difficultyChange(ladder, baselineLoad!, changedLoad) < 0)
              ? "reduction"
              : "progression",
          unit,
          exerciseSlug: entry.exerciseSlug,
          equipmentId: entry.equipmentInstanceId,
          evidenceIds: temporary ? [...cited] : fresh.ids,
          before: {
            sets: p.sets,
            loads: baselineLoads,
            targets: baselineTargets,
            ...(baselineLoad != null ? { load: baselineLoad } : {}),
          },
          after: {
            sets: count,
            loads: proposedLoads,
            targets: proposedTargets,
            ...(proposedLoads[0] ? { load: proposedLoads[0].load } : {}),
          },
        });
      }
    } catch (error) {
      if (!(error instanceof Fault)) throw error;
    }
  if (
    !temporary &&
    result.adjustment !== "equipment" &&
    plannedSets > 0 &&
    Math.abs(proposedSets / plannedSets - 1) > TRAINING_POLICY.maxTotalSetChange + 1e-9
  )
    plan.note("The total session set change exceeds 20%; prepare a program proposal for review.");
  // The run is one more independent finding, assessed whatever the exercises turned up.
  if (result.plan.run)
    try {
      const run = result.plan.run;
      if (run.rpe === null) plan.stop("Include the target effort for the run, out of five.");
      const runPrescription = context.slot.runTarget;
      if (
        runPrescription &&
        ((runPrescription.rpeMax != null && run.rpe > runPrescription.rpeMax) ||
          (!temporary && runPrescription.rpeMin != null && run.rpe < runPrescription.rpeMin))
      )
        plan.note("The run effort is outside the program range and needs review.");
      if (
        runPrescription &&
        run.durationMinutes != null &&
        ((!temporary && run.durationMinutes < runPrescription.durationMinMinutes) ||
          run.durationMinutes > runPrescription.durationMaxMinutes)
      )
        plan.note("The run duration is outside the program range and needs review.");
      if (
        runPrescription &&
        (runPrescription.distanceMinKm != null || runPrescription.distanceMaxKm != null) &&
        (run.distanceKm === null ||
          (!temporary &&
            runPrescription.distanceMinKm != null &&
            run.distanceKm < runPrescription.distanceMinKm) ||
          (runPrescription.distanceMaxKm != null && run.distanceKm > runPrescription.distanceMaxKm))
      )
        plan.note("The run distance is outside the program range and needs review.");
      const history = evidence.running.history.filter(
        (item) =>
          item.effortReported &&
          item.dayOfWeek === context.slot.dayOfWeek &&
          item.mode === run.mode &&
          item.rpe !== null &&
          run.rpe !== null &&
          // Five steps apart, 2 and 3 are an easy run and a moderate one: only the same
          // reported effort compares. (±1 was written for the old ten-step scale.)
          item.rpe === run.rpe,
      );
      const last = history[history.length - 1];
      const scope = `run:${context.slot.dayOfWeek}`;
      const prior = evidence.changes
        .flatMap((record) =>
          record.changes.filter(
            (change) => change.scope === scope && (!change.runMode || change.runMode === run.mode),
          ),
        )
        .at(-1);
      const retained = prior?.kind === "temporary" ? prior.before : prior?.after;
      const baseline = {
        duration: retained?.duration ?? last?.duration,
        distance: retained?.distance ?? last?.distance,
      };
      const distance = run.distanceKm === null ? null : run.distanceKm * 1000;
      const duration = run.durationMinutes === null ? null : run.durationMinutes * 60;
      const longest = evidence.running.longestDistance30Days;
      if (
        distance !== null &&
        longest !== null &&
        distance > longest * (1 + TRAINING_POLICY.maxRunChange) + 1e-9
      )
        plan.note(
          "This run exceeds the automatic limit relative to the longest run in the last 30 days. Ask for review; the limit is not a safety guarantee.",
        );
      const deltas = [
        duration !== null && baseline.duration ? duration / baseline.duration - 1 : 0,
        distance !== null && baseline.distance ? distance / baseline.distance - 1 : 0,
      ];
      if (deltas.some((delta) => Math.abs(delta) > 0.001)) {
        if (!temporary && deltas.some((delta) => delta < -0.001))
          plan.note(
            "Lasting running reductions need program review; use a supported temporary adjustment for current recovery.",
          );
        if (
          deltas.some((delta) =>
            temporary ? delta > 0 : Math.abs(delta) > TRAINING_POLICY.maxRunChange + 1e-9,
          )
        )
          plan.note(
            "This run change exceeds the automatic limit; retain the baseline or ask for review.",
          );
        const original = evidence.changes
          .filter(
            (record) =>
              record.createdAt.getTime() >=
              new Date(evidence.end).getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
          )
          .flatMap((record) => record.changes)
          .find(
            (change) =>
              change.scope === scope &&
              change.kind !== "temporary" &&
              (!change.runMode || change.runMode === run.mode),
          );
        if (
          !temporary &&
          original &&
          [
            duration !== null && original.before.duration
              ? Math.abs(duration / original.before.duration - 1)
              : 0,
            distance !== null && original.before.distance
              ? Math.abs(distance / original.before.distance - 1)
              : 0,
          ].some((delta) => delta > TRAINING_POLICY.maxRunChange + 1e-9)
        )
          plan.note("The combined run changes over 14 days exceed the automatic limit.");
        const fresh = freshSources(
          evidence,
          scope,
          cited,
          history.slice(-2).map((item) => item.sourceId),
        );
        if (!temporary && fresh.days < 2)
          plan.note("Changing this run needs two new comparable running dates.");
        changes.push({
          scope,
          runMode: run.mode,
          kind: temporary
            ? "temporary"
            : deltas.some((delta) => delta > 0)
              ? "progression"
              : "reduction",
          evidenceIds: temporary ? [...cited] : fresh.ids,
          before: baseline,
          after: {
            ...(duration !== null ? { duration } : {}),
            ...(distance !== null ? { distance } : {}),
          },
        });
      }
    } catch (error) {
      if (!(error instanceof Fault)) throw error;
    }
  plan.settle();
  return changes;
}
