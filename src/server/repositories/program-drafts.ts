import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  coachIntakes,
  coachJobs,
  coachPreferences,
  equipmentInstances,
  exerciseEquipmentOptions,
  exercises,
  programDays,
  programDrafts,
  programExercises,
  programRuns,
  programSlotEvents,
  programs,
  sessionPlans,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  programBlueprintSchema,
  blueprintExerciseSlugs,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";
import { assessProgramChange } from "@/domain/program-change";
import { openingPlanSchema, type OpeningPlan } from "@/domain/coaching-workflow";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { libraryAtGym, nextTrainingSlot, storePlan } from "./coach-plans";
import { assertNoOpenWorkout, CoachingError, sourceRevision } from "./coaching-state";
import { createProgramFromBlueprint, readProgramBlueprint } from "./programs";
import { getActiveProgram, getSchedule } from "./schedule";
import { PLAN_LIMITS } from "@/domain/plan-limits";

export type ProgramDraft = typeof programDrafts.$inferSelect;

export async function copyProgramToDraft(
  db: DbOrTx,
  userId: string,
  programId: string,
  duplicate: boolean,
) {
  const current = await readProgramBlueprint(db, userId, programId);
  if (!current) throw new CoachingError("Programme not found.", 404);
  const blueprint = structuredClone(current.blueprint);
  if (duplicate) {
    blueprint.slug = `manual-${crypto.randomUUID()}`;
    blueprint.name = `${blueprint.name.slice(0, 113)} (copy)`;
    for (const day of blueprint.days)
      for (const exercise of day.exercises) delete exercise.lineageId;
  } else if ((await getActiveProgram(db, userId))?.id !== programId)
    throw new CoachingError(
      "Only the active programme can be edited as a future version. Duplicate an archived programme to start a new block.",
    );
  return saveManualDraft(db, userId, blueprint);
}

export async function archiveActiveProgram(db: DbOrTx, userId: string, programId: string) {
  await assertNoOpenWorkout(db, userId);
  const [archived] = await db
    .update(programs)
    .set({ status: "archived" })
    .where(
      and(eq(programs.id, programId), eq(programs.userId, userId), eq(programs.status, "active")),
    )
    .returning({ id: programs.id });
  if (!archived) throw new CoachingError("That programme is no longer active.");
  await db
    .update(coachJobs)
    .set({
      status: "superseded",
      error: "The programme was archived.",
      completedAt: new Date(),
      leaseUntil: null,
    })
    .where(and(eq(coachJobs.userId, userId), inArray(coachJobs.status, ["queued", "claimed"])));
  await db
    .update(programDrafts)
    .set({ status: "superseded" })
    .where(
      and(
        eq(programDrafts.userId, userId),
        eq(programDrafts.baseProgramId, programId),
        inArray(programDrafts.status, ["editing", "ready"]),
      ),
    );
  await db
    .update(sessionPlans)
    .set({ status: "superseded" })
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, programId),
        eq(sessionPlans.status, "active"),
      ),
    );
  return archived;
}

export async function validateBlueprintForAthlete(
  db: DbOrTx,
  userId: string,
  input: unknown,
  gymId?: string | null,
) {
  const blueprint = programBlueprintSchema.parse(input);
  const [library, warmups, [preference]] = await Promise.all([
    db
      .select()
      .from(exercises)
      .where(
        and(
          eq(exercises.isActive, true),
          or(isNull(exercises.userId), eq(exercises.userId, userId)),
        ),
      ),
    sharedWarmupProtocols(db),
    db.select().from(coachPreferences).where(eq(coachPreferences.userId, userId)),
  ]);
  const slugs = new Set(library.map((e) => e.slug));
  if (blueprintExerciseSlugs(blueprint).some((slug) => !slugs.has(slug)))
    throw new CoachingError(
      "This programme refers to an exercise that is no longer available.",
      422,
    );
  const ordered = [...blueprint.days].sort((a, b) => a.dayIndex - b.dayIndex);
  if (ordered.some((day, i) => day.dayIndex !== i + 1))
    throw new CoachingError("Programme days must be numbered consecutively, starting at one.", 422);
  for (const day of blueprint.days) {
    if (day.exercises.length > PLAN_LIMITS.exercises)
      throw new CoachingError(
        `Use no more than ${PLAN_LIMITS.exercises} exercises per training day.`,
        422,
      );
    if (!warmups.some((w) => w.slug === day.warmupSlug))
      throw new CoachingError("Choose an available warm-up for every day.", 422);
    if (day.includesLifting !== day.exercises.length > 0)
      throw new CoachingError(
        "A lifting day needs exercises; rest and run-only days have no lifting exercises.",
        422,
      );
  }
  for (const run of blueprint.runs)
    if (!blueprint.days.some((d) => d.includesRun && d.dayOfWeek === run.dayOfWeek))
      throw new CoachingError("A running prescription needs a matching running day.", 422);
  const runningDays = blueprint.days.filter((d) => d.includesRun);
  if (new Set(runningDays.map((d) => d.dayOfWeek)).size !== runningDays.length)
    throw new CoachingError("Running days need distinct weekdays.", 422);
  for (const day of runningDays)
    for (let week = 1; week <= blueprint.weeks; week++)
      if (!blueprint.runs.some((r) => r.weekIndex === week && r.dayOfWeek === day.dayOfWeek))
        throw new CoachingError("Give every running day a target for every week.", 422);
  if (preference?.intakeId) {
    const [intake] = await db
      .select()
      .from(coachIntakes)
      .where(and(eq(coachIntakes.id, preference.intakeId), eq(coachIntakes.userId, userId)));
    const avoided = new Set(intake?.answers.avoidExerciseSlugs ?? []);
    if (blueprintExerciseSlugs(blueprint).some((slug) => avoided.has(slug)))
      throw new CoachingError("This programme includes an exercise you asked to avoid.", 422);
  }
  if (gymId) {
    const candidates = await libraryAtGym(db, userId, gymId);
    const unavailable = blueprint.days
      .flatMap((d) => d.exercises)
      .filter((e) => !candidates.some((c) => c.slug === e.exerciseSlug && c.available));
    if (unavailable.length)
      throw new CoachingError(
        "Some exercises are not available at the selected location. Edit the programme or update its equipment first.",
        422,
      );
  }
  return blueprint;
}

