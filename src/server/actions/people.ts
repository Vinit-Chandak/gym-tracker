"use server";

import { getDb } from "@/db/client";
import { normaliseUsername, usernameProblem } from "@/domain/username";
import { usernameAvailable } from "@/server/repositories/people";

export type UsernameCheck = "available" | "taken" | "invalid";

/**
 * The live check under a username field. No `requireUser()`: the signup form asks before an
 * account exists. Runs outside `withUser` for the same reason — see `usernameAvailable`.
 */
export async function checkUsernameAction(candidate: string): Promise<UsernameCheck> {
  const username = normaliseUsername(typeof candidate === "string" ? candidate : "");
  if (usernameProblem(username)) return "invalid";
  return (await usernameAvailable(getDb(), username)) ? "available" : "taken";
}
