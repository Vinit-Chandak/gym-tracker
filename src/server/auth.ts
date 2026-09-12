import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { getClaimsOptions } from "@/lib/supabase/jwks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onboardingEntry } from "@/server/queries/onboarding-entry";
import { getRequestProfile } from "@/server/queries/request-profile";

export type SessionUser = { id: string; email: string | null; displayName?: string | null };

/** The signed-in user from the verified JWT, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always resolve at request time so pages using this are never prerendered at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims(undefined, getClaimsOptions());
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const metadata = claims.user_metadata as Record<string, unknown> | undefined;
  const name = metadata?.display_name ?? metadata?.full_name;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    displayName: typeof name === "string" ? name.trim().slice(0, 80) || null : null,
  };
});

/** Redirects to /login when nobody is signed in. Use at the top of protected pages and actions. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Like `requireUser`, ensuring the account's profile exists before onboarding actions.
 * Units and time zone have valid database defaults. Optional name, body measurements and
 * coaching goals must not redirect a manual/tracking user back to the first setup screen.
 */
export async function requireProfiledUser(): Promise<SessionUser> {
  const user = await requireUser();
  await getRequestProfile(user.id, user.email, user.displayName);
  return user;
}

/**
 * Like `requireUser`, but also sends accounts that have not finished the first-run flow to
 * `/welcome`. Used by the tab shell, so every screen behind the bottom navigation can assume
 * the profile has been set up.
 */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  if (profile.onboardedAt === null) redirect(await onboardingEntry(user.id));
  return user;
}
