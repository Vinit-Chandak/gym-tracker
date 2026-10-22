"use server";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { APP_NAME } from "@/lib/app";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { safeAppPath } from "@/lib/safe-app-path";
import { getDb } from "@/db/client";
import { numberedUsernames, usernameFromName } from "@/domain/username";
import { usernameAvailable } from "@/server/repositories/people";

/** A sentence for the form, and the field it is about when it is about one. */
export type SignInState = { error?: string; field?: "email" | "password" };
export type SignUpState = { error?: string; field?: "email" | "password"; checkEmail?: string };
export type PasswordResetState = { error?: string; sent?: boolean };
export type PasswordChangeState = {
  error?: string;
  field?: "password" | "confirmPassword";
  done?: boolean;
};

const AUTH_TIMEOUT_MS = 15_000;
const UNREACHABLE_MESSAGE =
  "Could not reach the sign-in service. Check your connection and try again.";

/** Supabase's own minimum is 6; 8 is the shortest that is worth calling a password. */
const MIN_PASSWORD_LENGTH = 8;

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(72, "Passwords are limited to 72 characters.");

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Sign-up asks for a name (optional), an email and one password, shown on request rather than
 * typed twice. The username is not asked for: it is made from the name, and the auth trigger
 * makes one from the email when that one is taken or there is no name (ADR 0026). It is
 * changed later from the profile.
 */
const signUpSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  displayName: z.string().trim().max(80).optional(),
  next: z.string().optional(),
});

/**
 * The first username free among those made from the name (`kit`, `kit2`…), or "" when there is
 * none, or the directory cannot be asked: the auth trigger then makes one from the email. The
 * trigger checks again, so a name taken between here and there is never given twice.
 */
async function freeUsernameFrom(name: string): Promise<string> {
  try {
    for (const candidate of numberedUsernames(usernameFromName(name)))
      if (await usernameAvailable(getDb(), candidate)) return candidate;
  } catch {
    // The directory could not be asked: leave the choice to the trigger.
  }
  return "";
}

/** Only same-origin paths inside the app are accepted as a post-login destination. */
function safeNextPath(next: string | undefined): Route {
  if (!safeAppPath(next) || next?.startsWith("/login")) {
    return "/today";
  }
  // Validated above as a same-origin path; typed routes cannot express that statically.
  return next as Route;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out")), ms);
  });
}

/** Runs a Supabase auth call with a timeout, turning transport failures into one message. */
async function attempt<T>(work: Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await Promise.race([work, timeout(AUTH_TIMEOUT_MS)]) };
  } catch {
    return { error: UNREACHABLE_MESSAGE };
  }
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    // Each field's own sentence, under that field: what is missing, or what is wrong with it.
    const email = String(formData.get("email") ?? "").trim();
    if (email === "") return { error: "Enter your email.", field: "email" };
    if (!z.email().safeParse(email).success)
      return { error: "Enter a valid email address, such as name@example.com.", field: "email" };
    return { error: "Enter your password.", field: "password" };
  }

  const supabase = await createSupabaseServerClient();
  const { value, error: transport } = await attempt(
    supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    }),
  );
  if (transport) return { error: transport };
  const error = value?.error;
  if (error) {
    if (isAuthRetryableFetchError(error)) return { error: UNREACHABLE_MESSAGE };
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email address first — check your inbox for the link." };
    }
    return {
      error:
        "That email and password combination did not work. Check both, or reset your password below.",
    };
  }

  redirect(safeNextPath(parsed.data.next));
}

/**
 * Creates an account. Whether the user can sign in straight away depends on the Supabase
 * project: with email confirmation on, Supabase returns a user without a session and sends a
 * link, and `/auth/confirm` finishes the job. Both paths are handled here.
 */
