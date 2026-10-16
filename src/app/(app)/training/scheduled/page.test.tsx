import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import TrainingPage from "../page";
import ScheduledPage from "./page";

const mocks = vi.hoisted(() => ({ enabled: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => "/training/scheduled",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "jordan@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/server/queries/active-session", () => ({ getActiveSession: async () => null }));
vi.mock("@/server/queries/reference", () => ({ sharedWarmupProtocols: async () => [] }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/occurrences", () => ({
  standaloneSchedule: async () => ({ upcoming: [], earlier: [] }),
}));
vi.mock("@/server/repositories/schedule", () => ({ getProgramOverview: async () => null }));
vi.mock("@/server/repositories/sport-programmes", () => ({ programmeCards: async () => [] }));
vi.mock("@/components/coaching/saved-work", () => ({ SavedProgrammeWork: () => null }));
vi.mock("@/server/queries/set-changes", () => ({ seenSetChanges: async () => 0 }));
vi.mock("@/components/fresh-after-sets", () => ({
  FreshAfterSets: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/server/repositories/sport-preferences", () => ({
  enabledSportsFor: async () => mocks.enabled,
  unitsBySport: async () => ({}),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} aria-label={(rest as { "aria-label"?: string })["aria-label"]}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

it("offers scheduling only to an athlete with a run, ride or swim on", async () => {
  // Jordan only lifts: Schedule an activity offered running, cycling and swimming, all off.
  mocks.enabled = ["strength"];
  const lifter = renderToStaticMarkup(await ScheduledPage());
  expect(lifter).toContain("Nothing scheduled by you");
  expect(lifter).not.toContain('href="/training/schedule"');
  const training = renderToStaticMarkup(await TrainingPage());
  expect(training).not.toContain('href="/training/schedule"');
  expect(training).toContain('href="/training/scheduled"');

  mocks.enabled = ["strength", "running"];
  expect(renderToStaticMarkup(await ScheduledPage())).toContain('href="/training/schedule"');
  const hub = renderToStaticMarkup(await TrainingPage());
  for (const sport of ["strength", "running", "cycling", "swimming"])
    expect(hub).toContain(`href="/training/log?sport=${sport}"`);
  expect(hub).not.toContain("No running programme");
});
