"use server";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { getSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";

export type DeleteAccountState = { error?: string };

/**
 * Whether the sign-in record can be deleted too.
 *
 * Supabase only lets the service-role key delete an auth user, and this app is otherwise built
 * to never hold that key. Without it, deleting an account removes every row of training data
 * (the profile cascades to gyms, sessions, sets, runs and tokens) but leaves the empty login,
 * which the user can then delete from the Supabase dashboard.
 */
export async function canDeleteSignIn(): Promise<boolean> {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && getSupabasePublicEnv());
}

/** Deletes the signed-in user's data, and their sign-in when the service-role key is present. */
export async function deleteAccountAction(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (formData.get("confirm") !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  // Deleting the profile cascades through every user-owned table (see the schema's foreign keys).
  await withUser(getDb(), user.id, (tx) => tx.delete(profiles).where(eq(profiles.id, user.id)));

  const env = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (env && serviceRoleKey) {
    const admin = createClient(env.url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      // The data is already gone; say so rather than pretending the whole thing failed.
      return {
        error:
          "Your training data was deleted, but the sign-in could not be removed. " +
          "Delete it from the Supabase dashboard.",
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
