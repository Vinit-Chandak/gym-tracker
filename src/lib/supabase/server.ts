import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/env";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SETUP.md).",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

/** Per-request Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createSupabaseServerClient() {
  const env = getSupabasePublicEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot write cookies.
          // The proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}
