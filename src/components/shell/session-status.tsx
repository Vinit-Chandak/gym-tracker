import { requireOnboardedUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";

import { SessionChrome } from "./session-chrome";

/**
 * Reads the one unfinished workout for the shell. It stays behind the account gate and
 * shares its reads with the rest of the render — the profile is already cached per request,
 * and the session lookup is too — so the strip costs no extra round trip on a route that
 * needs the same session anyway.
 */
export async function SessionStatus() {
  const user = await requireOnboardedUser();
  const [profile, session] = await Promise.all([
    getRequestProfile(user.id, user.email),
    getActiveSession(user.id),
  ]);
  if (!session) return null;

  return (
    <SessionChrome
      session={{
        id: session.id,
        name: session.dayName ?? "Ad hoc session",
        restTimerEnabled: profile.restTimerEnabled,
      }}
    />
  );
}
