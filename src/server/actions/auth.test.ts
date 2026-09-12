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
    confirmPassword: "Example-password-1!",
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
        data: { display_name: "Sam" },
        emailRedirectTo: "http://localhost:3010/auth/confirm",
      },
    }),
  );
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
