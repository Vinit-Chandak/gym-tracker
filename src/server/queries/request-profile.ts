import { cache } from "react";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "./profile";

/** React's cache is scoped to one server render, never shared across requests or accounts. */
export const getRequestProfile = cache((id: string, email: string | null) =>
  withUser(getDb(), id, (tx) => ensureProfile(tx, { id, email })),
);
