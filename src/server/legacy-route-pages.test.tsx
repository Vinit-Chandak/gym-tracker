import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  gate: vi.fn(),
  activity: vi.fn(),
  occurrence: vi.fn(),
  tx: {},
  database: {},
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/server/auth", () => ({ requireOnboardedUser: mock.gate }));
vi.mock("@/server/legacy-routes", () => ({
  activityForLegacyRun: mock.activity,
  occurrenceForLegacyPlannedRun: mock.occurrence,
}));
vi.mock("@/db/client", () => ({ getDb: () => mock.database }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _user: string, work: (tx: object) => unknown) => work(mock.tx),
}));
vi.mock("@/components/activities/legacy-unavailable", () => ({ LegacyUnavailable: () => null }));

import RunsPage from "@/app/(legacy)/runs/page";
import RunPage from "@/app/(legacy)/runs/[runId]/page";
import EditRunPage from "@/app/(legacy)/runs/[runId]/edit/page";
import NewRunPage from "@/app/(legacy)/runs/new/page";
import { LegacyUnavailable } from "@/components/activities/legacy-unavailable";

const user = { id: "owner", email: "owner@example.test" };
const runId = "c593d732-bf50-4b30-92ba-a89c05d8eb9b";
const activityId = "8375b827-a79a-4fd3-9112-84d7b32b82a1";
const runProps = (id = runId) => ({
  params: Promise.resolve({ runId: id }),
  searchParams: Promise.resolve({}),
});
const newProps = (planned?: string) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve({ planned }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mock.gate.mockResolvedValue(user);
  mock.activity.mockResolvedValue(activityId);
  mock.occurrence.mockResolvedValue("exact-occurrence");
});

describe("compatibility pages outside the app shell", () => {
  it.each([
    ["index", () => RunsPage()],
    ["new", () => NewRunPage(newProps("saved-plan"))],
    ["detail", () => RunPage(runProps())],
    ["edit", () => EditRunPage(runProps())],
  ] as const)(
    "%s keeps the onboarding gate before any lookup or destination redirect",
    async (_name, open) => {
      mock.gate.mockRejectedValue(new Error("redirect:/welcome"));
      await expect(open()).rejects.toThrow("redirect:/welcome");
      expect(mock.activity).not.toHaveBeenCalled();
      expect(mock.occurrence).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["detail", RunPage, ""],
    ["edit", EditRunPage, "/edit"],
  ] as const)(
    "%s redirects to exactly the current owner's mapped activity",
    async (_name, open, suffix) => {
      await expect(open(runProps())).rejects.toThrow(
        `redirect:/training/activities/${activityId}${suffix}`,
      );
      expect(mock.activity).toHaveBeenCalledExactlyOnceWith(mock.tx, user.id, runId);
    },
  );

  it.each([RunPage, EditRunPage])(
    "unmapped run returns the unavailable page without guessing",
    async (open) => {
      mock.activity.mockResolvedValue(null);
      expect((await open(runProps())).type).toBe(LegacyUnavailable);
    },
  );

  it.each([RunPage, EditRunPage])(
    "invalid run identifier is a 404 without a database lookup",
    async (open) => {
      await expect(open(runProps("not-a-uuid"))).rejects.toThrow("not-found");
      expect(mock.activity).not.toHaveBeenCalled();
    },
  );

  it("keeps the exact planned-run mapping and rejects unavailable plans", async () => {
    await expect(NewRunPage(newProps("saved-plan"))).rejects.toThrow(
      "redirect:/training/new?occurrence=exact-occurrence",
    );
    expect(mock.occurrence).toHaveBeenCalledExactlyOnceWith(mock.tx, user.id, "saved-plan");
    mock.occurrence.mockResolvedValue(null);
    expect((await NewRunPage(newProps("missing-plan"))).type).toBe(LegacyUnavailable);
  });

  it("retains the simple aliases after the onboarding gate", async () => {
    await expect(RunsPage()).rejects.toThrow("redirect:/training");
    await expect(NewRunPage(newProps())).rejects.toThrow("redirect:/training/new?sport=running");
    expect(mock.gate).toHaveBeenCalledTimes(2);
    expect(mock.occurrence).not.toHaveBeenCalled();
  });
});
