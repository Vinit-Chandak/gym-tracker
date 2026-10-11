import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getClaims: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: async () => "http://localhost:3010" }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const directory = vi.hoisted(() => ({ taken: new Set<string>() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/repositories/people", () => ({
  usernameAvailable: async (_db: unknown, candidate: string) => !directory.taken.has(candidate),
}));
import {
  requestPasswordResetAction,
  updatePasswordAction,
  signUpAction,
  signInAction,
} from "./auth";
import { redirect } from "next/navigation";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});

const signup = () =>
  form({
    email: "athlete@example.test",
    displayName: "Sam",
    password: "Example-password-1!",
  });

it("does not promise email delivery for an obfuscated repeat signup", async () => {
  auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
  const result = await signUpAction({}, signup());
  expect(result.error).toMatch(/already have an account/);
  expect(result.checkEmail).toBeUndefined();
  expect(redirect).not.toHaveBeenCalled();
});

it("passes the signup name to Auth and requests confirmation only for a new identity", async () => {
  auth.signUp.mockResolvedValue({
    data: { user: { id: "new-user", identities: [{ id: "email-identity" }] }, session: null },
    error: null,
  });
  expect(await signUpAction({}, signup())).toEqual({ checkEmail: "athlete@example.test" });
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: {
        data: { display_name: "Sam", username: "sam" },
        emailRedirectTo: "http://localhost:3010/auth/confirm",
      },
    }),
  );
});

it("asks Auth for a username made from the name, and none when the name gives none", async () => {
  auth.signUp.mockResolvedValue({
    data: { user: { id: "new-user", identities: [{ id: "email-identity" }] }, session: null },
    error: null,
  });
  const data = signup();
  data.set("displayName", " Bea Newcomer ");
  await signUpAction({}, data);
  expect(auth.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        data: { display_name: "Bea Newcomer", username: "bea.newcomer" },
      }),
    }),
  );
  // Too short to be a username: the auth trigger makes one from the email instead.
  data.set("displayName", "Al");
  await signUpAction({}, data);
  expect(auth.signUp).toHaveBeenLastCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ data: { display_name: "Al" } }),
    }),
  );
  // Taken: the next number that is free, rather than a name made from the email.
  directory.taken.add("bea.newcomer");
  directory.taken.add("bea.newcomer2");
  data.set("displayName", "Bea Newcomer");
  await signUpAction({}, data);
  expect(auth.signUp).toHaveBeenLastCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        data: { display_name: "Bea Newcomer", username: "bea.newcomer3" },
      }),
    }),
  );
  directory.taken.clear();
  // No name at all: nothing to pass.
  data.set("displayName", "  ");
  await signUpAction({}, data);
  expect(auth.signUp).toHaveBeenLastCalledWith(
    expect.objectContaining({
      options: { emailRedirectTo: "http://localhost:3010/auth/confirm" },
    }),
  );
});

it("says what is wrong under the field it is about", async () => {
  expect(await signUpAction({}, form({ email: "", password: "Example-password-1!" }))).toEqual({
    error: "Enter your email.",
    field: "email",
  });
  expect(
    await signUpAction({}, form({ email: "not-an-address", password: "Example-password-1!" })),
  ).toEqual({ error: "Enter a valid email address, such as name@example.com.", field: "email" });
  expect(await signUpAction({}, form({ email: "a@example.test", password: "short" }))).toEqual({
    error: "Use at least 8 characters.",
    field: "password",
  });
  expect(auth.signUp).not.toHaveBeenCalled();
  auth.signUp.mockResolvedValue({ data: {}, error: { code: "email_exists", message: "" } });
  expect(await signUpAction({}, signup())).toEqual({
    error: "That email already has an account. Sign in instead.",
    field: "email",
  });
});

it("does not treat an empty provider response or delivery failure as a successful signup", async () => {
  auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  expect((await signUpAction({}, signup())).error).toBeTruthy();
  auth.signUp.mockResolvedValue({
    data: {},
    error: { code: "over_email_send_rate_limit", message: "Too many emails" },
  });
  expect((await signUpAction({}, signup())).checkEmail).toBeUndefined();
});

it("continues an auto-confirmed signup and rejects sign-in for unconfirmed email", async () => {
  auth.signUp.mockResolvedValue({
    data: { user: { id: "new-user", identities: [{}] }, session: {} },
    error: null,
  });
  await signUpAction({}, signup());
  expect(redirect).toHaveBeenCalledWith("/welcome");
  auth.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed" } });
  expect((await signInAction({}, signup())).error).toMatch(/Confirm your email/);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("does not claim a reset link was sent when the provider rejects the request", async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
  expect(await requestPasswordResetAction({}, form({ email: "qa@example.test" }))).toEqual({
    error: "Could not request a reset link right now. Please try again later.",
  });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  expect(await requestPasswordResetAction({}, form({ email: "qa@example.test" }))).toEqual({
    sent: true,
  });
});

it("validates password confirmation and requires a current sign-in before changing it", async () => {
  const data = form({ password: "Local-test-password-1!", confirmPassword: "different" });
  expect(await updatePasswordAction({}, data)).toEqual({
    error: "The two passwords do not match.",
  });
  expect(auth.updateUser).not.toHaveBeenCalled();
  data.set("confirmPassword", "Local-test-password-1!");
  auth.getClaims.mockResolvedValue({ data: null });
  expect(await updatePasswordAction({}, data)).toEqual({
    error: "That link has expired. Ask for a new password reset email.",
  });
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "test-user" } } });
  auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
  expect(await updatePasswordAction({}, data)).toEqual({
    error: "That is already your password. Choose a different one.",
  });
  auth.updateUser.mockResolvedValue({ error: null });
  expect(await updatePasswordAction({}, data)).toEqual({ done: true });
});

it("says which field a sign-in is missing or has wrong, under that field", async () => {
  expect(await signInAction({}, form({ email: "", password: "x" }))).toEqual({
    error: "Enter your email.",
    field: "email",
  });
  expect(await signInAction({}, form({ email: "vinit", password: "x" }))).toEqual({
    error: "Enter a valid email address, such as name@example.com.",
    field: "email",
  });
  expect(await signInAction({}, form({ email: "vinit@example.test", password: "" }))).toEqual({
    error: "Enter your password.",
    field: "password",
  });
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
});
