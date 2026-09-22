import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: "user" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { rescheduleOccurrenceAction, scheduleActivityAction } from "./occurrences";
beforeEach(() => vi.clearAllMocks());
it("rejects impossible dates and times before opening a transaction", async () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-00-00"]) {
    const data = new FormData();
    data.set("scheduledOn", date);
    data.set("sport", "running");
    expect((await scheduleActivityAction({}, data)).fieldErrors?.scheduledOn).toBeDefined();
    expect(
      (await rescheduleOccurrenceAction("occurrence", {}, data)).fieldErrors?.scheduledOn,
    ).toBeDefined();
  }
  for (const time of ["24:00", "12:99", "99:99"]) {
    const data = new FormData();
    data.set("scheduledOn", "2026-09-22");
    data.set("sport", "running");
    data.set("scheduledLocalTime", time);
    expect((await scheduleActivityAction({}, data)).fieldErrors?.scheduledLocalTime).toBeDefined();
  }
  expect(mocks.getDb).not.toHaveBeenCalled();
});
