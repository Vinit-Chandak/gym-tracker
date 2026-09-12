"use server";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { APP_NAME } from "@/lib/app";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { safeAppPath } from "@/lib/safe-app-path";

export type SignInState = { error?: string };
export type SignUpState = { error?: string; checkEmail?: string };
export type PasswordResetState = { error?: string; sent?: boolean };
export type PasswordChangeState = { error?: string; done?: boolean };

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

const signUpSchema = z
  .object({
    email: z.email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
    displayName: z.string().trim().max(80).optional(),
    next: z.string().optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

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
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

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
    return { error: "That email and password combination did not work." };
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
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    displayName: formData.get("displayName") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const displayName = parsed.data.displayName?.trim();
  const { value, error: transport } = await attempt(
    supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // No query string of its own: Supabase matches the whole redirect URL against the
        // project's Redirect URLs, so anything appended here has to be allow-listed too.
        // `/auth/confirm` works out where to send the user once the link is confirmed.
        emailRedirectTo: `${await getSiteUrl()}/auth/confirm`,
        ...(displayName ? { data: { display_name: displayName } } : {}),
      },
    }),
  );
  if (transport) return { error: transport };
  const error = value?.error;
  if (error) {
    if (isAuthRetryableFetchError(error)) return { error: UNREACHABLE_MESSAGE };
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "That email already has an account. Sign in instead." };
    }
    if (error.code === "signup_disabled") {
      return { error: `${APP_NAME} is not accepting new accounts right now.` };
    }
    if (error.code === "weak_password") {
      return { error: "Pick a stronger password." };
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
  const email = z.email().safeParse(formData.get("email"));
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

/** Sets a new password for the signed-in user — after a recovery link, or from Settings. */
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
    return { error: parsed.error.issues[0]?.message ?? "Check the password and try again." };
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
      return { error: "That is already your password. Choose a different one." };
    }
    return { error: value.error.message };
  }
  return { done: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
