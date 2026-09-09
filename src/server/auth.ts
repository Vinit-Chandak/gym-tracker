import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/server/queries/profile";

export type SessionUser = { id: string; email: string | null };

/** The signed-in user from the verified JWT, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always resolve at request time so pages using this are never prerendered at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** Redirects to /login when nobody is signed in. Use at the top of protected pages and actions. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Like `requireUser`, but also sends accounts that have not finished the first-run flow to
 * `/welcome`. Used by the tab shell, so every screen behind the bottom navigation can assume
 * the profile has been set up.
 */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  const profile = await withUser(getDb(), user.id, (tx) => ensureProfile(tx, user));
  if (profile.onboardedAt === null) redirect("/welcome");
  return user;
}
