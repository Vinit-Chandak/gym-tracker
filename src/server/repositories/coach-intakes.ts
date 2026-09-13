import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  coachAttachments,
  coachIntakes,
  coachJobs,
  coachPreferences,
  exercises,
  gyms,
  profiles,
  programDrafts,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  coachIntakeSchema,
  validateIntake,
  type CoachIntake,
  type TrainingLocation,
} from "@/domain/coaching-workflow";
import { reviewWeekdayFor } from "@/domain/coach-cadence";
import { createGym } from "./gyms";
import { CoachingError } from "./coaching-state";

/**
 * The location an answer of "gym" or "home" stands for.
 *
 * The athlete is never shown a list. A location they already chose is kept when it still
 * matches the answer, otherwise their default one of that kind is used — and a row is only
 * created once they confirm, so an abandoned draft never leaves an empty gym behind.
 */
async function resolveTrainingLocation(
  db: DbOrTx,
  userId: string,
  answers: CoachIntake,
  { create }: { create: boolean },
): Promise<CoachIntake> {
  const kind: TrainingLocation | null = answers.trainingLocation;
  if (!kind) return answers;
  const owned = await db
    .select({ id: gyms.id, kind: gyms.kind, isDefault: gyms.isDefault })
    .from(gyms)
    .where(and(eq(gyms.userId, userId), eq(gyms.isActive, true)))
    .orderBy(desc(gyms.isDefault), asc(gyms.createdAt));
  const chosen = owned.find((gym) => gym.id === answers.gymId && gym.kind === kind);
  const matching = chosen ?? owned.find((gym) => gym.kind === kind);
  if (matching) return { ...answers, gymId: matching.id };
  if (!create) return { ...answers, gymId: null };
  const created = await createGym(db, userId, {
    name: kind === "home" ? "Home" : "Gym",
    kind,
    address: null,
    notes: null,
  });
  return { ...answers, gymId: created.id };
}

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
  const answers = await resolveTrainingLocation(db, userId, coachIntakeSchema.parse(input), {
    create: false,
  });
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
  const [previous] = await db
    .select()
    .from(coachPreferences)
    .where(eq(coachPreferences.userId, userId));
  // Confirming the same answers twice is the retry of a dropped response, not a new consent:
  // nothing is re-derived and no location is created a second time.
  if (intake.confirmedAt && previous?.mode === "coach" && previous.intakeId === intake.id)
    return intake;
  const answers = await resolveTrainingLocation(db, userId, validateIntake(intake.answers), {
    create: true,
  });
  await checkIntakeReferences(db, userId, answers);
  const now = new Date();
  await db
    .update(coachIntakes)
    .set({ confirmedAt: now, answers })
    .where(eq(coachIntakes.id, intake.id));
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
  // Nobody picks their review day; it falls on a day they do not train.
  const reviewWeekday = reviewWeekdayFor({
    trainingDays: answers.preferredDays,
    runDays: answers.preferredRunDays,
  });
  await db
    .insert(coachPreferences)
    .values({
      userId,
      mode: "coach",
      intakeId,
      reviewWeekday,
      consentedAt: now,
    })
    .onConflictDoUpdate({
      target: coachPreferences.userId,
      set: {
        mode: "coach",
        intakeId,
        reviewWeekday,
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
