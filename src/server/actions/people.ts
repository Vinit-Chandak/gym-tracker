"use server";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { FollowRelation } from "@/domain/follows";
import { normaliseUsername, usernameProblem } from "@/domain/username";
import { requireUser } from "@/server/auth";
import { followRelations } from "@/server/repositories/follows";
import { searchDirectory, usernameAvailable } from "@/server/repositories/people";
import { searchQuerySchema } from "@/server/validation/people";

export type UsernameCheck = "available" | "taken" | "invalid";

/** A search hit: who they are, and where you stand with them, for the button beside them. */
export type PersonResult = {
  id: string;
  username: string;
  displayName: string | null;
  relation: FollowRelation;
};

/** Find people (plan §3.4). The results are an action's reply, not a page, so nothing is cached. */
export async function searchPeopleAction(query: string): Promise<PersonResult[]> {
  const user = await requireUser();
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) return [];
  return withUser(
    getDb(),
    user.id,
    async (tx) => {
      const people = await searchDirectory(tx, user.id, parsed.data);
      const relations = await followRelations(tx, user.id, people);
      return people.map((person, i) => ({
        id: person.id,
        username: person.username,
        displayName: person.displayName,
        relation: relations[i]!,
      }));
    },
    { readOnly: true },
  );
}

/**
 * The live check under a username field. No `requireUser()`: the signup form asks before an
 * account exists. Runs outside `withUser` for the same reason — see `usernameAvailable`.
 */
export async function checkUsernameAction(candidate: string): Promise<UsernameCheck> {
  const username = normaliseUsername(typeof candidate === "string" ? candidate : "");
  if (usernameProblem(username)) return "invalid";
  return (await usernameAvailable(getDb(), username)) ? "available" : "taken";
}
