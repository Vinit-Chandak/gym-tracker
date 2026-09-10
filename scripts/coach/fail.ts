import { api, args, fail } from "./client";

/**
 * Tells the app that a re-plan the athlete asked for could not be done, so Today stops
 * waiting and says why.
 *
 *   npx tsx scripts/coach/fail.ts --user <id> --request <id> --error "why"
 */
const a = args();
const user = a.get("user");
const request = a.get("request");
const error = a.get("error");
if (!user || !request || !error) fail("Pass --user <id> --request <id> --error <text>.");

api(`users/${user}/requests/${request}/fail`, { method: "POST", body: { error } })
  .then(() => console.log(`Marked request ${request} as failed.`))
  .catch(fail);
