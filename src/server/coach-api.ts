import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  ApiRequestError,
  programmeRepresentableInV1,
  v2Activities,
  v2Program,
  v2Summary,
} from "@/server/coach-api-v2";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};

/**
 * What a v1 response says about its own future (plan §8.6).
 *
 * Headers, not new JSON fields: a strict v1 consumer parses a fixed shape, and adding a key
 * to the body to announce a deprecation is itself the breaking change the deprecation is
 * warning about. `Sunset` is advisory until the compatibility window's dates are recorded at
 * cutover; the link points at the documentation rather than at v2's JSON, because a client
 * should read before it switches.
 */
const V1_COMPATIBILITY = {
  Deprecation: "true",
  Link: '</docs/coach-api.md>; rel="deprecation"; type="text/markdown"',
  "X-Coach-Api-Supported-Sports": "workout, run",
};

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });
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

/**
 * Whether version 1 has been retired on this database.
 *
 * Asked of the schema rather than of a flag or a marker, because retirement is not a
 * preference somebody can toggle back: v1 reads the raw run table, and after the contraction
 * that table is gone. `to_regclass` answers in one round trip, needs no policy of its own,
 * and cannot disagree with reality the way a cached flag can. Before the contraction it is
 * false and every v1 path answers exactly as it always did.
 */
async function legacyApiRetired(tx: DbOrTx): Promise<boolean> {
  const result = await tx.execute(sql`select to_regclass('public.runs') is null as retired`);
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows[0] as { retired?: boolean } | undefined)?.retired === true;
}

/**
 * The v2 surface, under the same token and the same read-only transaction.
 *
 * Separate from v1 in every respect that matters to a consumer: its own paths, its own
 * `version` in the body, its own cursors. Nothing here changes what a v1 path returns.
 */
async function handleV2(
  tx: DbOrTx,
  userId: string,
  endpoint: string,
  params: URLSearchParams,
  timeZone: string,
): Promise<Response> {
  const today = todayInTimeZone(timeZone, new Date());
  try {
    if (endpoint === "activities") return json(await v2Activities(tx, userId, params, today));
    if (endpoint === "summary") return json(await v2Summary(tx, userId, params, today));
    if (endpoint === "program/current") return json(await v2Program(tx, userId, today));
    return json({ error: "Unknown v2 endpoint.", version: 2 }, 404);
  } catch (error) {
    if (error instanceof ApiRequestError)
      return json({ error: error.detail, version: 2 }, error.status);
    throw error;
  }
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
        if (endpoint.startsWith("v2/"))
          return await handleV2(tx, userId, endpoint.slice(3), params, profile.timeZone);
        /**
         * Version 1 after its window has run (plan §8.6, AT-API-06).
         *
         * `410 Gone` with somewhere to go, not a redirect: a JSON client handed an HTML page
         * or a v2 body it did not ask for cannot tell what happened, and a permanent status
         * is the only one that says "this will not come back". The contraction marker is what
         * decides, so the answer changes when the operator retires it and not before.
         */
        if (await legacyApiRetired(tx))
          return json(
            {
              error: "gone",
              detail:
                "Version 1 of this API has been retired after its compatibility window. Read /api/coach/v2/activities and /api/coach/v2/summary; see docs/coach-api.md.",
              version: 1,
              upgradeTo: "/api/coach/v2/activities",
            },
            410,
            V1_COMPATIBILITY,
          );
        if (endpoint === "program/current") {
          // A programme with a ride or a swim in it has no v1 shape. Saying so is the whole
          // point: half a programme presented as the programme cannot be detected downstream.
          const representable = await programmeRepresentableInV1(tx, userId);
          if (!representable.ok)
            return json(
              {
                error: "upgrade_required",
                detail: `This programme includes ${representable.sports.join(" and ")}, which version 1 cannot describe. Read /api/coach/v2/program/current.`,
                version: 1,
                upgradeTo: "/api/coach/v2/program/current",
              },
              409,
              V1_COMPATIBILITY,
            );
          return json(
            { ...meta, program: await currentProgram(tx, userId) },
            200,
            V1_COMPATIBILITY,
          );
        }
        if (endpoint === "workouts") {
          const result = await readWorkouts(tx, userId, range, pagination.page, pagination.limit);
          return json({ ...meta, ...pagination, ...result }, 200, V1_COMPATIBILITY);
        }
        if (endpoint === "running")
          return json(
            {
              ...meta,
              ...pagination,
              ...(await readRuns(tx, userId, range, pagination.page, pagination.limit)),
            },
            200,
            V1_COMPATIBILITY,
          );
        if (endpoint === "summary") {
          const data = await readTrainingData(tx, userId, range);
          return json(
            {
              ...meta,
              summary: trainingAnalytics(data, profile.timeZone, range.from, range.to),
              adherence: liftingAdherence(await getSchedule(tx, userId)),
            },
            200,
            V1_COMPATIBILITY,
          );
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
            })),
            runs: runData.runs.map((r) => ({
              runId: r.id,
              startedAt: r.startedAt,
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
