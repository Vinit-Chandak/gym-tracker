"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { forgetProfile } from "@/server/queries/request-profile";

export type DeleteAccountState = { error?: string };

/**
 * Whether the sign-in record can be deleted too.
 *
 * A full deletion needs Supabase's server-only admin credential. There is no data-only fallback.
 */
export async function canDeleteSignIn(): Promise<boolean> {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && getSupabasePublicEnv());
}

/** Delete Auth first; the auth.users foreign key cascades through the entire app atomically. */
export async function deleteAccountAction(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (formData.get("confirm") !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const env = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceRoleKey) {
    return {
      error:
        "Account deletion is temporarily unavailable. Your account and data have not been changed.",
    };
  }
  try {
    const admin = createClient(env.url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return {
        error: "Your account could not be deleted. Please try again later.",
      };
    }
  } catch {
    return {
      error:
        "Could not confirm account deletion. Please try signing in to check your account before retrying.",
    };
  }
  forgetProfile(user.id);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
