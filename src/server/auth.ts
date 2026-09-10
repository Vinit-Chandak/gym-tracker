import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { getClaimsOptions } from "@/lib/supabase/jwks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

export type SessionUser = { id: string; email: string | null };

/** The signed-in user from the verified JWT, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always resolve at request time so pages using this are never prerendered at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims(undefined, getClaimsOptions());
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
 * Like `requireUser`, but sends an account that has not answered the first setup step back to
 * it. The steps after it may all be skipped; that one may not, and typing a later URL is not a
 * way around it. An account that finished setup before a question existed is left alone —
 * Settings is where it answers, and being bounced through setup again would be a lie about
 * what it is missing.
 */
export async function requireProfiledUser(): Promise<SessionUser> {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  if (profile.onboardedAt === null && missingProfileDetails(profile).length > 0) {
    redirect("/welcome");
  }
  return user;
}

/**
 * Like `requireUser`, but also sends accounts that have not finished the first-run flow to
 * `/welcome`. Used by the tab shell, so every screen behind the bottom navigation can assume
 * the profile has been set up.
 */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  if (profile.onboardedAt === null) redirect("/welcome");
  return user;
}
