import { beforeEach, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/server/validation/form";

const USER = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({ saveCheckIn: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: (_db: unknown, _userId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: USER }) }));
vi.mock("@/server/repositories/sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/sessions")>()),
  saveCheckIn: mocks.saveCheckIn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveCheckInAction } from "./sessions";

beforeEach(() => vi.clearAllMocks());

it("writes only what the check-in asks, so an energy answered before it was retired is left alone", async () => {
  const form = new FormData();
  form.set("sleepHours", "7");
  form.set("fatigue", "2");
  // A page cached from before the change could still post it. It is not written either way.
  form.set("energy", "4");
  await saveCheckInAction(SESSION, INITIAL_FORM_STATE, form);
  expect(mocks.saveCheckIn).toHaveBeenCalledTimes(1);
  expect(mocks.saveCheckIn).toHaveBeenCalledWith(expect.anything(), USER, SESSION, {
    sleepHours: 7,
    sleepQuality: null,
    fatigue: 2,
    soreness: null,
  });
});
