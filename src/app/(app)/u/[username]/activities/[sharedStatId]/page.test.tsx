import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import SharedActivityPage from "./page";

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "kenji@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ preferredUnit: "kg", timeZone: "Asia/Tokyo" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/people", () => ({
  getDirectoryProfile: async () => ({
    id: "aarav",
    username: "aarav",
    displayName: "Aarav Sharma",
  }),
}));
vi.mock("@/server/repositories/shared-stats", () => ({
  canViewTraining: async () => true,
  readSharedActivity: async () => ({
    id: "71d044bb-19dd-4714-88d6-a0c07857bdc2",
    sport: "workout",
    title: "Push A",
    occurredOn: "2026-10-10",
    durationSeconds: 3600,
    workingSets: 14,
    volumeKg: 6200,
    distanceMeters: null,
    paceSecondsPerKm: null,
  }),
  readSharedSessionExercises: async () => [],
  readDistanceUnits: async () => ({ running: "km", cycling: "km", swimming: "m" }),
}));
// The summary has its own tests; this page's own part is its header.
vi.mock("@/components/activities/activity-summary", () => ({ ActivitySummary: () => null }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ backHref, backLabel }: { backHref: string; backLabel?: string }) => (
    <a className="back-link" href={backHref}>
      {backLabel ?? "no label"}
    </a>
  ),
}));

/**
 * Year audit, October 2026: a friend's shared workout went back to their page as "People", the
 * name of the list you follow them from. Back names their page as it is titled: their name.
 */
it("goes back to the person's page by their name", async () => {
  const html = renderToStaticMarkup(
    await SharedActivityPage({
      params: Promise.resolve({
        username: "aarav",
        sharedStatId: "71d044bb-19dd-4714-88d6-a0c07857bdc2",
      }),
      searchParams: Promise.resolve({}),
    } as PageProps<"/u/[username]/activities/[sharedStatId]">),
  );
  expect(html).toContain('<a class="back-link" href="/u/aarav">Aarav Sharma</a>');
});
