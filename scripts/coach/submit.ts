import { readFileSync } from "node:fs";
import { z } from "zod";

import { coachPlanSchema } from "../../src/domain/session-plan";
import { PLAN_TRIGGERS } from "../../src/domain/types";
import { api, args, fail, ServiceError } from "./client";

/**
 * Checks a plan file the way the server will, then stores it.
 *
 *   npx tsx scripts/coach/submit.ts --user <id> --file /tmp/coach/<id>.plan.json [--model <id>]
 *
 * The file holds the envelope (slot, gymId, trigger, requestId) and the plan itself. Local
 * validation catches shape mistakes before the request; the server then checks that every
 * exercise, machine and slot really belongs to the athlete, and answers with issues if not.
 *
 * Exit codes: 0 stored; 1 the file or the connection was the problem; 2 the plan named
 * something the athlete does not have, listed in the output, so fix those and submit again;
 * 3 the server will not take a plan for this slot at all — record the failure instead of
 * retrying.
 */
const envelope = z.object({
  slot: z.object({ cycleIndex: z.number().int().min(1), dayIndex: z.number().int().min(1) }),
  gymId: z.uuid(),
  trigger: z.enum(PLAN_TRIGGERS).default("nightly"),
  requestId: z.uuid().nullable().optional(),
});

const a = args();
const user = a.get("user");
const file = a.get("file");
if (!user || !file) fail("Pass --user <id> --file <plan.json>.");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file!, "utf8"));
} catch (error) {
  fail(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
}
const meta = envelope.safeParse(raw);
const plan = coachPlanSchema.safeParse(raw);
const issues = [
  ...(meta.success ? [] : meta.error.issues),
  ...(plan.success ? [] : plan.error.issues),
];
if (issues.length > 0) {
  console.error("The plan file is not valid:");
  for (const issue of issues)
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  process.exit(1);
}

const body = {
  ...meta.data!,
  ...plan.data!,
  model: a.get("model") ?? null,
  routineSessionUrl: process.env.CLAUDE_CODE_SESSION_URL ?? null,
};

api<{ plan: { id: string; slot: { cycleIndex: number; dayIndex: number }; exercises: number } }>(
  `users/${user}/plans`,
  { method: "POST", body },
)
  .then((result) => {
    console.log(
      `Stored plan ${result.plan.id} for slot ${result.plan.slot.cycleIndex}:${result.plan.slot.dayIndex} with ${result.plan.exercises} exercises.`,
    );
  })
  .catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 422) {
      // A 422 comes in two kinds. With `issues`, the plan named something the athlete does not
      // have: fix exactly those and submit again. Without them, nothing about the plan is wrong
      // — the slot, the programme or the request has moved on — and resubmitting cannot help.
      const issues = (error.body as { issues?: unknown } | null)?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        console.error("The server rejected the plan. Fix these and submit again:");
        console.error(error.message);
        process.exit(2);
      }
      console.error("The server will not take a plan for this slot. Do not retry:");
      console.error(error.message);
      process.exit(3);
    }
    fail(error);
  });
