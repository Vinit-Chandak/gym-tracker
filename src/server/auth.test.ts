import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claims: vi.fn(), profile: vi.fn(), entry: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/jwks", () => ({ getClaimsOptions: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: mocks.claims } }),
}));
vi.mock("@/server/queries/request-profile", () => ({ getRequestProfile: mocks.profile }));
// Where an unfinished setup resumes is decided in its own module, and tested there.
vi.mock("@/server/queries/onboarding-entry", () => ({ onboardingEntry: mocks.entry }));

import { requireOnboardedUser, requireProfiledUser } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({
    data: {
      claims: {
        sub: "new-athlete",
        email: "new@example.test",
        user_metadata: { display_name: "Signup name" },
      },
    },
    error: null,
  });
  mocks.entry.mockResolvedValue("/welcome");
  mocks.profile.mockResolvedValue({
    onboardedAt: null,
    displayName: null,
    bodyWeightKg: null,
    heightCm: null,
    dateOfBirth: null,
    trainingGoal: null,
    preferredUnit: "kg",
    timeZone: "UTC",
  });
});

it("lets a new athlete reach gym and programme setup without optional body or coaching details", async () => {
  expect(await requireProfiledUser()).toMatchObject({
    id: "new-athlete",
    displayName: "Signup name",
  });
  expect(mocks.profile).toHaveBeenCalledWith("new-athlete", "new@example.test", "Signup name");
  await expect(requireOnboardedUser()).rejects.toThrow("redirect:/welcome");
});

it("sends an unfinished setup back to the step it had reached, not to the start", async () => {
  mocks.entry.mockResolvedValue("/welcome/programme");
  await expect(requireOnboardedUser()).rejects.toThrow("redirect:/welcome/programme");
});

it("still requires verified authentication before creating or reading a profile", async () => {
  mocks.claims.mockResolvedValue({ data: null, error: new Error("invalid token") });
  await expect(requireProfiledUser()).rejects.toThrow("redirect:/login");
  expect(mocks.profile).not.toHaveBeenCalled();
});
