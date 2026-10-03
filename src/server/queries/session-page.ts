import { getActiveSession } from "./active-session";
import { getRequestProfile } from "./request-profile";

/**
 * What a page of the session's own shows in its header (boards Check-in, Add exercise): the
 * session's name, which its way back names, and whether the account keeps a rest timer, whose
 * pill stands beside it. Both reads are the shell's own, cached for the request.
 */
export async function sessionPageHeader(
  user: { id: string; email?: string | null },
  sessionId: string,
): Promise<{ name: string; restTimerEnabled: boolean }> {
  const [profile, active] = await Promise.all([
    getRequestProfile(user.id, user.email ?? null),
    getActiveSession(user.id),
  ]);
  return {
    name: (active?.id === sessionId ? active.dayName : null) ?? "Ad hoc session",
    restTimerEnabled: profile.restTimerEnabled,
  };
}
