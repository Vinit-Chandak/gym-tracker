import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  coachAttachments,
  coachIntakes,
  coachJobs,
  coachPreferences,
  equipmentInstances,
  exercises,
  gyms,
  profiles,
  programDrafts,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { coachIntakeSchema, validateIntake, type CoachIntake } from "@/domain/coaching-workflow";
import { CoachingError } from "./coaching-state";

export async function latestIntake(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(coachIntakes)
    .where(eq(coachIntakes.userId, userId))
    .orderBy(desc(coachIntakes.revision))
    .limit(1);
  return row ?? null;
}

/** Each confirmed intake stays immutable. Further edits receive a new revision. */
export async function saveIntake(
  db: DbOrTx,
  userId: string,
  input: unknown,
  expectedRevision: number | null,
) {
  const answers = coachIntakeSchema.parse(input);
  const current = await latestIntake(db, userId);
  if ((current?.revision ?? null) !== expectedRevision)
    throw new CoachingError(
      "Your answers changed on another device. Reload to review them before saving.",
    );
  await checkIntakeReferences(db, userId, answers);
  if (current && !current.confirmedAt) {
    const [saved] = await db
      .update(coachIntakes)
      .set({ answers, revision: current.revision + 1 })
      .where(and(eq(coachIntakes.id, current.id), isNull(coachIntakes.confirmedAt)))
      .returning();
    return saved!;
  }
  const [saved] = await db
    .insert(coachIntakes)
    .values({ userId, revision: (current?.revision ?? 0) + 1, answers })
    .returning();
  return saved!;
}

export async function confirmIntake(db: DbOrTx, userId: string, intakeId: string) {
  const intake = await latestIntake(db, userId);
  if (!intake || intake.id !== intakeId)
    throw new CoachingError("Review your latest answers before creating a programme.");
  const answers = validateIntake(intake.answers);
  await checkIntakeReferences(db, userId, answers);
  const [previous] = await db
    .select()
    .from(coachPreferences)
    .where(eq(coachPreferences.userId, userId));
  if (intake.confirmedAt && previous?.mode === "coach" && previous.intakeId === intake.id)
    return intake;
  const now = new Date();
  await db.update(coachIntakes).set({ confirmedAt: now }).where(eq(coachIntakes.id, intake.id));
  await db
    .update(coachJobs)
    .set({ status: "superseded", completedAt: now, error: "Your confirmed answers changed." })
    .where(and(eq(coachJobs.userId, userId), inArray(coachJobs.status, ["queued", "claimed"])));
  await db
    .update(programDrafts)
    .set({ status: "superseded" })
    .where(
      and(
        eq(programDrafts.userId, userId),
        eq(programDrafts.source, "ai"),
        inArray(programDrafts.status, ["editing", "ready"]),
      ),
    );
  await db
    .insert(coachPreferences)
    .values({
      userId,
      mode: "coach",
      intakeId,
      reviewWeekday: answers.reviewWeekday,
      consentedAt: now,
    })
    .onConflictDoUpdate({
      target: coachPreferences.userId,
      set: {
        mode: "coach",
        intakeId,
        reviewWeekday: answers.reviewWeekday,
        consentedAt: previous?.consentedAt ?? now,
        updatedAt: now,
      },
    });
  await db.update(profiles).set({ aiCoachEnabled: true }).where(eq(profiles.id, userId));
  return { ...intake, confirmedAt: now, answers };
}

async function checkIntakeReferences(db: DbOrTx, userId: string, answers: CoachIntake) {
  if (answers.gymId) {
    const [gym] = await db
      .select({ id: gyms.id })
      .from(gyms)
      .where(and(eq(gyms.id, answers.gymId), eq(gyms.userId, userId), eq(gyms.isActive, true)));
    if (!gym) throw new CoachingError("Choose one of your active training locations.", 400);
  }
  if (new Set(answers.attachmentIds).size !== answers.attachmentIds.length)
    throw new CoachingError("A file was selected twice.", 400);
  if (answers.attachmentIds.length) {
    const files = await db
      .select({ id: coachAttachments.id })
      .from(coachAttachments)
      .where(
        and(
          eq(coachAttachments.userId, userId),
          inArray(coachAttachments.id, answers.attachmentIds),
        ),
      );
    if (files.length !== answers.attachmentIds.length)
      throw new CoachingError("One of the attached files is no longer available.", 400);
  }
  if (answers.avoidExerciseSlugs.length) {
    const available = await db
      .select({ slug: exercises.slug })
      .from(exercises)
      .where(
        and(
          inArray(exercises.slug, answers.avoidExerciseSlugs),
          sql`(${exercises.userId} is null or ${exercises.userId} = ${userId})`,
        ),
      );
    if (
      new Set(answers.avoidExerciseSlugs).size !== answers.avoidExerciseSlugs.length ||
      available.length !== answers.avoidExerciseSlugs.length
    )
      throw new CoachingError("Choose each exercise to avoid once, from your own library.", 400);
  }
  for (const baseline of answers.baselines) {
    if (baseline.gymId) {
      const [location] = await db
        .select({ id: gyms.id })
        .from(gyms)
        .where(and(eq(gyms.id, baseline.gymId), eq(gyms.userId, userId)));
      if (!location) throw new CoachingError("A reported lift names an unavailable location.", 400);
    }
    const [exercise] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.slug, baseline.exerciseSlug),
          sql`(${exercises.userId} is null or ${exercises.userId} = ${userId})`,
        ),
      );
    if (!exercise)
      throw new CoachingError("Choose an exercise from your library for each starting lift.", 400);
    if (baseline.equipmentInstanceId) {
      const [machine] = await db
        .select()
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.id, baseline.equipmentInstanceId),
            eq(equipmentInstances.userId, userId),
          ),
        );
      if (!machine || machine.gymId !== baseline.gymId)
        throw new CoachingError("A reported lift names a machine from another location.", 400);
    }
  }
}

export async function setTrainingMode(db: DbOrTx, userId: string, mode: "manual" | "track") {
  await db
    .insert(coachPreferences)
    .values({ userId, mode })
    .onConflictDoUpdate({ target: coachPreferences.userId, set: { mode, updatedAt: new Date() } });
  await db.update(profiles).set({ aiCoachEnabled: false }).where(eq(profiles.id, userId));
  await db
    .update(coachJobs)
    .set({ status: "superseded", completedAt: new Date(), error: "Coaching was switched off." })
    .where(and(eq(coachJobs.userId, userId), inArray(coachJobs.status, ["queued", "claimed"])));
}
