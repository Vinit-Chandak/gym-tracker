import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/server/auth", () => auth);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

import ProgrammeDayPage, { generateMetadata } from "./page";

const DAY = "11111111-1111-4111-8111-111111111111";
const props = (sport: string) =>
  ({
    params: Promise.resolve({ sport, dayId: DAY }),
  }) as unknown as PageProps<"/plan/[sport]/days/[dayId]">;

beforeEach(() => auth.requireUser.mockReset());

/**
 * A programme day is the strength programme's (`/plan/strength/days/[dayId]`): a run, ride or
 * swim programme has dated sessions, each with its own page, so any other sport has no days and
 * nothing is read for it.
 */
it.each(["running", "cycling", "swimming", "rowing"])("has no days for %s", async (sport) => {
  await expect(ProgrammeDayPage(props(sport))).rejects.toThrow("not-found");
  expect(await generateMetadata(props(sport))).toEqual({ title: "Not found" });
  expect(auth.requireUser).not.toHaveBeenCalled();
});
