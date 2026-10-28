import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteActivity: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/server/repositories/activities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/activities")>()),
  deleteActivity: mocks.deleteActivity,
}));

import { deleteActivityAction } from "./activities";

/** The session Liam's run of 14 February answered. */
const SESSION = "7550772c-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.deleteActivity.mockResolvedValue({ occurrenceId: SESSION, sport: "running" });
});

it("goes to History from the run's own page", async () => {
  await expect(deleteActivityAction("run")).rejects.toThrow("redirect:/progress/history");
});

/** Owner, 28 October 2026: deleted where it is read under its plan, it goes back there. */
it("goes back to the planned session it was deleted from, to be logged again", async () => {
  await expect(deleteActivityAction("run", "session")).rejects.toThrow(
    `redirect:/plan/sessions/${SESSION}`,
  );
});

it("goes back to Plan from a session when the run answered none", async () => {
  mocks.deleteActivity.mockResolvedValue({ occurrenceId: null, sport: "running" });
  await expect(deleteActivityAction("run", "session")).rejects.toThrow("redirect:/plan");
});

it("takes an undone log back to the tab it was logged from, or Today", async () => {
  await expect(deleteActivityAction("run", "history")).rejects.toThrow(
    "redirect:/progress/history",
  );
  await expect(deleteActivityAction("run", null)).rejects.toThrow("redirect:/today");
  // An origin nobody offers is no origin.
  await expect(deleteActivityAction("run", "https://elsewhere.test")).rejects.toThrow(
    "redirect:/today",
  );
});