/** Check draft-local positions and machine/measurement semantics before a draft is accepted. */
export async function validateOpeningPlan(
  db: DbOrTx,
  userId: string,
  blueprint: ProgramBlueprint,
  raw: unknown,
  gymId: string | null,
) {
  const opening = openingPlanSchema.parse(raw);
  if (opening.gymId !== gymId)
    throw new CoachingError("The opening session must use the confirmed training location.", 422);
  const first = [...blueprint.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .find((d) => d.includesLifting || d.includesRun);
  if (!first || first.dayIndex !== opening.dayIndex)
    throw new CoachingError("The opening session must be for the first training day.", 422);
  if (first.includesRun !== (opening.run !== null))
    throw new CoachingError(
      "The opening session must include exactly the running component planned for its day.",
      422,
    );
  const [library, machines, options] = await Promise.all([
    libraryAtGym(db, userId, opening.gymId),
    db
      .select()
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.gymId, opening.gymId),
          eq(equipmentInstances.isActive, true),
        ),
      ),
    db.select().from(exerciseEquipmentOptions),
  ]);
  const used = new Set<number>();
  for (const entry of opening.exercises) {
    const slot = entry.orderIndex === null ? null : first.exercises[entry.orderIndex - 1];
    if (entry.orderIndex !== null) {
      if (!slot || used.has(entry.orderIndex))
        throw new CoachingError(
          "Opening session positions must name each original exercise once.",
          422,
        );
      used.add(entry.orderIndex);
    }
    if (
      (entry.action === "keep" || entry.action === "drop") &&
      slot &&
      entry.exerciseSlug !== slot.exerciseSlug
    )
      throw new CoachingError("Keep and drop must name the original exercise.", 422);
    if (!slot && entry.action !== "keep")
      throw new CoachingError("An extra exercise cannot drop or substitute a slot.", 422);
    if (entry.action === "drop") {
      if (entry.sets.length)
        throw new CoachingError("A dropped slot cannot have set targets.", 422);
      continue;
    }
    const exercise = library.find((e) => e.slug === entry.exerciseSlug);
    if (!exercise?.available)
      throw new CoachingError("The opening session includes an unavailable exercise.", 422);
    if (entry.equipmentInstanceId) {
      const machine = machines.find((m) => m.id === entry.equipmentInstanceId);
      if (
        !machine ||
        !options.some(
          (o) =>
            o.exerciseId === exercise.id &&
            (o.equipmentInstanceId === machine.id || o.equipmentTypeId === machine.equipmentTypeId),
        )
      )
        throw new CoachingError(
          "An opening-session machine is incompatible with its exercise.",
          422,
        );
    } else if (["machine", "cable", "smith_machine", "cardio"].includes(exercise.modality))
      throw new CoachingError("Choose a registered machine for opening-session machine work.", 422);
    if (
      (!slot && entry.sets.length === 0) ||
      (entry.action === "substitute" && entry.sets.length === 0)
    )
      throw new CoachingError("Added and substituted exercises need explicit targets.", 422);
    const measure =
      entry.action === "keep" && slot
        ? slot.reps
          ? "reps"
          : slot.duration
            ? "duration"
            : "distance"
        : exercise.defaultPrescriptionType;
    for (const set of entry.sets) {
      const target =
        measure === "reps"
          ? set.reps
          : measure === "duration"
            ? set.durationSeconds
            : set.distanceMeters;
      if (
        target === null ||
        target <= 0 ||
        (measure !== "reps" && set.reps !== null) ||
        (measure !== "duration" && set.durationSeconds !== null) ||
        (measure !== "distance" && set.distanceMeters !== null)
      )
        throw new CoachingError("An opening-session target uses the wrong measurement.", 422);
    }
  }
  if (used.size !== first.exercises.length)
    throw new CoachingError(
      "The opening session must keep, substitute or drop every exercise of its day.",
      422,
    );
  return opening;
}

