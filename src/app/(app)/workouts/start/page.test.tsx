import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import StartPage from "./page";

const GYM = "00000000-0000-4000-8000-0000000000a1";
const LOWER = "00000000-0000-4000-8000-0000000000d1";
const EASY_RUN = "00000000-0000-4000-8000-0000000000d2";

vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: "athlete" }) }));
vi.mock("@/server/queries/active-session", () => ({ getActiveSession: async () => null }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/recovery-history", () => ({ lastSleepHours: async () => null }));
vi.mock("@/server/repositories/schedule", () => ({
  getSchedule: async () => ({
    days: [
      { id: LOWER, dayIndex: 1, name: "Lower", includesLifting: true, includesRun: false },
      { id: EASY_RUN, dayIndex: 2, name: "Easy run", includesLifting: false, includesRun: true },
    ],
  }),
}));
vi.mock("@/server/actions/sessions", () => ({ startSessionAction: vi.fn() }));
vi.mock("@/components/shell/session-page", () => ({
  SessionPage: ({ meta, children }: { meta: string; children: ReactNode }) => (
    <main>
      <p>{meta}</p>
      {children}
    </main>
  ),
}));
vi.mock("../check-in-form", () => ({ CheckInForm: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const open = (day: string, index: number) =>
  StartPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ gym: GYM, day, index: String(index) }),
  } as unknown as Parameters<typeof StartPage>[0]);

it("asks how you are before a day's workout", async () => {
  expect(renderToStaticMarkup(await open(LOWER, 1))).toContain("Before Lower · Optional");
});

/**
 * Started from a rest day's card, a day that only runs led here, and the check-in it showed
 * went back to Today with nothing started: such a day has no workout to start.
 */
it("goes back to Today for a day with no workout to start", async () => {
  await expect(open(EASY_RUN, 2)).rejects.toThrow("redirect:/today");
});
