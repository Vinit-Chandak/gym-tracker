import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { profiles } from "@/db/schema";
import type { Db } from "@/db/types";
import { withUser } from "@/db/with-user";
import { PLAN_TRIGGERS } from "@/domain/types";
import { getCoachServiceToken } from "@/lib/env";
import {
  listDueUsers,
  markRequestFailed,
  PlanValidationError,
  planningContext,
  recordAttempt,
  storePlan,
} from "@/server/repositories/coach-plans";
import { createProposal, ProposalError } from "@/server/repositories/program-revisions";

/**
 * The house coach's API: what the routine reads and writes.
 *
 * One secret authenticates it, held by the server and by the routine's cloud environment.
 * The token is not tied to any account; instead every request names the athlete it is
 * about, and that athlete must have switched the coach on. Reads and writes for an athlete
 * then run under that athlete's own Row Level Security, so a plan for one account can never
 * read or touch another.
 */

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Bearer token check that takes the same time whether or not the token matches. */
export function authenticateServiceToken(
  request: Request,
  expected = getCoachServiceToken(),
): boolean {
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice(7).trim()), digest(expected));
}

const slotSchema = z.object({
  cycleIndex: z.number().int().min(1),
  dayIndex: z.number().int().min(1),
});

const planBodySchema = z.object({
  slot: slotSchema,
  gymId: z.uuid(),
  trigger: z.enum(PLAN_TRIGGERS).default("nightly"),
  requestId: z.uuid().nullable().optional(),
  routineSessionUrl: z.url().max(300).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  summary: z.unknown(),
  warmup: z.unknown().optional(),
  exercises: z.unknown(),
  run: z.unknown().optional(),
  memo: z.unknown().optional(),
});

const failBodySchema = z.object({ error: z.string().trim().min(1).max(500) });

const attemptBodySchema = z.object({
  trigger: z.enum(PLAN_TRIGGERS).default("nightly"),
  status: z.enum(["planned", "failed"]),
  error: z.string().trim().max(500).nullable().optional(),
  gymId: z.uuid().nullable().optional(),
  routineSessionUrl: z.url().max(300).nullable().optional(),
});

const proposalBodySchema = z.object({
  summary: z.string().trim().min(1).max(300),
  rationale: z.string().trim().max(2000).nullable().optional(),
  patch: z.unknown(),
});

/** The athlete's row, only if they have switched the coach on. */
async function coachedAthlete(db: Db, userId: string) {
  if (!z.uuid().safeParse(userId).success) return null;
  const [row] = await db
    .select({ id: profiles.id, timeZone: profiles.timeZone, enabled: profiles.aiCoachEnabled })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row && row.enabled ? row : null;
}