export async function getProgramDraft(db: DbOrTx, userId: string, id: string) {
  const [draft] = await db
    .select()
    .from(programDrafts)
    .where(and(eq(programDrafts.userId, userId), eq(programDrafts.id, id)));
  return draft ?? null;
}
export async function listProgramDrafts(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(programDrafts)
    .where(
      and(eq(programDrafts.userId, userId), inArray(programDrafts.status, ["editing", "ready"])),
    )
    .orderBy(desc(programDrafts.updatedAt))
    .limit(20);
}

export async function saveManualDraft(
  db: DbOrTx,
  userId: string,
  input: unknown,
  options: { id?: string; expectedRevision?: number; baseProgramId?: string | null } = {},
) {
  const blueprint = programBlueprintSchema.parse(input);
  const source = await sourceRevision(db, userId);
  const active = await getActiveProgram(db, userId);
  if (options.id) {
    const draft = await getProgramDraft(db, userId, options.id);
    if (!draft || !["editing", "ready"].includes(draft.status))
      throw new CoachingError("That draft can no longer be edited.");
    if (draft.revision !== options.expectedRevision)
      throw new CoachingError("The draft changed on another device. Reload before editing.");
    if (draft.baseProgramId !== (active?.id ?? null))
      throw new CoachingError(
        "Your active programme changed. Create a new draft from the current version.",
      );
    const [saved] = await db
      .update(programDrafts)
      .set({
        blueprint,
        openingPlan: null,
        sourceRevision: source,
        revision: draft.revision + 1,
        status: "editing",
      })
      .where(and(eq(programDrafts.id, draft.id), eq(programDrafts.userId, userId)))
      .returning();
    return saved!;
  }
  if (options.baseProgramId && options.baseProgramId !== active?.id)
    throw new CoachingError("The programme you were editing is no longer active.");
  const [draft] = await db
    .insert(programDrafts)
    .values({
      userId,
      source: "manual",
      blueprint,
      sourceRevision: source,
      baseProgramId: active?.id ?? null,
    })
    .returning();
  return draft!;
}

export async function refreshProgramDraft(
  db: DbOrTx,
  userId: string,
  id: string,
  expectedRevision: number,
) {
  const draft = await getProgramDraft(db, userId, id);
  if (!draft || !["editing", "ready"].includes(draft.status) || draft.revision !== expectedRevision)
    throw new CoachingError("This draft changed. Reload before reviewing it.");
  const active = await getActiveProgram(db, userId);
  if (draft.baseProgramId !== (active?.id ?? null))
    throw new CoachingError("Your active programme changed. Create a new draft from it.");
  const [preference] = await db
    .select()
    .from(coachPreferences)
    .where(eq(coachPreferences.userId, userId));
  if (draft.intakeId && draft.intakeId !== preference?.intakeId)
    throw new CoachingError(
      "Your coaching answers changed. Generate a programme from your latest answers.",
    );
  const [intake] = draft.intakeId
    ? await db
        .select()
        .from(coachIntakes)
        .where(and(eq(coachIntakes.id, draft.intakeId), eq(coachIntakes.userId, userId)))
    : [];
  await validateBlueprintForAthlete(db, userId, draft.blueprint, intake?.answers.gymId);
  // Discard an opening session if its evidence became stale; normal scheduled preparation
  // and the deterministic workout prefill still work after explicit draft review.
  const revision = await sourceRevision(db, userId);
  const [saved] = await db
    .update(programDrafts)
    .set({
      status: "ready",
      revision: draft.revision + 1,
      sourceRevision: revision,
      openingPlan: revision === draft.sourceRevision ? draft.openingPlan : null,
    })
    .where(eq(programDrafts.id, draft.id))
    .returning();
  return saved!;
}

