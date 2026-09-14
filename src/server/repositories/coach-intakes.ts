import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
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
  MAX_CLARIFICATIONS,
  type CoachIntake,
  type TrainingLocation,
} from "@/domain/coaching-workflow";
import { reviewWeekdayFor } from "@/domain/coach-cadence";
import { todayInTimeZone } from "@/domain/program-calendar";
import { TRAINING_GOALS } from "@/domain/types";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { recordBodyWeight } from "./body-weight";
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

/**
 * The athlete's most recent answers, in the shape the app asks for today.
 *
 * Answers stored before a question existed simply have no key for it, and a reader that
 * expected one found `undefined` where it expected a list. Parsing on the way out lets the
 * schema's own defaults fill those in, so a new question never has to be back-filled into
 * every row that predates it.
 */
export async function latestIntake(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(coachIntakes)
    .where(eq(coachIntakes.userId, userId))
    .orderBy(desc(coachIntakes.revision))
    .limit(1);
  return row ? { ...row, answers: coachIntakeSchema.parse(row.answers) } : null;
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

/** What the page sends back: one answer for each question the athlete chose to answer. */
const answersSchema = z
  .array(
    z.object({
      question: z.string().trim().min(1).max(700),
      answer: z.string().trim().max(2000),
    }),
  )
  .max(MAX_CLARIFICATIONS);

/**
 * Files the coach's questions, and the athlete's answers to them, into the intake.
 *
 * The job that asked is finished — a stored result is not a conversation — so the answers go
 * where the next request will read them. Only questions that job actually asked are accepted,
 * so a stale page cannot put words in the coach's mouth, and answering the same question twice
 * replaces the earlier answer rather than stacking a contradiction beside it.
 */
export async function answerCoachQuestions(
  db: DbOrTx,
  userId: string,
  jobId: string,
  input: unknown,
) {
  const [job] = await db
    .select()
    .from(coachJobs)
    .where(and(eq(coachJobs.id, jobId), eq(coachJobs.userId, userId)));
  const asked =
    job?.status === "needs_input" && job.result?.outcome === "needs_input"
      ? job.result.questions
      : null;
  if (!asked) throw new CoachingError("This request is not waiting on an answer.");
  const questions = new Set(asked);
  const given = answersSchema
    .parse(input)
    .filter((entry) => questions.has(entry.question) && entry.answer !== "");
  if (given.length === 0)
    throw new CoachingError("Answer at least one of the coach's questions before sending.");
  const intake = await latestIntake(db, userId);
  if (!intake) throw new CoachingError("Review your answers before asking again.");
  const kept = intake.answers.clarifications.filter((entry) => !questions.has(entry.question));
  return saveIntake(
    db,
    userId,
    { ...intake.answers, clarifications: [...kept, ...given].slice(-MAX_CLARIFICATIONS) },
    intake.revision,
  );
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
  // A creation request that asked a question is finished with once the answers have moved on,
  // so it stops offering a link to a question that has already been answered.
  await db
    .update(coachJobs)
    .set({ status: "superseded", completedAt: now, error: "You answered and asked again." })
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "create_program"),
        eq(coachJobs.status, "needs_input"),
      ),
    );
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
  await copyIntakeToProfile(db, userId, answers);
  return { ...intake, confirmedAt: now, answers };
}

/**
 * What the athlete has just told the coach about their body is also what the app knows
 * about them.
 *
 * Height, weight and a goal are asked for here because a programme cannot be written without
 * them, and leaving the answers in the intake alone is how Settings → Profile stays blank for
 * someone who has answered all three. The weight goes through the reading log, which owns
 * `profiles.body_weight_kg`, so the number on the profile and the trend behind it cannot
 * disagree. Age is left alone: a number of years is not a birthday, and a birthday invented
 * from one would be wrong for most of the year.
 */
async function copyIntakeToProfile(db: DbOrTx, userId: string, answers: CoachIntake) {
  const [profile] = await db
    .select({ timeZone: profiles.timeZone, bodyWeightKg: profiles.bodyWeightKg })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (!profile) return;
  const goal = TRAINING_GOALS.find((value) => TRAINING_GOAL_LABELS[value] === answers.goal);
  const changes = {
    ...(answers.heightCm === null ? {} : { heightCm: answers.heightCm }),
    ...(goal ? { trainingGoal: goal } : {}),
  };
  if (Object.keys(changes).length > 0)
    await db.update(profiles).set(changes).where(eq(profiles.id, userId));
  if (answers.weightKg !== null && answers.weightKg !== profile.bodyWeightKg)
    await recordBodyWeight(db, userId, {
      measuredOn: todayInTimeZone(profile.timeZone),
      weightKg: answers.weightKg,
    });
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
