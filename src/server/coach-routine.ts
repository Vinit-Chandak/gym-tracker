import { getCoachRoutine } from "@/lib/env";

/**
 * Starts a run of the house-coach routine on demand.
 *
 * The routine is a Claude Code routine on the app owner's claude.ai account. Its API trigger
 * gives it a fire endpoint and a token scoped to that one routine; the app keeps both as
 * server environment variables. The request returns as soon as the run has been created,
 * with a link to the session; the plan itself arrives minutes later through the service API.
 */

/** Beta header the fire endpoint requires; the two previous versions keep working after a bump. */
const ROUTINE_BETA = "experimental-cc-routine-2026-04-01";
const FIRE_TIMEOUT_MS = 15_000;

export type RoutineRun = { sessionId: string; sessionUrl: string };

export class RoutineNotConfiguredError extends Error {
  constructor() {
    super("The coach routine is not configured on this server.");
    this.name = "RoutineNotConfiguredError";
  }
}

export class RoutineFireError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "RoutineFireError";
  }
}

/** The lines the routine's prompt reads out of a re-plan's fire payload. */
export function replanPayload(input: {
  userId: string;
  gymId: string;
  requestId: string;
  reason: string | null;
}): string {
  return [
    "replan",
    `user: ${input.userId}`,
    `gym: ${input.gymId}`,
    `request: ${input.requestId}`,
    `reason: ${(input.reason ?? "asked from Today").replace(/\s+/g, " ").slice(0, 200)}`,
  ].join("\n");
}

export async function fireCoachRoutine(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RoutineRun> {
  const routine = getCoachRoutine();
  if (!routine) throw new RoutineNotConfiguredError();
  let response: Response;
  try {
    response = await fetchImpl(routine.fireUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${routine.token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": ROUTINE_BETA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
  } catch {
    throw new RoutineFireError("Could not reach the coach routine. Try again shortly.", null);
  }
  if (response.status === 429)
    throw new RoutineFireError(
      "The coach has used up today's runs on the owner's plan. It plans again overnight.",
      429,
    );
  if (!response.ok)
    throw new RoutineFireError(
      response.status === 401 || response.status === 404
        ? "The coach routine rejected the app's token. The owner needs to check the setup."
        : "The coach routine could not be started. Try again shortly.",
      response.status,
    );
  const body = (await response.json().catch(() => null)) as {
    claude_code_session_id?: string;
    claude_code_session_url?: string;
  } | null;
  if (!body?.claude_code_session_id || !body.claude_code_session_url)
    throw new RoutineFireError("The coach routine answered in an unexpected shape.", 200);
  return { sessionId: body.claude_code_session_id, sessionUrl: body.claude_code_session_url };
}
