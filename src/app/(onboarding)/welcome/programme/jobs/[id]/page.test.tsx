import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SetupJobPage from "./page";

const mocks = vi.hoisted(() => ({
  job: {
    id: "00000000-0000-4000-8000-000000000001",
    status: "succeeded",
    error: null as string | null,
    result: { outcome: "no_change", rationale: "Your current plan still fits your goals." },
  },
}));
vi.mock("@/server/auth", () => ({
  requireProfiledUser: async () => ({ id: "athlete" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ preferredUnit: "kg" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async () => ({
    job: mocks.job,
    draftId: null,
    intake: null,
    state: { experience: "experienced" },
  }),
}));
vi.mock("@/server/queries/setup-state", () => ({
  readSetupState: vi.fn(),
  setupStepsOf: () => [],
}));
vi.mock("@/server/repositories/coaching-jobs", () => ({
  getCoachJob: vi.fn(),
  asReconciledJob: (job: unknown) => job,
  isExpiredClaim: () => false,
}));
vi.mock("@/server/coach-tidy", () => ({ tidyCoachJobsLater: vi.fn() }));
vi.mock("@/server/actions/profile", () => ({ completeOnboardingAction: vi.fn() }));
vi.mock("@/components/coaching/job-status", () => ({ CoachQuestions: () => null }));
vi.mock("./refresh-while-writing", () => ({ RefreshWhileWriting: () => null }));
vi.mock("../../../onboarding-frame", () => ({
  OnboardingFrame: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/ui/form", () => ({
  SubmitButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

beforeEach(() => {
  mocks.job.status = "succeeded";
  mocks.job.error = null;
});

it("shows a successful unchanged programme without suggesting that the coach failed", async () => {
  const markup = renderToStaticMarkup(
    await SetupJobPage({ params: Promise.resolve({ id: mocks.job.id }) }),
  );
  expect(markup).toContain("Your programme stays as it is");
  expect(markup).toContain("Your current plan still fits your goals.");
  expect(markup).toContain("Open Today");
  expect(markup).not.toContain("The coach could not finish");
  expect(markup).not.toContain("Try again");
});

it("keeps the retry action for an unsuccessful request, the coach's own words under Details", async () => {
  mocks.job.status = "failed";
  mocks.job.error = "The local audit worker was unavailable.";
  const markup = renderToStaticMarkup(
    await SetupJobPage({ params: Promise.resolve({ id: mocks.job.id }) }),
  );
  expect(markup).toContain("The coach could not finish");
  expect(markup).toContain("Your answers are saved.");
  // Said in the athlete's words; what the worker wrote is folded, closed, for whoever runs it.
  expect(markup).toMatch(
    /<details[^>]*>(?:(?!<\/details>).)*The local audit worker was unavailable\./s,
  );
  expect(markup).not.toMatch(/<details[^>]* open/);
  expect(markup).toContain("Try again");
  expect(markup).not.toContain("Your current plan still fits your goals.");
});