export async function signUpAction(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
    displayName: formData.get("displayName") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    // Each field's own sentence, under that field, as on the sign-in form.
    const email = String(formData.get("email") ?? "").trim();
    if (email === "") return { error: "Enter your email.", field: "email" };
    if (!z.email().safeParse(email).success)
      return { error: "Enter a valid email address, such as name@example.com.", field: "email" };
    const password = passwordSchema.safeParse(formData.get("password") ?? "");
    if (!password.success)
      return {
        error: password.error.issues[0]?.message ?? "Choose a password.",
        field: "password",
      };
    return { error: "Check the details and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const displayName = parsed.data.displayName?.trim();
  const username = displayName ? await freeUsernameFrom(displayName) : "";
  const metadata = {
    ...(displayName ? { display_name: displayName } : {}),
    ...(username ? { username } : {}),
  };
  const { value, error: transport } = await attempt(
    supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // No query string of its own: Supabase matches the whole redirect URL against the
        // project's Redirect URLs, so anything appended here has to be allow-listed too.
        // `/auth/confirm` works out where to send the user once the link is confirmed.
        emailRedirectTo: `${await getSiteUrl()}/auth/confirm`,
        ...(Object.keys(metadata).length > 0 ? { data: metadata } : {}),
      },
    }),
  );
  if (transport) return { error: transport };
  const error = value?.error;
  if (error) {
    if (isAuthRetryableFetchError(error)) return { error: UNREACHABLE_MESSAGE };
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "That email already has an account. Sign in instead.", field: "email" };
    }
    if (error.code === "signup_disabled") {
      return { error: `${APP_NAME} is not accepting new accounts right now.` };
    }
    if (error.code === "weak_password") {
      return { error: "Pick a stronger password.", field: "password" };
    }
    return { error: error.message };
  }

  // A repeat signup can return an obfuscated user with no identities and no session.
  // Supabase deliberately does not send another confirmation for an already confirmed login.
  if (value?.data.user?.identities?.length === 0) {
    return {
      error: "You may already have an account with this email. Sign in, or reset your password.",
    };
  }
  if (!value?.data.user) return { error: "Could not create your account. Please try again." };
  if (!value.data.session) return { checkEmail: parsed.data.email };
  redirect("/welcome");
}

export async function requestPasswordResetAction(
  _previous: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter the email address you signed up with." };

  const supabase = await createSupabaseServerClient();
  const { value, error: transport } = await attempt(
    supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${await getSiteUrl()}/auth/confirm`,
    }),
  );
  if (transport) return { error: transport };
  if (value?.error) {
    if (isAuthRetryableFetchError(value.error)) return { error: UNREACHABLE_MESSAGE };
    return { error: "Could not request a reset link right now. Please try again later." };
  }
  // Deliberately the same answer whether or not the address has an account.
  return { sent: true };
}

/** Sets a new password for the signed-in user — after a recovery link, or from Profile. */
export async function updatePasswordAction(
  _previous: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const parsed = z
    .object({ password: passwordSchema, confirmPassword: z.string() })
    .refine((values) => values.password === values.confirmPassword, {
      message: "The two passwords do not match.",
      path: ["confirmPassword"],
    })
    .safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      error: issue?.message ?? "Check the password and try again.",
      ...(field === "password" || field === "confirmPassword" ? { field } : {}),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return { error: "That link has expired. Ask for a new password reset email." };
  }

  const { value, error: transport } = await attempt(
    supabase.auth.updateUser({ password: parsed.data.password }),
  );
  if (transport) return { error: transport };
  if (value?.error) {
    if (value.error.code === "same_password") {
      return { error: "That is already your password. Choose a different one.", field: "password" };
    }
    return { error: value.error.message };
  }
  return { done: true };
}

/** The caller clears local drafts only after Auth confirms the session has ended. */
export async function signOutAction(): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { value, error } = await attempt(supabase.auth.signOut());
  if (error || value?.error) {
    return { error: "Could not sign out. Check your connection and try again." };
  }
  return {};
}
