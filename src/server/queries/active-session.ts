import { cache } from "react";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { getInProgressSession, type SessionSummary } from "@/server/repositories/sessions";

/**
 * The one unfinished workout, if there is one.
 *
 * React's cache shares a single read across the whole render, so the shell's resume strip
 * and a page that needs the same session share one transaction rather than opening one
 * each. The server rule that allows only one unfinished session is unchanged and still
 * enforced where sessions are started; this is only the read.
 *
 * Read-only, so it takes no athlete lock: Today and Training run it beside their own
 * transaction, and with the lock the two queued behind each other on the same profile row.
 */
export const getActiveSession = cache(async (userId: string): Promise<SessionSummary | null> =>
  withUser(getDb(), userId, (tx) => getInProgressSession(tx, userId), { readOnly: true }),
);
