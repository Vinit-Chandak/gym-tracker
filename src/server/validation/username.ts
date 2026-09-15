import { z } from "zod";

import { normaliseUsername, usernameProblem } from "@/domain/username";

/**
 * A username as a form field: trimmed, lowercased, a leading `@` forgiven, then held to the
 * rules in `domain/username.ts`. Whether it is free is the database's question, answered by
 * the unique index on save and by `username_available()` while typing.
 */
export const usernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normaliseUsername(value) : ""),
  z.string().superRefine((candidate, ctx) => {
    const problem = usernameProblem(candidate);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
);

/** What the forms say when the unique index refuses a save. */
export const USERNAME_TAKEN_MESSAGE = "That username is taken.";
