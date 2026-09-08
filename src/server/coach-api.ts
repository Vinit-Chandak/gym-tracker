import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  profiles,
  programDays,
  programExercises,
  programExerciseFallbacks,
  programRuns,
  programs,
  exercises,
  warmupProtocols,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { liftingAdherence, trainingAnalytics } from "@/domain/analytics";
import { authenticateCoachToken } from "@/server/repositories/coach-tokens";
import { getSchedule } from "@/server/repositories/schedule";
import {
  readRecovery,
  readRuns,
  readTrainingData,
  readWorkouts,
} from "@/server/repositories/training-data";
import { parseDateRange } from "@/server/validation/date-range";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const paging = z.object({
  page: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function currentProgram(db: DbOrTx, userId: string) {
  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!program) return null;
  const days = await db
    .select()
    .from(programDays)
    .where(eq(programDays.programId, program.id))
    .orderBy(asc(programDays.dayIndex));
  const slots = days.length
    ? await db
        .select({ prescription: programExercises, exercise: exercises })
        .from(programExercises)
        .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
        .where(
          inArray(
            programExercises.programDayId,
            days.map((d) => d.id),
          ),
        )
        .orderBy(asc(programExercises.orderIndex))
    : [];
  const fallbacks = slots.length
    ? await db
        .select()
        .from(programExerciseFallbacks)
        .where(
          inArray(
            programExerciseFallbacks.programExerciseId,
            slots.map((s) => s.prescription.id),
          ),
        )
    : [];
  const runTargets = await db
    .select()
    .from(programRuns)
    .where(eq(programRuns.programId, program.id))
    .orderBy(asc(programRuns.weekIndex), asc(programRuns.dayOfWeek));
  const warmupIds = [
    ...new Set(days.flatMap((d) => (d.warmupProtocolId ? [d.warmupProtocolId] : []))),
  ];
  const warmups = warmupIds.length
    ? await db.select().from(warmupProtocols).where(inArray(warmupProtocols.id, warmupIds))
    : [];
  return {
    ...program,
    days: days.map((day) => ({
      ...day,
      warmup: warmups.find((w) => w.id === day.warmupProtocolId) ?? null,
      exercises: slots
        .filter((s) => s.prescription.programDayId === day.id)
        .map((s) => ({
          ...s.prescription,
          exercise: s.exercise,
          fallbacks: fallbacks.filter((f) => f.programExerciseId === s.prescription.id),
        })),
    })),
    runs: runTargets,
  };
}

export async function handleCoachRequest(
  db: Db,
  request: Request,
  path: string[],
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ error: "A read-only coach Bearer token is required." }, 401);
  try {
    const userId = await authenticateCoachToken(db, authorization.slice(7));
    if (!userId) return json({ error: "Token is invalid, expired or revoked." }, 401);
    return await withUser(
      db,
      userId,
      async (tx) => {
        const [profile] = await tx
          .select({ timeZone: profiles.timeZone })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1);
        if (!profile) return json({ error: "Account unavailable." }, 401);
        const params = new URL(request.url).searchParams;
        let range, pagination;
        try {
          range = parseDateRange(
            { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined },
            profile.timeZone,
          );
          pagination = paging.parse({
            page: params.get("page") ?? undefined,
            limit: params.get("limit") ?? undefined,
          });
        } catch {
          return json(
            { error: "Use valid from/to dates up to one year apart, page >= 0, and limit 1–100." },
            400,
          );
        }
        const meta = {
          version: 1,
          timeZone: profile.timeZone,
          from: range.from,
          to: range.to,
          generatedAt: new Date().toISOString(),
        };
        const endpoint = path.join("/");
        if (endpoint === "program/current")
          return json({ ...meta, program: await currentProgram(tx, userId) });
        if (endpoint === "workouts") {
          const result = await readWorkouts(tx, userId, range, pagination.page, pagination.limit);
          return json({ ...meta, ...pagination, ...result });
        }
        if (endpoint === "running")
          return json({
            ...meta,
            ...pagination,
            ...(await readRuns(tx, userId, range, pagination.page, pagination.limit)),
          });
        if (endpoint === "summary") {
          const data = await readTrainingData(tx, userId, range);
          return json({
            ...meta,
            summary: trainingAnalytics(data, profile.timeZone, range.from, range.to),
            adherence: liftingAdherence(await getSchedule(tx, userId)),
          });
        }
        if (endpoint === "recovery") {
          const { workouts, hasMore } = await readWorkouts(
            tx,
            userId,
            range,
            pagination.page,
            pagination.limit,
          );
          const runData = await readRuns(tx, userId, range, pagination.page, pagination.limit);
          return json({
            ...meta,
            ...pagination,
            hasMore: hasMore || runData.hasMore,
            daily: await readRecovery(tx, userId, range),
            checkIns: workouts.map((w) => ({
              sessionId: w.id,
              startedAt: w.startedAt,
              sleepHours: w.sleepHours,
              sleepQuality: w.sleepQuality,
              energy: w.energy,
              fatigue: w.fatigue,
              soreness: w.soreness,
              backPain: w.backPainPre,
              shinLeft: w.shinLeftPre,
              shinRight: w.shinRightPre,
            })),
            runs: runData.runs.map((r) => ({
              runId: r.id,
              startedAt: r.startedAt,
              shinLeftPre: r.shinLeftPre,
              shinRightPre: r.shinRightPre,
              shinLeftDuring: r.shinLeftDuring,
              shinRightDuring: r.shinRightDuring,
              shinLeftPost: r.shinLeftPost,
              shinRightPost: r.shinRightPost,
            })),
          });
        }
        if (
          path.length === 3 &&
          ["exercise", "exercises"].includes(path[0]!) &&
          path[2] === "history"
        ) {
          const id = z.uuid().safeParse(path[1]),
            machine = params.get("equipmentInstanceId");
          if (!id.success || (machine !== null && !z.uuid().safeParse(machine).success))
            return json({ error: "Invalid exercise or equipment ID." }, 400);
          const [exercise] = await tx
            .select({
              id: exercises.id,
              name: exercises.name,
              loadPortability: exercises.loadPortability,
            })
            .from(exercises)
            .where(eq(exercises.id, id.data))
            .limit(1);
          if (!exercise) return json({ error: "Exercise not found." }, 404);
          const result = await readWorkouts(tx, userId, range, pagination.page, pagination.limit, {
            exerciseId: id.data,
            equipmentInstanceId: machine ?? undefined,
          });
          return json({
            ...meta,
            ...pagination,
            hasMore: result.hasMore,
            exercise,
            comparison:
              exercise.loadPortability === "global"
                ? "Compare by exercise and unit across gyms."
                : "Compare only within the same equipmentInstanceId and unit. Missing machine IDs are not comparable.",
            performances: result.workouts.flatMap((w) =>
              w.exercises
                .filter(
                  (e) =>
                    e.exerciseId === id.data && (!machine || e.equipmentInstanceId === machine),
                )
                .map((e) => ({
                  ...e,
                  startedAt: w.startedAt,
                  sessionCompletedAt: w.completedAt,
                  gym: w.gym,
                })),
            ),
          });
        }
        return json({ error: "Unknown coach endpoint." }, 404);
      },
      { readOnly: true },
    );
  } catch {
    return json({ error: "Coach data is temporarily unavailable. Please retry." }, 503);
  }
}
