/** Six local personas and persistent coaching states for the browser audit. Never resets data. */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seedTestUserData } from "@/db/test/fixtures";
import { withUser } from "@/db/with-user";
import { diffOperationIds, diffPrograms } from "@/domain/program-diff";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { confirmIntake, saveIntake } from "@/server/repositories/coach-intakes";
import { coachIntakeSchema, jobTargetSchema } from "@/domain/coaching-workflow";
import { addExerciseToSession, startAdHocSession } from "@/server/repositories/sessions";
import { seedAuditMultisport } from "./seed-audit-multisport";
import { seedAuditHistory } from "./seed-audit-history";
import { seedAuditBoundaries } from "./seed-audit-boundaries";

const url = process.env.SEED_DATABASE_URL ?? "";
const target = new URL(url);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  target.hash !== "" ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Use the isolated audit database.");
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client, { schema });
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
async function main() {
  try {
    for (const person of [
      {
        username: "alex",
        name: "Alex Rivera",
        unit: "lb" as const,
        onboarded: true,
        populate: true,
      },
      {
        username: "sam",
        name: "Sam Taylor",
        unit: "kg" as const,
        onboarded: true,
        populate: false,
      },
      {
        username: "taylor",
        name: "Taylor New",
        unit: "kg" as const,
        onboarded: false,
        populate: false,
      },
    ]) {
      const email = `${person.username}@local.test`;
      if ((await client`select id from auth.users where email = ${email}`).length) continue;
      const id = randomUUID();
      const salt = randomBytes(16).toString("hex");
      const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
      await client`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
      values (${id}, ${email}, ${JSON.stringify({ username: person.username, display_name: person.name })}::jsonb, ${password})`;
      await db
        .update(schema.profiles)
        .set({
          preferredUnit: person.unit,
          timeZone: person.unit === "lb" ? "America/New_York" : "Asia/Kolkata",
          onboardedAt: person.onboarded ? new Date() : null,
          shareTraining: person.username !== "alex",
          discoverableByEmail: person.username !== "alex",
        })
        .where(eq(schema.profiles.id, id));
      if (person.populate)
        await withUser(db, id, async (tx) => {
          const fixture = await seedTestUserData(tx, { id, email });
          const gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
          const session = await startAdHocSession(tx, id, { gymId });
          for (const slug of ["barbell-bench-press", "plank", "farmers-carry"]) {
            const [exercise] = await tx
              .select()
              .from(schema.exercises)
              .where(eq(schema.exercises.slug, slug));
            await addExerciseToSession(tx, id, session.sessionId, {
              exerciseId: exercise!.id,
              equipmentInstanceId: null,
            });
          }
        });
    }

    // Set each sport's sharing choice before historical projections are written.
    await seedAuditMultisport(db);
    const history = await seedAuditHistory(db);
    const boundariesAdded = await seedAuditBoundaries(db, history);
    for (const username of ["vinit", "shreyash", "priya"]) {
      const [person] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.username, username));
      if (!person) throw new Error("Run seed-people.ts first.");
      await withUser(db, person.id, async (tx) => {
        if (
          (
            await tx
              .select()
              .from(schema.coachJobs)
              .where(
                and(
                  eq(schema.coachJobs.userId, person.id),
                  eq(schema.coachJobs.dedupeKey, "audit:review"),
                ),
              )
          ).length
        )
          return;
        const [program] = await tx
          .select()
          .from(schema.programs)
          .where(and(eq(schema.programs.userId, person.id), eq(schema.programs.status, "active")));
        const [gym] = await tx
          .select()
          .from(schema.gyms)
          .where(and(eq(schema.gyms.userId, person.id), eq(schema.gyms.isDefault, true)));
        const intake = await saveIntake(
          tx,
          person.id,
          coachIntakeSchema.parse({
            goal: "Build strength with sustainable lifting and running",
            sessionsPerWeek: 4,
            minutesPerSession: 60,
            trainingLocation: "gym",
            heightCm: 175,
            weightKg: person.bodyWeightKg ?? 70,
            ageYears: 30,
            gymId: gym!.id,
            prompt: "Keep the plan practical for my gym.",
          }),
          null,
        );
        await confirmIntake(tx, person.id, intake.id);
        await tx
          .update(schema.profiles)
          .set({ aiCoachEnabled: true })
          .where(eq(schema.profiles.id, person.id));
        const current = await readProgramBlueprint(tx, person.id, program!.id);
        const blueprint = structuredClone(current!.blueprint);
        blueprint.days[0]!.exercises[0]!.sets += 1;
        blueprint.days[0]!.exercises.push({
          exerciseSlug: "goblet-squat",
          sets: 2,
          reps: [10, 12],
          rir: [2, 3],
          rest: [60, 90],
        });
        const [job] = await tx
          .insert(schema.coachJobs)
          .values({
            userId: person.id,
            kind: "review_program",
            trigger: "weekly",
            dedupeKey: "audit:review",
            status: "succeeded",
            intakeId: intake.id,
            target: jobTargetSchema.parse({ programId: program!.id }),
            completedAt: daysAgo(1),
          })
          .returning();
        const [draft] = await tx
          .insert(schema.programDrafts)
          .values({
            userId: person.id,
            source: "weekly",
            status: "ready",
            blueprint,
            jobId: job!.id,
            intakeId: intake.id,
            baseProgramId: program!.id,
            sourceRevision: await sourceRevision(tx, person.id),
            rationale: "Add the requested squat practice and one set to the first movement.",
          })
          .returning();
        await tx.insert(schema.coachWeeklyReviews).values({
          userId: person.id,
          jobId: job!.id,
          periodStart: daysAgo(8),
          periodEnd: daysAgo(1),
          outcome: "proposal",
          rationale: draft!.rationale,
          draftId: draft!.id,
        });
        const [oldJob] = await tx
          .insert(schema.coachJobs)
          .values({
            userId: person.id,
            kind: "review_program",
            trigger: "weekly",
            dedupeKey: "audit:no-change",
            status: "succeeded",
            result: {
              outcome: "no_change",
              rationale: "The current plan still fits the available training evidence.",
              evidence: [],
              uncertainties: [],
              adjustment: "normal",
              coverage: [],
            },
            intakeId: intake.id,
            target: jobTargetSchema.parse({ programId: program!.id }),
            completedAt: daysAgo(8),
          })
          .returning();
        await tx.insert(schema.coachWeeklyReviews).values({
          userId: person.id,
          jobId: oldJob!.id,
          periodStart: daysAgo(15),
          periodEnd: daysAgo(8),
          outcome: "no_change",
          rationale: "The current plan still fits the available training evidence.",
          completedAt: daysAgo(8),
        });
        const noteId = randomUUID();
        await tx.insert(schema.coachNotes).values([
          {
            id: noteId,
            userId: person.id,
            text: "Add squat practice. Can we move core work to another day?",
            createdAt: daysAgo(2),
            reviewedAt: daysAgo(1),
            disposition: "queued_for_review",
            dispositionDetail: "Squat practice proposed; a question remains about core work.",
          },
          {
            userId: person.id,
            text: "I prefer training after work.",
            createdAt: daysAgo(4),
            reviewedAt: daysAgo(3),
            disposition: "remembered",
          },
          { userId: person.id, text: "Next week I can train on Saturday as well." },
        ]);
        const refs = [...diffOperationIds(diffPrograms(current!.blueprint, blueprint))];
        for (const [index, state] of (
          [
            "proposed",
            "needs_answer",
            "waiting",
            "deferred",
            "already_satisfied",
            "not_recommended",
          ] as const
        ).entries()) {
          const id = randomUUID();
          const settled = ["already_satisfied", "not_recommended"].includes(state);
          const decidedJobId = settled ? oldJob!.id : job!.id;
          const detail =
            state === "needs_answer"
              ? "Which day works best for your core work?"
              : state === "deferred"
                ? "Revisit after a full week of consistent training."
                : state === "already_satisfied"
                  ? "The current programme already includes this."
                  : state === "not_recommended"
                    ? "Keep the current volume while adapting to the new schedule."
                    : "";
          await tx.insert(schema.coachProgramRequests).values({
            id,
            userId: person.id,
            sourceId: `note:${noteId}`,
            quote: "Add squat practice. Can we move core work to another day?",
            summary: [
              "Add squat practice",
              "Move core work",
              "Use the new gym next week",
              "Add another running day",
              "Keep a weekly rest day",
              "Double training volume",
            ][index]!,
            state,
            detail,
            decidedJobId,
            openedJobId: job!.id,
            draftId: state === "proposed" ? draft!.id : null,
            changeRefs: state === "proposed" ? refs : [],
            reconsiderAfter:
              state === "deferred"
                ? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
                : null,
            condition: state === "deferred" ? "Complete the current week" : "",
            createdAt: new Date(daysAgo(2).getTime() + index * 60_000),
            resolvedAt: settled ? daysAgo(1) : null,
          });
          await tx.insert(schema.coachRequestDecisions).values({
            userId: person.id,
            requestId: id,
            jobId: decidedJobId,
            state,
            detail,
            changeRefs: state === "proposed" ? refs : [],
          });
        }
        await tx
          .insert(schema.coachMemos)
          .values({
            userId: person.id,
            overview: "Prefers training after work. Keep sessions within an hour.",
          })
          .onConflictDoNothing();
        await tx.insert(schema.coachJobs).values({
          userId: person.id,
          kind: "prepare_session",
          trigger: "gym",
          dedupeKey: "audit:failed",
          status: "failed",
          intakeId: intake.id,
          target: jobTargetSchema.parse({ gymId: gym!.id }),
          error: "The local audit worker was unavailable. Your current programme is unchanged.",
          completedAt: daysAgo(2),
        });
        await tx
          .update(schema.programDrafts)
          .set({ sourceRevision: await sourceRevision(tx, person.id) })
          .where(eq(schema.programDrafts.id, draft!.id));
      });
    }
    // Adding the long-history fixture is a source change. Refresh only untouched ready audit
    // proposals when this seed actually inserted history; later re-runs preserve interactions.
    if (history.insertedMonths > 0 || boundariesAdded > 0) {
      const drafts = await db
        .select({ draft: schema.programDrafts })
        .from(schema.programDrafts)
        .innerJoin(schema.coachJobs, eq(schema.coachJobs.id, schema.programDrafts.jobId))
        .where(
          and(
            eq(schema.coachJobs.dedupeKey, "audit:review"),
            eq(schema.programDrafts.status, "ready"),
          ),
        );
      for (const { draft } of drafts)
        await withUser(db, draft.userId, async (tx) => {
          await tx
            .update(schema.programDrafts)
            .set({ sourceRevision: await sourceRevision(tx, draft.userId) })
            .where(eq(schema.programDrafts.id, draft.id));
        });
    }
    const people = await db
      .select({
        id: schema.profiles.id,
        username: schema.profiles.username,
        unit: schema.profiles.preferredUnit,
      })
      .from(schema.profiles);
    const inventory = {
      history,
      boundariesAdded,
      people,
      gyms: await db.select({ id: schema.gyms.id, userId: schema.gyms.userId }).from(schema.gyms),
      workouts: await db
        .select({
          id: schema.workoutSessions.id,
          userId: schema.workoutSessions.userId,
          completedAt: schema.workoutSessions.completedAt,
        })
        .from(schema.workoutSessions),
      runs: await db.select({ id: schema.runs.id, userId: schema.runs.userId }).from(schema.runs),
      drafts: await db
        .select({ id: schema.programDrafts.id, userId: schema.programDrafts.userId })
        .from(schema.programDrafts),
      jobs: await db
        .select({
          id: schema.coachJobs.id,
          userId: schema.coachJobs.userId,
          status: schema.coachJobs.status,
        })
        .from(schema.coachJobs),
      exercises: await db
        .select({ id: schema.exercises.id, slug: schema.exercises.slug })
        .from(schema.exercises),
      equipment: await db
        .select({
          id: schema.equipmentInstances.id,
          gymId: schema.equipmentInstances.gymId,
          userId: schema.equipmentInstances.userId,
        })
        .from(schema.equipmentInstances),
      activities: await db
        .select({
          id: schema.activities.id,
          userId: schema.activities.userId,
          sport: schema.activities.sport,
        })
        .from(schema.activities),
      occurrences: await db
        .select({
          id: schema.plannedOccurrences.id,
          userId: schema.plannedOccurrences.userId,
          sport: schema.plannedOccurrences.sport,
          familyId: schema.plannedOccurrences.familyId,
          disposition: schema.plannedOccurrences.disposition,
        })
        .from(schema.plannedOccurrences),
      templates: await db
        .select({
          id: schema.activityTemplates.id,
          userId: schema.activityTemplates.userId,
          sport: schema.activityTemplates.sport,
        })
        .from(schema.activityTemplates),
      shared: await db
        .select({
          id: schema.sharedSessionStats.id,
          userId: schema.sharedSessionStats.userId,
          sport: schema.sharedSessionStats.sport,
        })
        .from(schema.sharedSessionStats),
      workoutExercises: await db
        .select({
          id: schema.workoutExercises.id,
          userId: schema.workoutExercises.userId,
          workoutSessionId: schema.workoutExercises.workoutSessionId,
        })
        .from(schema.workoutExercises),
      foods: await db
        .select({ id: schema.foods.id, userId: schema.foods.userId, name: schema.foods.name })
        .from(schema.foods),
      savedMeals: await db
        .select({
          id: schema.savedMeals.id,
          userId: schema.savedMeals.userId,
          name: schema.savedMeals.name,
        })
        .from(schema.savedMeals),
      resources: await db
        .select({
          id: schema.activityResources.id,
          userId: schema.activityResources.userId,
          kind: schema.activityResources.kind,
          archivedAt: schema.activityResources.archivedAt,
        })
        .from(schema.activityResources),
    };
    const outputDirectory = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(`${outputDirectory}/fixtures.json`, JSON.stringify(inventory, null, 2));
    console.log(
      `Audit ready: ${people.length} users, ${inventory.workouts.length} workouts, ${inventory.activities.length} activities, ${inventory.drafts.length} proposals.`,
    );
    console.log(
      "Accounts: vinit, shreyash, priya, alex, sam, taylor @local.test; password: password123",
    );
  } finally {
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
