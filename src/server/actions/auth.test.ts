import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: async () => "http://localhost:3010" }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { requestPasswordResetAction, updatePasswordAction } from "./auth";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
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