export async function activateProgramDraft(
  db: DbOrTx,
  userId: string,
  id: string,
  input: { expectedRevision: number; startDate: string; transition: "new_block" | "continue" },
) {
  const draft = await getProgramDraft(db, userId, id);
  if (!draft) throw new CoachingError("Programme draft not found.", 404);
  if (draft.status === "activated" && draft.activatedProgramId)
    return { programId: draft.activatedProgramId, alreadyActivated: true };
  if (draft.status !== "ready" || draft.revision !== input.expectedRevision)
    throw new CoachingError("Review the latest draft before starting it.");
  await assertNoOpenWorkout(db, userId);
  if (draft.sourceRevision !== (await sourceRevision(db, userId)))
    throw new CoachingError(
      "Your training data changed. Check this draft against your current data before starting it.",
    );
  const active = await getActiveProgram(db, userId);
  if (draft.baseProgramId !== (active?.id ?? null))
    throw new CoachingError("Your active programme changed while this draft was waiting.");
  const blueprint = await validateBlueprintForAthlete(db, userId, draft.blueprint);
  let familyId: string | undefined,
    startDate = input.startDate,
    startDayIndex: number | undefined;
  if (input.transition === "continue") {
    if (!active?.startDate) throw new CoachingError("There is no running block to continue.");
    const current = await readProgramBlueprint(db, userId, active.id);
    if (
      !current ||
      assessProgramChange(current.blueprint, blueprint, []).authority === "review_required"
    )
      throw new CoachingError(
        "This changes the split or schedule. Start it as a new block after reviewing the new days.",
      );
    const [original] = await db
      .select({ familyId: programs.familyId })
      .from(programs)
      .where(eq(programs.id, active.id));
    familyId = original!.familyId;
    startDate = active.startDate;
    startDayIndex = current.startDayIndex;
  }
  const created = await createProgramFromBlueprint(db, userId, blueprint, {
    startDate,
    startDayIndex,
    familyId,
  });
  if (input.transition === "continue" && active) {
    const events = await db
      .select()
      .from(programSlotEvents)
      .where(and(eq(programSlotEvents.userId, userId), eq(programSlotEvents.programId, active.id)));
    if (events.length)
      await db.insert(programSlotEvents).values(
        events.map(({ id: _id, createdAt: _created, ...event }) => ({
          ...event,
          programId: created.id,
        })),
      );
  }
  if (active)
    await db
      .update(sessionPlans)
      .set({ status: "superseded" })
      .where(
        and(
          eq(sessionPlans.userId, userId),
          eq(sessionPlans.programId, active.id),
          eq(sessionPlans.status, "active"),
        ),
      );
  if (draft.openingPlan && input.transition === "new_block")
    await storeOpeningPlan(db, userId, created.id, draft.openingPlan);
  await db
    .update(programDrafts)
    .set({ status: "activated", activatedProgramId: created.id })
    .where(eq(programDrafts.id, id));
  await db
    .update(programDrafts)
    .set({ status: "superseded" })
    .where(
      and(eq(programDrafts.userId, userId), inArray(programDrafts.status, ["editing", "ready"])),
    );
  return { programId: created.id, alreadyActivated: false };
}

async function storeOpeningPlan(db: DbOrTx, userId: string, programId: string, raw: OpeningPlan) {
  const opening = openingPlanSchema.parse(raw);
  const schedule = await getSchedule(db, userId);
  const next = schedule ? nextTrainingSlot(schedule) : null;
  if (!next || next.dayIndex !== opening.dayIndex)
    throw new CoachingError(
      "The opening session must match the programme's first training day.",
      422,
    );
  const [day] = await db
    .select()
    .from(programDays)
    .where(and(eq(programDays.programId, programId), eq(programDays.dayIndex, opening.dayIndex)));
  if (!day) throw new CoachingError("The opening session names an unknown programme day.", 422);
  const slots = await db
    .select()
    .from(programExercises)
    .where(eq(programExercises.programDayId, day.id))
    .orderBy(asc(programExercises.orderIndex));
  const [run] = await db
    .select()
    .from(programRuns)
    .where(
      and(
        eq(programRuns.programId, programId),
        eq(programRuns.weekIndex, 1),
        eq(programRuns.dayOfWeek, day.dayOfWeek ?? 0),
      ),
    );
  const exercises = opening.exercises.map(({ orderIndex, ...exercise }) => {
    const slot = orderIndex === null ? null : slots.find((s) => s.orderIndex === orderIndex);
    if (orderIndex !== null && !slot)
      throw new CoachingError("The opening session names an unknown exercise position.", 422);
    return { ...exercise, slotId: slot?.id ?? null };
  });
  await storePlan(db, userId, {
    slot: next,
    gymId: opening.gymId,
    trigger: "nightly",
    strict: true,
    plan: {
      summary: opening.summary,
      warmup: opening.warmup,
      exercises,
      run: opening.run ? { ...opening.run, programRunId: run?.id ?? null } : null,
    },
  });
}
