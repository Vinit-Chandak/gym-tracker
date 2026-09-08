"use server";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

const SIGN_IN_TIMEOUT_MS = 15_000;
const UNREACHABLE_MESSAGE =
  "Could not reach the sign-in service. Check your connection and try again.";

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** Only same-origin paths inside the app are accepted as a post-login destination. */
function safeNextPath(next: string | undefined): Route {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
    return "/today";
  }
  // Validated above as a same-origin path; typed routes cannot express that statically.
  return next as Route;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Sign-in timed out")), ms);
  });
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  let failure: string | undefined;
  try {
    const { error } = await Promise.race([
      supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
      timeout(SIGN_IN_TIMEOUT_MS),
    ]);
    if (error) {
      failure = isAuthRetryableFetchError(error)
        ? UNREACHABLE_MESSAGE
        : "That email and password combination did not work.";
    }
  } catch {
    failure = UNREACHABLE_MESSAGE;
  }
  if (failure) return { error: failure };

  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