export async function handleCoachServiceRequest(
  db: Db,
  request: Request,
  path: string[],
): Promise<Response> {
  if (!getCoachServiceToken())
    return json({ error: "The coach service is not configured on this server." }, 503);
  if (!authenticateServiceToken(request))
    return json({ error: "A coach service Bearer token is required." }, 401);
  const method = request.method.toUpperCase();
  const meta = { version: 1, generatedAt: new Date().toISOString() };
  try {
    if (path.length === 1 && path[0] === "due" && method === "GET") {
      return json({ ...meta, users: await listDueUsers(db) });
    }
    if (path[0] === "users" && path[1]) {
      const athlete = await coachedAthlete(db, path[1]);
      if (!athlete)
        return json(
          { error: "Unknown athlete, or the coach is switched off for this account." },
          403,
        );
      const rest = path.slice(2);
      if (rest.length === 1 && rest[0] === "context" && method === "GET") {
        const gymId = new URL(request.url).searchParams.get("gymId");
        if (gymId !== null && !z.uuid().safeParse(gymId).success)
          return json({ error: "Invalid gym id." }, 400);
        const context = await withUser(
          db,
          athlete.id,
          (tx) => planningContext(tx, athlete.id, { gymId: gymId ?? undefined }),
          { readOnly: true },
        );
        if (context.reason)
          return json(
            { ...meta, error: "Nothing to plan for this athlete.", reason: context.reason },
            409,
          );
        // `reason` says why there was nothing to plan, so it belongs only on the 409. Sending
        // it as null beside a real context reads as "the athlete gave no reason for this plan".
        const { reason: _nothingToPlan, ...plannable } = context;
        return json({ ...meta, ...plannable });
      }
      if (rest.length === 1 && rest[0] === "plans" && method === "POST") {
        const body = planBodySchema.safeParse(await request.json().catch(() => null));
        if (!body.success)
          return json(
            {
              error: "The plan request is malformed.",
              issues: body.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
              })),
            },
            400,
          );
        const { slot, gymId, trigger, requestId, routineSessionUrl, model, ...plan } = body.data;
        try {
          const stored = await withUser(db, athlete.id, (tx) =>
            storePlan(tx, athlete.id, {
              slot,
              gymId,
              trigger,
              requestId: requestId ?? null,
              routineSessionUrl: routineSessionUrl ?? null,
              model: model ?? null,
              plan,
            }),
          );
          return json(
            {
              ...meta,
              plan: {
                id: stored.id,
                slot: { cycleIndex: stored.cycleIndex, dayIndex: stored.dayIndex },
                gymId: stored.gymId,
                generatedAt: stored.generatedAt.toISOString(),
                exercises: stored.exercises.length,
              },
            },
            201,
          );
        } catch (error) {
          if (error instanceof PlanValidationError)
            return json({ error: error.message, issues: error.issues }, 422);
          throw error;
        }
      }
      if (rest.length === 1 && rest[0] === "attempts" && method === "POST") {
        const body = attemptBodySchema.safeParse(await request.json().catch(() => null));
        if (!body.success) return json({ error: "Send { trigger, status, error?, gymId? }." }, 400);
        const attempt = await withUser(db, athlete.id, (tx) =>
          recordAttempt(tx, athlete.id, {
            trigger: body.data.trigger,
            gymId: body.data.gymId ?? null,
            status: body.data.status,
            error: body.data.error ?? null,
            routineSessionUrl: body.data.routineSessionUrl ?? null,
          }),
        );
        return json({ ...meta, attempt: { id: attempt.id, status: attempt.status } }, 201);
      }
      if (rest.length === 1 && rest[0] === "proposals" && method === "POST") {
        const body = proposalBodySchema.safeParse(await request.json().catch(() => null));
        if (!body.success) return json({ error: "Send { summary, rationale?, patch }." }, 400);
        try {
          const proposal = await withUser(db, athlete.id, (tx) =>
            createProposal(tx, athlete.id, {
              source: "ai",
              summary: body.data.summary,
              rationale: body.data.rationale ?? null,
              patch: body.data.patch,
            }),
          );
          return json({ ...meta, proposal: { id: proposal.id, status: proposal.status } }, 201);
        } catch (error) {
          if (error instanceof ProposalError) return json({ error: error.message }, 422);
          throw error;
        }
      }
      if (rest.length === 3 && rest[0] === "requests" && rest[2] === "fail" && method === "POST") {
        const requestId = rest[1]!;
        if (!z.uuid().safeParse(requestId).success)
          return json({ error: "Invalid request id." }, 400);
        const body = failBodySchema.safeParse(await request.json().catch(() => null));
        if (!body.success) return json({ error: "Send { error: string }." }, 400);
        const marked = await withUser(db, athlete.id, (tx) =>
          markRequestFailed(tx, athlete.id, requestId, body.data.error),
        );
        return marked
          ? json({ ...meta, ok: true })
          : json({ error: "No open request with that id." }, 404);
      }
    }
    return json({ error: "Unknown coach service endpoint." }, 404);
  } catch {
    return json({ error: "The coach service is temporarily unavailable. Please retry." }, 503);
  }
}
