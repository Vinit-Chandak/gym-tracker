import { api, args, fail } from "./client";

/**
 * Records what happened when the coach tried to plan for one athlete, so a night it could
 * not plan is visible in the app rather than only in this transcript.
 *
 *   npx tsx scripts/coach/attempt.ts --user <id> --status planned
 *   npx tsx scripts/coach/attempt.ts --user <id> --status failed --error "no gym registered"
 */
const a = args();
const user = a.get("user");
const status = a.get("status");
if (!user || (status !== "planned" && status !== "failed"))
  fail("Pass --user <id> --status planned|failed [--error <text>] [--gym <id>].");

api(`users/${user}/attempts`, {
  method: "POST",
  body: {
    trigger: a.get("trigger") === "replan" ? "replan" : "nightly",
    status,
    error: a.get("error") ?? null,
    gymId: a.get("gym") ?? null,
  },
})
  .then(() => console.log(`Recorded a ${status} attempt for ${user}.`))
  .catch(fail);
